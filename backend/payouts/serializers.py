from __future__ import annotations

from rest_framework import serializers

from payouts.models import Merchant, Payout, Transaction


class PayoutCreateRequestSerializer(serializers.Serializer):
    merchant_id = serializers.IntegerField(min_value=1)
    amount_paise = serializers.IntegerField(min_value=1)
    bank_account_id = serializers.CharField(max_length=64)


class TransferCreateRequestSerializer(serializers.Serializer):
    source_merchant_id = serializers.IntegerField(min_value=1)
    destination_merchant_id = serializers.IntegerField(min_value=1)
    amount_paise = serializers.IntegerField(min_value=1)
    note = serializers.CharField(required=False, allow_blank=True, max_length=255)


class PayoutReadSerializer(serializers.ModelSerializer):
    class Meta:
        model = Payout
        fields = [
            "id",
            "merchant_id",
            "amount_paise",
            "bank_account_id",
            "idempotency_key",
            "status",
            "retry_count",
            "last_retry_at",
            "failure_reason",
            "refunded",
            "created_at",
            "updated_at",
        ]


class MerchantBalanceSerializer(serializers.Serializer):
    merchant_id = serializers.IntegerField()
    available_balance_paise = serializers.IntegerField()
    held_balance_paise = serializers.IntegerField()
    credits_total_paise = serializers.IntegerField()
    debits_total_paise = serializers.IntegerField()


class MerchantReadSerializer(serializers.ModelSerializer):
    class Meta:
        model = Merchant
        fields = ["id", "name", "email", "cached_balance_paise"]


class TransactionReadSerializer(serializers.ModelSerializer):
    class Meta:
        model = Transaction
        fields = [
            "id",
            "merchant_id",
            "amount_paise",
            "direction",
            "reference_type",
            "reference_id",
            "description",
            "created_at",
        ]
