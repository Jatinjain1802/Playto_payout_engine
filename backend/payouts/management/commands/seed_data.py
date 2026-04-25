from __future__ import annotations

from django.core.management.base import BaseCommand

from payouts.models import Merchant, Transaction
from payouts.services import update_cached_balance


class Command(BaseCommand):
    help = "Seed 3 merchants with initial credit ledger entries."

    def handle(self, *args, **options):
        seed_merchants = [
            ("Acme Agency", "acme@merchant.test", 250_000),
            ("Nova Freelance", "nova@merchant.test", 120_000),
            ("Orbit Studios", "orbit@merchant.test", 75_000),
        ]

        for name, email, amount_paise in seed_merchants:
            merchant, created = Merchant.objects.get_or_create(
                email=email,
                defaults={"name": name},
            )
            if created:
                self.stdout.write(self.style.SUCCESS(f"Created merchant: {email}"))

            seed_reference = f"seed:{email}"
            already_seeded = Transaction.objects.filter(
                merchant=merchant,
                reference_type=Transaction.ReferenceType.SEED,
                reference_id=seed_reference,
            ).exists()
            if not already_seeded:
                Transaction.objects.create(
                    merchant=merchant,
                    direction=Transaction.Direction.CREDIT,
                    amount_paise=amount_paise,
                    reference_type=Transaction.ReferenceType.SEED,
                    reference_id=seed_reference,
                    description="Initial seeded ledger credit.",
                )
                self.stdout.write(
                    self.style.SUCCESS(
                        f"Seeded INR {(amount_paise / 100):.2f} for merchant {email}"
                    )
                )

            balance = update_cached_balance(merchant.id)
            self.stdout.write(
                f"Merchant {email} cached_balance_paise updated to {balance}"
            )
