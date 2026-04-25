from __future__ import annotations
import hashlib
import json
import uuid
from dataclasses import dataclass
from datetime import timedelta
from typing import Any

from django.conf import settings
from django.db import transaction, OperationalError
from django.db.models import BigIntegerField, Q, Sum, Value
from django.db.models.functions import Coalesce
from django.utils import timezone

from ledger.models import Merchant, BankAccount, Transaction
from payouts.models import IdempotencyRecord, Payout

@dataclass(frozen=True)
class PayoutCreateResult:
    status_code: int
    payload: dict[str, Any]
    replayed: bool = False

@dataclass(frozen=True)
class TransferCreateResult:
    status_code: int
    payload: dict[str, Any]
    replayed: bool = False

def build_request_fingerprint(
    *,
    merchant_id: int,
    amount_paise: int,
    bank_account_id: int,
) -> str:
    payload = {
        "merchant_id": merchant_id,
        "amount_paise": amount_paise,
        "bank_account_id": bank_account_id,
    }
    serialized = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(serialized.encode("utf-8")).hexdigest()

def build_transfer_request_fingerprint(
    *,
    source_merchant_id: int,
    destination_merchant_id: int,
    amount_paise: int,
    note: str,
) -> str:
    payload = {
        "source_merchant_id": source_merchant_id,
        "destination_merchant_id": destination_merchant_id,
        "amount_paise": amount_paise,
        "note": note,
    }
    serialized = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(serialized.encode("utf-8")).hexdigest()

def calculate_ledger_totals(merchant_id: int) -> dict[str, int]:
    totals = Transaction.objects.filter(merchant_id=merchant_id).aggregate(
        credits=Coalesce(
            Sum(
                "amount_paise",
                filter=Q(direction=Transaction.Direction.CREDIT),
                output_field=BigIntegerField(),
            ),
            Value(0, output_field=BigIntegerField()),
        ),
        debits=Coalesce(
            Sum(
                "amount_paise",
                filter=Q(direction=Transaction.Direction.DEBIT),
                output_field=BigIntegerField(),
            ),
            Value(0, output_field=BigIntegerField()),
        ),
    )
    return {
        "credits": int(totals["credits"]),
        "debits": int(totals["debits"]),
    }

def calculate_available_balance_paise(merchant_id: int) -> int:
    totals = calculate_ledger_totals(merchant_id)
    return totals["credits"] - totals["debits"]

def calculate_held_balance_paise(merchant_id: int) -> int:
    held = Payout.objects.filter(
        merchant_id=merchant_id,
        status__in=[Payout.Status.PENDING, Payout.Status.PROCESSING],
    ).aggregate(
        total=Coalesce(Sum("amount_paise", output_field=BigIntegerField()), Value(0, output_field=BigIntegerField()))
    )["total"]
    return int(held)

def serialize_payout(payout: Payout, available_balance_paise: int) -> dict[str, Any]:
    return {
        "id": str(payout.id),
        "merchant_id": payout.merchant_id,
        "amount_paise": payout.amount_paise,
        "bank_account_id": payout.bank_account_id,
        "status": payout.status,
        "retry_count": payout.retry_count,
        "created_at": payout.created_at.isoformat(),
        "updated_at": payout.updated_at.isoformat(),
        "available_balance_paise": available_balance_paise,
    }

def create_payout(
    *,
    merchant_id: int,
    amount_paise: int,
    bank_account_id: int,
    idempotency_key: uuid.UUID,
) -> PayoutCreateResult:
    if amount_paise <= 0:
        return PayoutCreateResult(status_code=400, payload={"detail": "amount_paise must be > 0"})

    now = timezone.now()
    idempotency_ttl = timedelta(hours=settings.IDEMPOTENCY_TTL_HOURS)
    fingerprint = build_request_fingerprint(
        merchant_id=merchant_id,
        amount_paise=amount_paise,
        bank_account_id=bank_account_id,
    )

    with transaction.atomic():
        try:
            merchant = Merchant.objects.select_for_update(nowait=True).get(id=merchant_id)
        except Merchant.DoesNotExist:
            return PayoutCreateResult(status_code=404, payload={"detail": "Merchant not found"})
        except OperationalError:
            return PayoutCreateResult(status_code=409, payload={"detail": "Concurrent request in progress"})

        idempotency_record = IdempotencyRecord.objects.select_for_update().filter(
            merchant=merchant, key=idempotency_key
        ).first()

        if idempotency_record:
            if idempotency_record.expires_at <= now:
                idempotency_record.delete()
                idempotency_record = None
            else:
                if idempotency_record.request_fingerprint != fingerprint:
                    return PayoutCreateResult(status_code=409, payload={"detail": "Idempotency key mismatch"})
                if idempotency_record.is_completed:
                    return PayoutCreateResult(
                        status_code=int(idempotency_record.response_status_code),
                        payload=dict(idempotency_record.response_body),
                        replayed=True
                    )
                return PayoutCreateResult(status_code=409, payload={"detail": "Request in progress"})

        if idempotency_record is None:
            idempotency_record = IdempotencyRecord.objects.create(
                merchant=merchant,
                key=idempotency_key,
                request_fingerprint=fingerprint,
                expires_at=now + idempotency_ttl,
            )

        available_balance = calculate_available_balance_paise(merchant.id)
        if available_balance < amount_paise:
            payload = {"detail": "Insufficient balance", "available_balance_paise": available_balance}
            idempotency_record.response_status_code = 400
            idempotency_record.response_body = payload
            idempotency_record.save()
            return PayoutCreateResult(status_code=400, payload=payload)

        try:
            bank_account = BankAccount.objects.get(id=bank_account_id, merchant=merchant)
        except BankAccount.DoesNotExist:
            return PayoutCreateResult(status_code=400, payload={"detail": "Invalid bank account"})

        payout = Payout.objects.create(
            merchant=merchant,
            bank_account=bank_account,
            amount_paise=amount_paise,
            idempotency_key=idempotency_key,
            status=Payout.Status.PENDING,
        )
        
        Transaction.objects.create(
            merchant=merchant,
            direction=Transaction.Direction.DEBIT,
            amount_paise=amount_paise,
            description=f"Hold for payout #{payout.id}",
            payout=payout,
        )

        payload = serialize_payout(payout, available_balance - amount_paise)
        idempotency_record.response_status_code = 201
        idempotency_record.response_body = payload
        idempotency_record.payout = payout
        idempotency_record.save()

    from payouts.tasks import process_payout_task
    process_payout_task.delay(str(payout.id))

    return PayoutCreateResult(status_code=201, payload=payload)

