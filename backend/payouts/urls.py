from django.urls import path

from payouts.views import (
    MerchantBalanceAPIView,
    MerchantListAPIView,
    MerchantPayoutsAPIView,
    MerchantTransactionsAPIView,
    PayoutCreateAPIView,
    PayoutDetailAPIView,
    TransferCreateAPIView,
)


urlpatterns = [
    path("merchants", MerchantListAPIView.as_view(), name="merchant-list"),
    path("payouts", PayoutCreateAPIView.as_view(), name="payout-create"),
    path("transfers", TransferCreateAPIView.as_view(), name="transfer-create"),
    path("payouts/<uuid:payout_id>", PayoutDetailAPIView.as_view(), name="payout-detail"),
    path(
        "merchants/<int:merchant_id>/balance",
        MerchantBalanceAPIView.as_view(),
        name="merchant-balance",
    ),
    path(
        "merchants/<int:merchant_id>/transactions",
        MerchantTransactionsAPIView.as_view(),
        name="merchant-transactions",
    ),
    path(
        "merchants/<int:merchant_id>/payouts",
        MerchantPayoutsAPIView.as_view(),
        name="merchant-payouts",
    ),
]
