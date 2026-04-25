from django.core.management.base import BaseCommand
from ledger.models import Merchant, BankAccount, Transaction

class Command(BaseCommand):
    help = "Seed 3 merchants with initial credit ledger entries and bank accounts."

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
                # Create primary bank account
                BankAccount.objects.create(
                    merchant=merchant,
                    account_number="1234567890",
                    ifsc="HDFC0001234",
                    is_primary=True
                )
                self.stdout.write(f"Created primary bank account for {email}")

            seed_reference = f"seed:{email}"
            already_seeded = Transaction.objects.filter(
                merchant=merchant,
                description="Initial seeded ledger credit.",
            ).exists()
            
            if not already_seeded:
                Transaction.objects.create(
                    merchant=merchant,
                    direction=Transaction.Direction.CREDIT,
                    amount_paise=amount_paise,
                    description="Initial seeded ledger credit.",
                )
                self.stdout.write(
                    self.style.SUCCESS(
                        f"Seeded INR {(amount_paise / 100):.2f} for merchant {email}"
                    )
                )
