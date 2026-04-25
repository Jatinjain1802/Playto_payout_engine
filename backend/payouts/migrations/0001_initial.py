# Generated manually for initial schema.

import uuid

from django.core.validators import MinValueValidator
from django.db import migrations, models
import django.db.models.deletion
from django.db.models import Q


class Migration(migrations.Migration):
    initial = True

    dependencies = []

    operations = [
        migrations.CreateModel(
            name="Merchant",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("name", models.CharField(max_length=120)),
                ("email", models.EmailField(max_length=254, unique=True)),
                ("cached_balance_paise", models.BigIntegerField(default=0)),
            ],
        ),
        migrations.CreateModel(
            name="Payout",
            fields=[
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("amount_paise", models.BigIntegerField(validators=[MinValueValidator(1)])),
                ("bank_account_id", models.CharField(max_length=64)),
                ("idempotency_key", models.UUIDField()),
                (
                    "status",
                    models.CharField(
                        choices=[
                            ("pending", "Pending"),
                            ("processing", "Processing"),
                            ("completed", "Completed"),
                            ("failed", "Failed"),
                        ],
                        default="pending",
                        max_length=20,
                    ),
                ),
                ("retry_count", models.PositiveSmallIntegerField(default=0)),
                ("last_retry_at", models.DateTimeField(blank=True, null=True)),
                ("failure_reason", models.CharField(blank=True, default="", max_length=255)),
                ("refunded", models.BooleanField(default=False)),
                ("provider_reference", models.CharField(blank=True, default="", max_length=100)),
                (
                    "merchant",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="payouts",
                        to="payouts.merchant",
                    ),
                ),
            ],
            options={
                "indexes": [
                    models.Index(fields=["merchant", "created_at"], name="payouts_pay_merchan_2a647d_idx"),
                    models.Index(fields=["merchant", "status"], name="payouts_pay_merchan_39fd1c_idx"),
                    models.Index(
                        fields=["merchant", "idempotency_key"],
                        name="payouts_pay_merchan_84a500_idx",
                    ),
                ],
                "constraints": [
                    models.CheckConstraint(
                        condition=Q(amount_paise__gt=0),
                        name="payout_amount_positive",
                    )
                ],
            },
        ),
        migrations.CreateModel(
            name="Transaction",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("amount_paise", models.BigIntegerField(validators=[MinValueValidator(1)])),
                (
                    "direction",
                    models.CharField(
                        choices=[("credit", "Credit"), ("debit", "Debit")],
                        max_length=10,
                    ),
                ),
                (
                    "reference_type",
                    models.CharField(
                        choices=[
                            ("payment", "Payment In"),
                            ("payout", "Payout Debit"),
                            ("refund", "Payout Refund"),
                            ("seed", "Seed Credit"),
                            ("adjustment", "Manual Adjustment"),
                        ],
                        max_length=20,
                    ),
                ),
                ("reference_id", models.CharField(blank=True, default="", max_length=100)),
                ("description", models.CharField(blank=True, default="", max_length=255)),
                (
                    "merchant",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="transactions",
                        to="payouts.merchant",
                    ),
                ),
            ],
            options={
                "indexes": [
                    models.Index(
                        fields=["merchant", "created_at"],
                        name="payouts_tra_merchant_527a2d_idx",
                    ),
                    models.Index(
                        fields=["merchant", "reference_type"],
                        name="payouts_tra_merchant_53a8e5_idx",
                    ),
                ],
                "constraints": [
                    models.CheckConstraint(
                        condition=Q(amount_paise__gt=0),
                        name="transaction_amount_positive",
                    )
                ],
            },
        ),
        migrations.CreateModel(
            name="IdempotencyRecord",
            fields=[
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("key", models.UUIDField()),
                ("request_fingerprint", models.CharField(max_length=64)),
                ("response_status_code", models.PositiveSmallIntegerField(blank=True, null=True)),
                ("response_body", models.JSONField(blank=True, null=True)),
                ("expires_at", models.DateTimeField()),
                (
                    "merchant",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="idempotency_records",
                        to="payouts.merchant",
                    ),
                ),
                (
                    "payout",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="idempotency_records",
                        to="payouts.payout",
                    ),
                ),
            ],
            options={
                "indexes": [
                    models.Index(
                        fields=["merchant", "expires_at"],
                        name="payouts_ide_merchant_8b8ca6_idx",
                    )
                ],
                "constraints": [
                    models.UniqueConstraint(
                        fields=("merchant", "key"),
                        name="uniq_idempotency_merchant_key",
                    )
                ],
            },
        ),
    ]
