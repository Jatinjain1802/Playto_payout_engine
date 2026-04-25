from django.contrib import admin

from payouts.models import IdempotencyRecord, Merchant, Payout, Transaction


@admin.register(Merchant)
class MerchantAdmin(admin.ModelAdmin):
    list_display = ("id", "name", "email", "cached_balance_paise", "created_at")
    search_fields = ("name", "email")


@admin.register(Transaction)
class TransactionAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "merchant",
        "direction",
        "amount_paise",
        "reference_type",
        "reference_id",
        "created_at",
    )
    list_filter = ("direction", "reference_type")
    search_fields = ("merchant__name", "merchant__email", "reference_id")


@admin.register(Payout)
class PayoutAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "merchant",
        "amount_paise",
        "status",
        "retry_count",
        "refunded",
        "created_at",
    )
    list_filter = ("status", "refunded")
    search_fields = ("merchant__name", "merchant__email", "bank_account_id")


@admin.register(IdempotencyRecord)
class IdempotencyRecordAdmin(admin.ModelAdmin):
    list_display = ("id", "merchant", "key", "expires_at", "response_status_code", "created_at")
    list_filter = ("expires_at",)
    search_fields = ("merchant__name", "merchant__email", "key")
