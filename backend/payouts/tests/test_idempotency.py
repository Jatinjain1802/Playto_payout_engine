from __future__ import annotations
import uuid
from unittest.mock import patch
from rest_framework.test import APITestCase
from ledger.models import Merchant, Transaction, BankAccount
from payouts.models import Payout

class PayoutIdempotencyTests(APITestCase):
    def setUp(self):
        self.merchant = Merchant.objects.create(
            name="Idempotent Merchant",
            email="idempotent@merchant.test",
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
            description="Seed credit for idempotency test",
        )

    @patch("payouts.tasks.process_payout_task.delay")
    def test_same_key_returns_same_response_and_prevents_duplicate_payouts(self, _mock_delay):
        idempotency_key = uuid.uuid4()
        payload = {
            "merchant_id": self.merchant.id,
            "amount_paise": 4_000,
            "bank_account_id": self.bank.id,
        }
        first = self.client.post(
            "/api/v1/payouts",
            payload,
            format="json",
            HTTP_IDEMPOTENCY_KEY=str(idempotency_key),
        )
        second = self.client.post(
            "/api/v1/payouts",
            payload,
            format="json",
            HTTP_IDEMPOTENCY_KEY=str(idempotency_key),
        )

        self.assertEqual(first.status_code, 201)
        self.assertEqual(second.status_code, 201)
        self.assertEqual(first.json(), second.json())
        self.assertEqual(second["X-Idempotency-Replayed"], "true")
        self.assertEqual(Payout.objects.count(), 1)
        self.assertEqual(
            Transaction.objects.filter(direction=Transaction.Direction.DEBIT).count(),
            1,
        )

    @patch("payouts.tasks.process_payout_task.delay")
    def test_same_key_with_different_payload_returns_conflict(self, _mock_delay):
        idempotency_key = uuid.uuid4()
        first = self.client.post(
            "/api/v1/payouts",
            {
                "merchant_id": self.merchant.id,
                "amount_paise": 3_000,
                "bank_account_id": self.bank.id,
            },
            format="json",
            HTTP_IDEMPOTENCY_KEY=str(idempotency_key),
        )
        second = self.client.post(
            "/api/v1/payouts",
            {
                "merchant_id": self.merchant.id,
                "amount_paise": 3_500,
                "bank_account_id": self.bank.id,
            },
            format="json",
            HTTP_IDEMPOTENCY_KEY=str(idempotency_key),
        )

        self.assertEqual(first.status_code, 201)
        self.assertEqual(second.status_code, 409)
        self.assertEqual(Payout.objects.count(), 1)
