from __future__ import annotations

import uuid
from concurrent.futures import ThreadPoolExecutor
from unittest.mock import patch

from django.db import connection, close_old_connections
from django.test import TransactionTestCase

from payouts.models import Merchant, Payout, Transaction
from payouts.services import calculate_available_balance_paise, create_payout


class PayoutConcurrencyTests(TransactionTestCase):
    reset_sequences = True

    def setUp(self):
        self.merchant = Merchant.objects.create(
            name="Concurrency Merchant",
            email="concurrency@merchant.test",
        )
        Transaction.objects.create(
            merchant=self.merchant,
            direction=Transaction.Direction.CREDIT,
            amount_paise=10_000,
            reference_type=Transaction.ReferenceType.SEED,
            reference_id="seed:concurrency",
            description="Seed credit for concurrency test",
        )

    def _attempt_payout(self, key: uuid.UUID) -> int:
        close_old_connections()
        result = create_payout(
            merchant_id=self.merchant.id,
            amount_paise=6_000,
            bank_account_id="bank-concurrent-01",
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

        self.assertEqual(statuses.count(201), 1)
        self.assertEqual(statuses.count(400), 1)
        self.assertEqual(Payout.objects.count(), 1)
        self.assertEqual(calculate_available_balance_paise(self.merchant.id), 4_000)
