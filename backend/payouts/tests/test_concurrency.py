from __future__ import annotations
import uuid
from concurrent.futures import ThreadPoolExecutor
from unittest.mock import patch
from django.db import connection, close_old_connections
from django.test import TransactionTestCase
from ledger.models import Merchant, Transaction, BankAccount
from payouts.models import Payout
from payouts.services import calculate_available_balance_paise, create_payout

class PayoutConcurrencyTests(TransactionTestCase):
    reset_sequences = True

    def setUp(self):
        self.merchant = Merchant.objects.create(
            name="Concurrency Merchant",
            email="concurrency@merchant.test",
        )
        self.bank = BankAccount.objects.create(
            merchant=self.merchant,
            account_number="1234567890",
            ifsc="HDFC0001234",
            is_primary=True
        )
        Transaction.objects.create(
            merchant=self.merchant,
            direction=Transaction.Direction.CREDIT,
            amount_paise=10_000,
            description="Seed credit for concurrency test",
        )

    def _attempt_payout(self, key: uuid.UUID) -> int:
        close_old_connections()
        result = create_payout(
            merchant_id=self.merchant.id,
            amount_paise=6_000,
            bank_account_id=self.bank.id,
            idempotency_key=key,
        )
        close_old_connections()
        return result.status_code

    @patch("payouts.tasks.process_payout_task.delay")
    def test_only_one_parallel_payout_is_accepted_for_limited_balance(self, _mock_delay):
        if connection.vendor != "postgresql":
            self.skipTest("Row-level locking test requires PostgreSQL.")

        keys = [uuid.uuid4(), uuid.uuid4()]
        with ThreadPoolExecutor(max_workers=2) as executor:
            statuses = list(executor.map(self._attempt_payout, keys))

        # Status 201 for success, 409 for conflict (due to NOWAIT) or 400 for balance
        # In this specific test, if they run at the EXACT same time, one gets 201, other gets 409.
        # If they run sequentially, one gets 201, other gets 400.
        success_count = statuses.count(201)
        self.assertEqual(success_count, 1)
        self.assertEqual(Payout.objects.count(), 1)
        self.assertEqual(calculate_available_balance_paise(self.merchant.id), 4_000)
