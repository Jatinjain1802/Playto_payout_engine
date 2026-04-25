from __future__ import annotations

import hashlib
import json
import uuid
from dataclasses import dataclass
from datetime import timedelta
from typing import Any

from django.conf import settings
from django.db import transaction
from django.db.models import BigIntegerField, Q, Sum, Value
from django.db.models.functions import Coalesce
from django.utils import timezone

from payouts.models import IdempotencyRecord, Merchant, Payout, Transaction


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
    bank_account_id: str,
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


def calculate_available_balance_paise(merchant_id: int) -> int:
    totals = calculate_ledger_totals(merchant_id)
    return totals["credits"] - totals["debits"]


def calculate_held_balance_paise(merchant_id: int) -> int:
    held = Payout.objects.filter(
        merchant_id=merchant_id,
        status__in=[Payout.Status.PENDING, Payout.Status.PROCESSING],
    ).aggregate(
        total=Coalesce(Sum("amount_paise", output_field=BigIntegerField()), Value(0))
    )["total"]
    return int(held or 0)


def update_cached_balance(merchant_id: int) -> int:
    balance = calculate_available_balance_paise(merchant_id)
    Merchant.objects.filter(id=merchant_id).update(cached_balance_paise=balance)
    return balance


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
    bank_account_id: str,
    idempotency_key: uuid.UUID,
) -> PayoutCreateResult:
    if amount_paise <= 0:
        return PayoutCreateResult(
            status_code=400,
            payload={"detail": "amount_paise must be greater than 0."},
        )
    if not bank_account_id.strip():
        return PayoutCreateResult(
            status_code=400,
            payload={"detail": "bank_account_id is required."},
        )

    now = timezone.now()
    idempotency_ttl = timedelta(hours=settings.IDEMPOTENCY_TTL_HOURS)
    fingerprint = build_request_fingerprint(
        merchant_id=merchant_id,
        amount_paise=amount_paise,
        bank_account_id=bank_account_id.strip(),
    )
    created_payout_id: uuid.UUID | None = None

    with transaction.atomic():
        try:
            merchant = Merchant.objects.select_for_update().get(id=merchant_id)
        except Merchant.DoesNotExist:
            return PayoutCreateResult(
                status_code=404,
                payload={"detail": "Merchant not found."},
            )
        idempotency_record = (
            IdempotencyRecord.objects.select_for_update()
            .filter(merchant=merchant, key=idempotency_key)
            .first()
        )

        if idempotency_record:
            if idempotency_record.expires_at <= now:
                idempotency_record.delete()
                idempotency_record = None
            else:
                if idempotency_record.request_fingerprint != fingerprint:
                    return PayoutCreateResult(
                        status_code=409,
                        payload={
                            "detail": "Idempotency-Key already used with different payload."
                        },
                    )
                if idempotency_record.is_completed:
                    return PayoutCreateResult(
                        status_code=int(idempotency_record.response_status_code),
                        payload=dict(idempotency_record.response_body),
                        replayed=True,
                    )
                return PayoutCreateResult(
                    status_code=409,
                    payload={"detail": "Request with this Idempotency-Key is in progress."},
                )

        if idempotency_record is None:
            idempotency_record = IdempotencyRecord.objects.create(
                merchant=merchant,
                key=idempotency_key,
                request_fingerprint=fingerprint,
                expires_at=now + idempotency_ttl,
            )

        available_balance = calculate_available_balance_paise(merchant.id)
        if available_balance < amount_paise:
            payload = {
                "detail": "Insufficient balance.",
                "available_balance_paise": available_balance,
            }
            idempotency_record.response_status_code = 400
            idempotency_record.response_body = payload
            idempotency_record.save(update_fields=["response_status_code", "response_body"])
            return PayoutCreateResult(status_code=400, payload=payload)

        payout = Payout.objects.create(
            merchant=merchant,
            amount_paise=amount_paise,
            bank_account_id=bank_account_id.strip(),
            idempotency_key=idempotency_key,
            status=Payout.Status.PENDING,
        )
        Transaction.objects.create(
            merchant=merchant,
            direction=Transaction.Direction.DEBIT,
            amount_paise=amount_paise,
            reference_type=Transaction.ReferenceType.PAYOUT,
            reference_id=str(payout.id),
            description="Payout initiated and amount held.",
        )
        available_after_debit = available_balance - amount_paise
        merchant.cached_balance_paise = available_after_debit
        merchant.save(update_fields=["cached_balance_paise", "updated_at"])

        payload = serialize_payout(payout, available_after_debit)
        idempotency_record.response_status_code = 201
        idempotency_record.response_body = payload
        idempotency_record.payout = payout
        idempotency_record.save(
            update_fields=["response_status_code", "response_body", "payout"]
        )
        created_payout_id = payout.id

    if created_payout_id is not None:
        from payouts.tasks import process_payout_task

        process_payout_task.delay(str(created_payout_id))

    return PayoutCreateResult(status_code=201, payload=payload)