def create_transfer(
    *,
    source_merchant_id: int,
    destination_merchant_id: int,
    amount_paise: int,
    idempotency_key: uuid.UUID,
    note: str = "",
) -> TransferCreateResult:
    if amount_paise <= 0:
        return TransferCreateResult(status_code=400, payload={"detail": "amount_paise must be > 0"})
    
    if source_merchant_id == destination_merchant_id:
        return TransferCreateResult(status_code=400, payload={"detail": "Same source and destination"})

    now = timezone.now()
    idempotency_ttl = timedelta(hours=settings.IDEMPOTENCY_TTL_HOURS)
    fingerprint = build_transfer_request_fingerprint(
        source_merchant_id=source_merchant_id,
        destination_merchant_id=destination_merchant_id,
        amount_paise=amount_paise,
        note=note,
    )

    with transaction.atomic():
        try:
            # Lock both merchants in consistent order to avoid deadlocks
            locked_merchants = list(
                Merchant.objects.select_for_update(nowait=True)
                .filter(id__in=[source_merchant_id, destination_merchant_id])
                .order_by("id")
            )
            if len(locked_merchants) != 2:
                 return TransferCreateResult(status_code=404, payload={"detail": "Merchant(s) not found"})
        except OperationalError:
            return TransferCreateResult(status_code=409, payload={"detail": "Concurrent request in progress"})

        merchant_map = {m.id: m for m in locked_merchants}
        source_merchant = merchant_map[source_merchant_id]
        destination_merchant = merchant_map[destination_merchant_id]

        idempotency_record = IdempotencyRecord.objects.select_for_update().filter(
            merchant=source_merchant, key=idempotency_key
        ).first()

        if idempotency_record:
            if idempotency_record.expires_at <= now:
                idempotency_record.delete()
                idempotency_record = None
            else:
                if idempotency_record.request_fingerprint != fingerprint:
                    return TransferCreateResult(status_code=409, payload={"detail": "Idempotency key mismatch"})
                if idempotency_record.is_completed:
                    return TransferCreateResult(
                        status_code=int(idempotency_record.response_status_code),
                        payload=dict(idempotency_record.response_body),
                        replayed=True
                    )
                return TransferCreateResult(status_code=409, payload={"detail": "Request in progress"})

        if idempotency_record is None:
            idempotency_record = IdempotencyRecord.objects.create(
                merchant=source_merchant,
                key=idempotency_key,
                request_fingerprint=fingerprint,
                expires_at=now + idempotency_ttl,
            )

        source_balance = calculate_available_balance_paise(source_merchant.id)
        if source_balance < amount_paise:
            payload = {"detail": "Insufficient source balance"}
            idempotency_record.response_status_code = 400
            idempotency_record.response_body = payload
            idempotency_record.save()
            return TransferCreateResult(status_code=400, payload=payload)

        # Create both transactions
        Transaction.objects.create(
            merchant=source_merchant,
            direction=Transaction.Direction.DEBIT,
            amount_paise=amount_paise,
            description=f"Transfer to merchant #{destination_merchant.id}: {note}",
        )
        Transaction.objects.create(
            merchant=destination_merchant,
            direction=Transaction.Direction.CREDIT,
            amount_paise=amount_paise,
            description=f"Transfer from merchant #{source_merchant.id}: {note}",
        )

        payload = {
            "source_merchant_id": source_merchant.id,
            "destination_merchant_id": destination_merchant.id,
            "amount_paise": amount_paise,
            "note": note,
            "status": "completed"
        }
        idempotency_record.response_status_code = 201
        idempotency_record.response_body = payload
        idempotency_record.save()

    return TransferCreateResult(status_code=201, payload=payload)

def mark_payout_completed(payout_id: str) -> None:
    with transaction.atomic():
        payout = Payout.objects.select_for_update().get(id=payout_id)
        if payout.status != Payout.Status.PROCESSING:
            return
        payout.transition_to(Payout.Status.COMPLETED)
        payout.save()

def mark_payout_failed(payout_id: str, reason: str) -> None:
    with transaction.atomic():
        payout = Payout.objects.select_for_update().get(id=payout_id)
        if payout.status != Payout.Status.PROCESSING:
            return
        payout.transition_to(Payout.Status.FAILED)
        payout.failure_reason = reason
        if not payout.refunded:
            Transaction.objects.create(
                merchant=payout.merchant,
                direction=Transaction.Direction.CREDIT,
                amount_paise=payout.amount_paise,
                description=f"Refund for failed payout #{payout.id}",
                payout=payout,
            )
            payout.refunded = True
        payout.save()
