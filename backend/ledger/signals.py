from django.db.models.signals import post_save, post_delete, pre_save
from django.dispatch import receiver
from .models import BankAccount, AuditLog
import json

@receiver(pre_save, sender=BankAccount)
def track_bank_account_changes_pre(sender, instance, **kwargs):
    """
    Before saving, if the object already exists, we store the old values 
    on the instance itself so we can compare them in post_save.
    """
    if instance.pk:
        try:
            old_instance = BankAccount.objects.get(pk=instance.pk)
            instance._old_values = {
                "account_number": old_instance.account_number,
                "ifsc": old_instance.ifsc,
                "is_primary": old_instance.is_primary,
            }
        except BankAccount.DoesNotExist:
            instance._old_values = {}
    else:
        instance._old_values = {}

@receiver(post_save, sender=BankAccount)
def track_bank_account_changes_post(sender, instance, created, **kwargs):
    """
    After saving, we compare the current values with _old_values.
    """
    action = AuditLog.Action.CREATE if created else AuditLog.Action.UPDATE
    
    new_values = {
        "account_number": instance.account_number,
        "ifsc": instance.ifsc,
        "is_primary": instance.is_primary,
    }
    
    changes = {}
    if created:
        changes = {"new": new_values}
    else:
        old_values = getattr(instance, '_old_values', {})
        # Only log if something actually changed
        diff = {}
        for key, value in new_values.items():
            if value != old_values.get(key):
                diff[key] = {"old": old_values.get(key), "new": value}
        
        if not diff:
            return # No changes, don't log
        changes = diff

    AuditLog.objects.create(
        action=action,
        target_model="BankAccount",
        target_id=str(instance.id),
        changes=changes,
        actor_email="system@playto.com" # In a real app, you'd get this from middleware
    )

@receiver(post_delete, sender=BankAccount)
def track_bank_account_deletion(sender, instance, **kwargs):
    AuditLog.objects.create(
        action=AuditLog.Action.DELETE,
        target_model="BankAccount",
        target_id=str(instance.id),
        changes={"deleted_values": {
            "account_number": instance.account_number,
            "ifsc": instance.ifsc,
        }},
        actor_email="system@playto.com"
    )
