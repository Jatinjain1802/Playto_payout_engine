from django.contrib import admin
from payouts.models import IdempotencyRecord, Payout

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
    search_fields = ("merchant__name", "merchant__email")

@admin.register(IdempotencyRecord)
class IdempotencyRecordAdmin(admin.ModelAdmin):
    list_display = ("id", "merchant", "key", "expires_at", "response_status_code", "created_at")
    list_filter = ("expires_at",)
    search_fields = ("merchant__name", "merchant__email", "key")
