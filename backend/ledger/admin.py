from django.contrib import admin
from ledger.models import Merchant, BankAccount, Transaction, AuditLog

@admin.register(Merchant)
class MerchantAdmin(admin.ModelAdmin):
    list_display = ('name', 'email', 'created_at')

@admin.register(BankAccount)
class BankAccountAdmin(admin.ModelAdmin):
    list_display = ('merchant', 'account_number', 'ifsc', 'is_primary')


@admin.register(Transaction)
class TransactionAdmin(admin.ModelAdmin):
    list_display = ('merchant', 'direction', 'amount_paise', 'created_at')
    list_filter = ('direction',)

@admin.register(AuditLog)
class AuditLogAdmin(admin.ModelAdmin):
    list_display = ('action', 'target_model', 'target_id', 'actor_email', 'timestamp')
    list_filter = ('action', 'target_model')
    readonly_fields = ('timestamp', 'changes')