def create_transfer(
    *,
    source_merchant_id: int,
    destination_merchant_id: int,
    amount_paise: int,
    idempotency_key: uuid.UUID,
    note: str = "",
) -> TransferCreateResult:
    normalized_note = note.strip()
    if amount_paise <= 0:
        return TransferCreateResult(
            status_code=400,
            payload={"detail": "amount_paise must be greater than 0."},
        )
    if source_merchant_id == destination_merchant_id:
        return TransferCreateResult(
            status_code=400,
            payload={"detail": "Source and destination merchant must be different."},
        )

    now = timezone.now()
    idempotency_ttl = timedelta(hours=settings.IDEMPOTENCY_TTL_HOURS)
    fingerprint = build_transfer_request_fingerprint(
        source_merchant_id=source_merchant_id,
        destination_merchant_id=destination_merchant_id,
        amount_paise=amount_paise,
        note=normalized_note,
    )

    with transaction.atomic():
        locked_merchants = list(
            Merchant.objects.select_for_update()
            .filter(id__in=[source_merchant_id, destination_merchant_id])
            .order_by("id")
        )
        if len(locked_merchants) != 2:
            return TransferCreateResult(
                status_code=404,
                payload={"detail": "Source or destination merchant not found."},
            )

        merchant_map = {merchant.id: merchant for merchant in locked_merchants}
        source_merchant = merchant_map[source_merchant_id]
        destination_merchant = merchant_map[destination_merchant_id]

        idempotency_record = (
            IdempotencyRecord.objects.select_for_update()
            .filter(merchant=source_merchant, key=idempotency_key)
            .first()
        )

        if idempotency_record:
            if idempotency_record.expires_at <= now:
                idempotency_record.delete()
                idempotency_record = None
            else:
                if idempotency_record.request_fingerprint != fingerprint:
                    return TransferCreateResult(
                        status_code=409,
                        payload={
                            "detail": "Idempotency-Key already used with different payload."
                        },
                    )
                if idempotency_record.is_completed:
                    return TransferCreateResult(
                        status_code=int(idempotency_record.response_status_code),
                        payload=dict(idempotency_record.response_body),
                        replayed=True,
                    )
                return TransferCreateResult(
                    status_code=409,
                    payload={"detail": "Request with this Idempotency-Key is in progress."},
                )

        if idempotency_record is None:
            idempotency_record = IdempotencyRecord.objects.create(
                merchant=source_merchant,
                key=idempotency_key,
                request_fingerprint=fingerprint,
                expires_at=now + idempotency_ttl,
            )

        source_available_balance = calculate_available_balance_paise(source_merchant.id)
        if source_available_balance < amount_paise:
            payload = {
                "detail": "Insufficient balance in source merchant account.",
                "available_balance_paise": source_available_balance,
            }
            idempotency_record.response_status_code = 400
            idempotency_record.response_body = payload
            idempotency_record.save(update_fields=["response_status_code", "response_body"])
            return TransferCreateResult(status_code=400, payload=payload)

        destination_available_balance = calculate_available_balance_paise(destination_merchant.id)
        transfer_reference = f"transfer:{uuid.uuid4()}"
        transfer_note = normalized_note or "Internal merchant transfer"

        Transaction.objects.create(
            merchant=source_merchant,
            direction=Transaction.Direction.DEBIT,
            amount_paise=amount_paise,
            reference_type=Transaction.ReferenceType.ADJUSTMENT,
            reference_id=transfer_reference,
            description=f"{transfer_note} (to merchant #{destination_merchant.id})",
        )
        Transaction.objects.create(
            merchant=destination_merchant,
            direction=Transaction.Direction.CREDIT,
            amount_paise=amount_paise,
            reference_type=Transaction.ReferenceType.ADJUSTMENT,
            reference_id=transfer_reference,
            description=f"{transfer_note} (from merchant #{source_merchant.id})",
        )

        source_after = source_available_balance - amount_paise
        destination_after = destination_available_balance + amount_paise
        source_merchant.cached_balance_paise = source_after
        destination_merchant.cached_balance_paise = destination_after
        source_merchant.save(update_fields=["cached_balance_paise", "updated_at"])
        destination_merchant.save(update_fields=["cached_balance_paise", "updated_at"])

        payload = {
            "reference_id": transfer_reference,
            "source_merchant_id": source_merchant.id,
            "destination_merchant_id": destination_merchant.id,
            "amount_paise": amount_paise,
            "source_available_balance_paise": source_after,
            "destination_available_balance_paise": destination_after,
            "note": normalized_note,
            "created_at": now.isoformat(),
        }
        idempotency_record.response_status_code = 201
        idempotency_record.response_body = payload
        idempotency_record.save(update_fields=["response_status_code", "response_body"])

    return TransferCreateResult(status_code=201, payload=payload)


def mark_payout_completed(payout_id: str) -> None:
    with transaction.atomic():
        payout = Payout.objects.select_for_update().get(id=payout_id)
        if payout.status in {Payout.Status.COMPLETED, Payout.Status.FAILED}:
            return
        if payout.status != Payout.Status.PROCESSING:
            return
        payout.transition_to(Payout.Status.COMPLETED)
        payout.save(update_fields=["status", "updated_at"])


def mark_payout_failed(payout_id: str, reason: str) -> None:
    with transaction.atomic():
        payout = Payout.objects.select_for_update().select_related("merchant").get(id=payout_id)
        merchant = Merchant.objects.select_for_update().get(id=payout.merchant_id)
        if payout.status in {Payout.Status.COMPLETED, Payout.Status.FAILED}:
            return
        if payout.status != Payout.Status.PROCESSING:
            return
        payout.transition_to(Payout.Status.FAILED)
        payout.failure_reason = reason
        if not payout.refunded:
            Transaction.objects.create(
                merchant=merchant,
                direction=Transaction.Direction.CREDIT,
                amount_paise=payout.amount_paise,
                reference_type=Transaction.ReferenceType.REFUND,
                reference_id=str(payout.id),
                description="Payout failed, funds refunded.",
            )
            payout.refunded = True
        payout.save(update_fields=["status", "failure_reason", "refunded", "updated_at"])
        merchant.cached_balance_paise = calculate_available_balance_paise(merchant.id)
        merchant.save(update_fields=["cached_balance_paise", "updated_at"])
