from __future__ import annotations

import uuid

from django.core.exceptions import ValidationError
from django.core.validators import MinValueValidator
from django.db import models
from django.db.models import Q


class TimestampedModel(models.Model):
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


class Merchant(TimestampedModel):
    name = models.CharField(max_length=120)
    email = models.EmailField(unique=True)
    cached_balance_paise = models.BigIntegerField(default=0)

    def __str__(self) -> str:
        return f"{self.name} ({self.email})"


class Transaction(TimestampedModel):
    class Direction(models.TextChoices):
        CREDIT = "credit", "Credit"
        DEBIT = "debit", "Debit"

    class ReferenceType(models.TextChoices):
        PAYMENT = "payment", "Payment In"
        PAYOUT = "payout", "Payout Debit"
        REFUND = "refund", "Payout Refund"
        SEED = "seed", "Seed Credit"
        ADJUSTMENT = "adjustment", "Manual Adjustment"

    merchant = models.ForeignKey(
        Merchant,
        on_delete=models.CASCADE,
        related_name="transactions",
    )
    amount_paise = models.BigIntegerField(validators=[MinValueValidator(1)])
    direction = models.CharField(max_length=10, choices=Direction.choices)
    reference_type = models.CharField(max_length=20, choices=ReferenceType.choices)
    reference_id = models.CharField(max_length=100, blank=True, default="")
    description = models.CharField(max_length=255, blank=True, default="")

    class Meta:
        indexes = [
            models.Index(fields=["merchant", "created_at"]),
            models.Index(fields=["merchant", "reference_type"]),
        ]
        constraints = [
            models.CheckConstraint(
                condition=Q(amount_paise__gt=0),
                name="transaction_amount_positive",
            )
        ]

    def __str__(self) -> str:
        return f"{self.merchant_id}:{self.direction}:{self.amount_paise}"


class Payout(TimestampedModel):
    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        PROCESSING = "processing", "Processing"
        COMPLETED = "completed", "Completed"
        FAILED = "failed", "Failed"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    merchant = models.ForeignKey(
        Merchant,
        on_delete=models.CASCADE,
        related_name="payouts",
    )
    amount_paise = models.BigIntegerField(validators=[MinValueValidator(1)])
    bank_account_id = models.CharField(max_length=64)
    idempotency_key = models.UUIDField()
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)
    retry_count = models.PositiveSmallIntegerField(default=0)
    last_retry_at = models.DateTimeField(null=True, blank=True)
    failure_reason = models.CharField(max_length=255, blank=True, default="")
    refunded = models.BooleanField(default=False)
    provider_reference = models.CharField(max_length=100, blank=True, default="")

    class Meta:
        indexes = [
            models.Index(fields=["merchant", "created_at"]),
            models.Index(fields=["merchant", "status"]),
            models.Index(fields=["merchant", "idempotency_key"]),
        ]
        constraints = [
            models.CheckConstraint(
                condition=Q(amount_paise__gt=0),
                name="payout_amount_positive",
            )
        ]

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

    def __str__(self) -> str:
        return f"{self.id}:{self.status}:{self.amount_paise}"


class IdempotencyRecord(TimestampedModel):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    merchant = models.ForeignKey(
        Merchant,
        on_delete=models.CASCADE,
        related_name="idempotency_records",
    )
    key = models.UUIDField()
    request_fingerprint = models.CharField(max_length=64)
    response_status_code = models.PositiveSmallIntegerField(null=True, blank=True)
    response_body = models.JSONField(null=True, blank=True)
    payout = models.ForeignKey(
        Payout,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="idempotency_records",
    )
    expires_at = models.DateTimeField()

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["merchant", "key"],
                name="uniq_idempotency_merchant_key",
            )
        ]
        indexes = [models.Index(fields=["merchant", "expires_at"])]

    @property
    def is_completed(self) -> bool:
        return self.response_status_code is not None and self.response_body is not None

    def __str__(self) -> str:
        return f"{self.merchant_id}:{self.key}"
