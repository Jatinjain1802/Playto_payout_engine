from django.db import models
from django.db.models import Sum, Q

class Merchant(models.Model):
    name = models.CharField(max_length=200)
    email = models.EmailField(unique=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.name} ({self.email})"

class BankAccount(models.Model):
    merchant = models.ForeignKey(Merchant, on_delete=models.CASCADE, related_name='bank_accounts')
    account_number = models.CharField(max_length=20)
    ifsc = models.CharField(max_length=11)
    is_primary = models.BooleanField(default=False)

    def __str__(self):
        return f"{self.account_number} ({self.ifsc})"

class Transaction(models.Model):
    class Direction(models.TextChoices):
        CREDIT = 'credit', 'Credit'
        DEBIT = 'debit', 'Debit'

    merchant = models.ForeignKey(Merchant, on_delete=models.PROTECT, related_name='transactions')
    direction = models.CharField(max_length=10, choices=Direction.choices)
    amount_paise = models.BigIntegerField()   # NEVER FloatField
    description = models.CharField(max_length=255)
    payout = models.ForeignKey('payouts.Payout', null=True, blank=True, on_delete=models.SET_NULL)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.merchant.name} | {self.direction} | {self.amount_paise}"

class AuditLog(models.Model):
    class Action(models.TextChoices):
        CREATE = 'create', 'Create'
        UPDATE = 'update', 'Update'
        DELETE = 'delete', 'Delete'

    timestamp = models.DateTimeField(auto_now_add=True)
    actor_email = models.CharField(max_length=255, blank=True, null=True) # Who did it
    action = models.CharField(max_length=10, choices=Action.choices)
    target_model = models.CharField(max_length=100) # e.g. "BankAccount"
    target_id = models.CharField(max_length=100)
    changes = models.JSONField() # Store old vs new values

    class Meta:
        ordering = ['-timestamp']
        indexes = [
            models.Index(fields=['target_model', 'target_id']),
            models.Index(fields=['timestamp']),
        ]

    def __str__(self):
        return f"{self.action} on {self.target_model}:{self.target_id} at {self.timestamp}"
