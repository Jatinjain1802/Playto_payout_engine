from __future__ import annotations

import uuid

from django.http import Http404
from rest_framework.response import Response
from rest_framework.views import APIView

from payouts.models import Merchant, Payout, Transaction
from payouts.serializers import (
    MerchantBalanceSerializer,
    MerchantReadSerializer,
    PayoutCreateRequestSerializer,
    PayoutReadSerializer,
    TransferCreateRequestSerializer,
    TransactionReadSerializer,
)
from payouts.services import (
    calculate_held_balance_paise,
    calculate_ledger_totals,
    create_transfer,
    create_payout,
)


class MerchantListAPIView(APIView):
    def get(self, request):
        merchants = Merchant.objects.all().order_by("id")
        serializer = MerchantReadSerializer(merchants, many=True)
        return Response(serializer.data)


class PayoutCreateAPIView(APIView):
    def post(self, request):
        header_value = request.headers.get("Idempotency-Key")
        if not header_value:
            return Response({"detail": "Idempotency-Key header is required."}, status=400)
        try:
            idempotency_key = uuid.UUID(header_value)
        except ValueError:
            return Response({"detail": "Idempotency-Key must be a valid UUID."}, status=400)

        serializer = PayoutCreateRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        result = create_payout(
            merchant_id=serializer.validated_data["merchant_id"],
            amount_paise=serializer.validated_data["amount_paise"],
            bank_account_id=serializer.validated_data["bank_account_id"],
            idempotency_key=idempotency_key,
        )
        response = Response(result.payload, status=result.status_code)
        response["X-Idempotency-Replayed"] = str(result.replayed).lower()
        return response


class PayoutDetailAPIView(APIView):
    def get(self, request, payout_id: uuid.UUID):
        try:
            payout = Payout.objects.get(id=payout_id)
        except Payout.DoesNotExist as exc:
            raise Http404 from exc
        serializer = PayoutReadSerializer(payout)
        return Response(serializer.data)


class MerchantBalanceAPIView(APIView):
    def get(self, request, merchant_id: int):
        try:
            Merchant.objects.get(id=merchant_id)
        except Merchant.DoesNotExist as exc:
            raise Http404 from exc

        totals = calculate_ledger_totals(merchant_id)
        available_balance = totals["credits"] - totals["debits"]
        held_balance = calculate_held_balance_paise(merchant_id)
        payload = {
            "merchant_id": merchant_id,
            "available_balance_paise": available_balance,
            "held_balance_paise": held_balance,
            "credits_total_paise": totals["credits"],
            "debits_total_paise": totals["debits"],
        }
        serializer = MerchantBalanceSerializer(payload)
        return Response(serializer.data)


class MerchantTransactionsAPIView(APIView):
    def get(self, request, merchant_id: int):
        transactions = Transaction.objects.filter(merchant_id=merchant_id).order_by("-created_at")
        serializer = TransactionReadSerializer(transactions, many=True)
        return Response(serializer.data)


class MerchantPayoutsAPIView(APIView):
    def get(self, request, merchant_id: int):
        payouts = Payout.objects.filter(merchant_id=merchant_id).order_by("-created_at")
        serializer = PayoutReadSerializer(payouts, many=True)
        return Response(serializer.data)


class TransferCreateAPIView(APIView):
    def post(self, request):
        header_value = request.headers.get("Idempotency-Key")
        if not header_value:
            return Response({"detail": "Idempotency-Key header is required."}, status=400)
        try:
            idempotency_key = uuid.UUID(header_value)
        except ValueError:
            return Response({"detail": "Idempotency-Key must be a valid UUID."}, status=400)

        serializer = TransferCreateRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        result = create_transfer(
            source_merchant_id=serializer.validated_data["source_merchant_id"],
            destination_merchant_id=serializer.validated_data["destination_merchant_id"],
            amount_paise=serializer.validated_data["amount_paise"],
            idempotency_key=idempotency_key,
            note=serializer.validated_data.get("note", ""),
        )
        response = Response(result.payload, status=result.status_code)
        response["X-Idempotency-Replayed"] = str(result.replayed).lower()
        return response
