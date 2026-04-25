from __future__ import annotations

import random
from datetime import timedelta

from celery import shared_task
from django.conf import settings
from django.db import transaction
from django.utils import timezone

from payouts.models import Payout
from payouts.services import mark_payout_completed, mark_payout_failed


def _simulate_bank_outcome() -> str:
    draw = random.random()
    if draw < 0.7:
        return "success"
    if draw < 0.9:
        return "failure"
    return "stuck"


@shared_task(name="payouts.tasks.process_payout_task")
def process_payout_task(payout_id: str) -> None:
    with transaction.atomic():
        payout = Payout.objects.select_for_update().get(id=payout_id)
        if payout.status in {Payout.Status.COMPLETED, Payout.Status.FAILED}:
            return
        if payout.status == Payout.Status.PENDING:
            payout.transition_to(Payout.Status.PROCESSING)
            payout.save(update_fields=["status", "updated_at"])
        elif payout.status != Payout.Status.PROCESSING:
            return

    outcome = _simulate_bank_outcome()
    if outcome == "success":
        mark_payout_completed(payout_id)
    elif outcome == "failure":
        mark_payout_failed(payout_id, "Bank simulation marked payout as failed.")
    else:
        return


@shared_task(name="payouts.tasks.retry_stuck_payouts_task")
def retry_stuck_payouts_task() -> int:
    cutoff = timezone.now() - timedelta(seconds=settings.STUCK_PAYOUT_SECONDS)
    stuck_ids = list(
        Payout.objects.filter(
            status=Payout.Status.PROCESSING,
            updated_at__lte=cutoff,
        ).values_list("id", flat=True)
    )

    retried = 0
    for payout_id in stuck_ids:
        should_fail = False
        retry_count = 0
        with transaction.atomic():
            payout = Payout.objects.select_for_update().get(id=payout_id)
            if payout.status != Payout.Status.PROCESSING or payout.updated_at > cutoff:
                continue

            if payout.retry_count >= settings.MAX_PAYOUT_RETRIES:
                should_fail = True
            else:
                payout.retry_count += 1
                payout.last_retry_at = timezone.now()
                payout.save(update_fields=["retry_count", "last_retry_at", "updated_at"])
                retry_count = payout.retry_count
                retried += 1

        if should_fail:
            mark_payout_failed(
                str(payout_id),
                "Payout marked failed after max retries for stuck processing state.",
            )
            continue

        delay_seconds = min(2**retry_count, 30)
        process_payout_task.apply_async(args=[str(payout_id)], countdown=delay_seconds)

    return retried
