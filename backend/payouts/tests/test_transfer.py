from __future__ import annotations

import uuid

from rest_framework.test import APITestCase

from payouts.models import Merchant, Transaction
from payouts.services import calculate_available_balance_paise


class MerchantTransferTests(APITestCase):
    def setUp(self):
        self.source = Merchant.objects.create(
            name="Source Merchant",
            email="source@merchant.test",
        )
        self.destination = Merchant.objects.create(
            name="Destination Merchant",
            email="destination@merchant.test",
        )
        Transaction.objects.create(
            merchant=self.source,
            direction=Transaction.Direction.CREDIT,
            amount_paise=100_000,
            reference_type=Transaction.ReferenceType.SEED,
            reference_id="seed:source",
            description="Seed for source",
        )
        Transaction.objects.create(
            merchant=self.destination,
            direction=Transaction.Direction.CREDIT,
            amount_paise=20_000,
            reference_type=Transaction.ReferenceType.SEED,
            reference_id="seed:destination",
            description="Seed for destination",
        )

    def test_transfer_moves_funds_between_merchants(self):
        response = self.client.post(
            "/api/v1/transfers",
            {
                "source_merchant_id": self.source.id,
                "destination_merchant_id": self.destination.id,
                "amount_paise": 25_000,
                "note": "invoice settlement",
            },
            format="json",
            HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4()),
        )

        self.assertEqual(response.status_code, 201)
        payload = response.json()
        self.assertTrue(payload["reference_id"].startswith("transfer:"))
        self.assertEqual(calculate_available_balance_paise(self.source.id), 75_000)
        self.assertEqual(calculate_available_balance_paise(self.destination.id), 45_000)

        transfer_rows = Transaction.objects.filter(reference_id=payload["reference_id"])
        self.assertEqual(transfer_rows.count(), 2)
        self.assertEqual(
            transfer_rows.filter(direction=Transaction.Direction.DEBIT, merchant=self.source).count(),
            1,
        )
        self.assertEqual(
            transfer_rows.filter(
                direction=Transaction.Direction.CREDIT,
                merchant=self.destination,
            ).count(),
            1,
        )

    def test_transfer_replays_same_response_for_same_idempotency_key(self):
        key = str(uuid.uuid4())
        request_body = {
            "source_merchant_id": self.source.id,
            "destination_merchant_id": self.destination.id,
            "amount_paise": 10_000,
            "note": "same key replay",
        }

        first = self.client.post(
            "/api/v1/transfers",
            request_body,
            format="json",
            HTTP_IDEMPOTENCY_KEY=key,
        )
        second = self.client.post(
            "/api/v1/transfers",
            request_body,
            format="json",
            HTTP_IDEMPOTENCY_KEY=key,
        )

        self.assertEqual(first.status_code, 201)
        self.assertEqual(second.status_code, 201)
        self.assertEqual(first.json(), second.json())
        self.assertEqual(second["X-Idempotency-Replayed"], "true")
        self.assertEqual(
            Transaction.objects.filter(reference_id=first.json()["reference_id"]).count(),
            2,
        )
