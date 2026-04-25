# EXPLAINER - Playto Payout Engine

This file answers the required engineering questions from the assignment.

## 1) The Ledger

### Balance calculation query
```python
def calculate_ledger_totals(merchant_id: int) -> dict[str, int]:
    totals = Transaction.objects.filter(merchant_id=merchant_id).aggregate(
        credits=Coalesce(
            Sum(
                "amount_paise",
                filter=Q(direction=Transaction.Direction.CREDIT),
                output_field=BigIntegerField(),
            ),
            Value(0),
            output_field=BigIntegerField(),
        ),
        debits=Coalesce(
            Sum(
                "amount_paise",
                filter=Q(direction=Transaction.Direction.DEBIT),
                output_field=BigIntegerField(),
            ),
            Value(0),
            output_field=BigIntegerField(),
        ),
    )
    return {
        "credits": int(totals["credits"] or 0),
        "debits": int(totals["debits"] or 0),
    }
```

### Why credits/debits model
- Auditability: every money movement is an append-only ledger event.
- Correctness: available balance is derived from DB aggregates, not mutable in-memory math.
- Refund semantics: failed payouts create explicit credit transactions (`refund`) instead of mutating old rows.

## 2) The Lock

### Exact overdraft-prevention code
```python
with transaction.atomic():
    merchant = Merchant.objects.select_for_update().get(id=merchant_id)
    idempotency_record = (
        IdempotencyRecord.objects.select_for_update()
        .filter(merchant=merchant, key=idempotency_key)
        .first()
    )

    available_balance = calculate_available_balance_paise(merchant.id)
    if available_balance < amount_paise:
        ...

    payout = Payout.objects.create(...)
    Transaction.objects.create(
        merchant=merchant,
        direction=Transaction.Direction.DEBIT,
        amount_paise=amount_paise,
        reference_type=Transaction.ReferenceType.PAYOUT,
        reference_id=str(payout.id),
        description="Payout initiated and amount held.",
    )
```

### DB primitive used
`SELECT ... FOR UPDATE` via Django `select_for_update()` (row-level pessimistic lock). This serializes concurrent payout attempts for the same merchant row inside a transaction.

## 3) The Idempotency

### How key replays are detected
- Table: `IdempotencyRecord` with unique constraint on `(merchant, key)`.
- Payload safety: request fingerprint (`sha256` of merchant_id + amount_paise + bank_account_id).
- TTL: `expires_at` set to now + 24h.

### In-flight behavior
When the second request arrives with same merchant + key:
- If same payload and response already stored: return exact stored response.
- If same payload but response not yet stored (first request still in progress): return `409` with `Request with this Idempotency-Key is in progress.`
- If payload differs: return `409` conflict.

## 4) The State Machine

### Where invalid transitions are blocked
```python
def transition_to(self, target_status: str) -> None:
    allowed_transitions = {
        self.Status.PENDING: {self.Status.PROCESSING},
        self.Status.PROCESSING: {self.Status.COMPLETED, self.Status.FAILED},
        self.Status.COMPLETED: set(),
        self.Status.FAILED: set(),
    }
    if target_status == self.status:
        return
    if target_status not in allowed_transitions[self.status]:
        raise ValidationError(
            f"Invalid payout transition: {self.status} -> {target_status}"
        )
    self.status = target_status
```

`failed -> completed`, `completed -> pending`, and any backward transition are rejected by this check.

## 5) The AI Audit

### Bad AI-generated pattern I rejected
```python
# Incorrect: race-prone check-then-update
merchant = Merchant.objects.get(id=merchant_id)
if merchant.cached_balance_paise >= amount_paise:
    merchant.cached_balance_paise -= amount_paise
    merchant.save()
    Payout.objects.create(...)
```

### Why it is wrong
- No row lock, so concurrent requests can both read same balance and both succeed.
- Uses mutable cached field as source-of-truth instead of ledger aggregate.

### What I replaced it with
- Wrapped payout creation in `transaction.atomic()`.
- Locked merchant row using `select_for_update()`.
- Calculated available balance from ledger aggregate (`credits - debits`) before debit insert.
- Inserted debit transaction + payout creation in same transaction.
