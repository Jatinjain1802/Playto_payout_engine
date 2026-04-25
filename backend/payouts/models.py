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

class Payout(TimestampedModel):
    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        PROCESSING = "processing", "Processing"
        COMPLETED = "completed", "Completed"
        FAILED = "failed", "Failed"

    # Legal transitions — source of truth from walkthrough
    ALLOWED_TRANSITIONS = {
        Status.PENDING: [Status.PROCESSING],
        Status.PROCESSING: [Status.COMPLETED, Status.FAILED],
        Status.COMPLETED: [],   # terminal
        Status.FAILED: [],      # terminal
    }

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    merchant = models.ForeignKey(
        'ledger.Merchant',
        on_delete=models.PROTECT,
        related_name="payouts",
    )
    bank_account = models.ForeignKey(
        'ledger.BankAccount',
        on_delete=models.PROTECT,
        related_name="payouts",
    )
    amount_paise = models.BigIntegerField(validators=[MinValueValidator(1)])
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
        """State machine enforcement — call this, never assign .status directly"""
        if target_status == self.status:
            return
        
        allowed = self.ALLOWED_TRANSITIONS.get(self.status, [])
        if target_status not in allowed:
            raise ValidationError(
                f"Illegal transition: {self.status} → {target_status}"
            )
        self.status = target_status
        # Note: Caller should save

    def __str__(self) -> str:
        return f"{self.id}:{self.status}:{self.amount_paise}"

class IdempotencyRecord(TimestampedModel):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    merchant = models.ForeignKey(
        'ledger.Merchant',
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
