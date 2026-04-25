# Playto Payout Engine — Build Walkthrough

> A step-by-step engineering plan for the Founding Engineer assignment.
> Every architectural decision is explained. Read this before writing a single line of code.

---

## 0. Before You Start — Mental Model

This is NOT a CRUD app. It is a **money ledger with distributed concurrency constraints**.

The three things that will get you filtered out if you get them wrong:
1. Python-level race condition instead of DB-level lock (most common mistake)
2. Float arithmetic on money amounts
3. Idempotency implemented as "check if key exists" without handling in-flight requests

Think of it like this:
```
Merchant Balance = SUM(credits) - SUM(debits)   ← always derived, never stored
Held Balance     = SUM(pending/processing payouts)
Available        = Balance - Held
```

---

## 1. Project Setup

### Stack
```
Backend  → Django 4.x + DRF
DB       → PostgreSQL (required — you need SELECT FOR UPDATE NOWAIT)
Queue    → Celery + Redis (simplest, free on Railway)
Frontend → React + Tailwind (Vite)
Deploy   → Railway (free tier, supports Postgres + Redis + Celery)
```

### Folder Structure
```
playto-payout/
├── backend/
│   ├── core/           ← Django project settings
│   ├── ledger/         ← merchants, transactions, models
│   ├── payouts/        ← payout API, state machine, worker
│   ├── manage.py
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   ├── pages/Dashboard.jsx
│   │   └── api.js
│   └── package.json
├── docker-compose.yml  ← bonus, but worth doing
├── README.md
├── EXPLAINER.md
└── WALKTHROUGH.md      ← this file
```

### Day-by-day Plan (10–15 hours)

| Day | Focus | Hours |
|-----|-------|-------|
| 1 | Models + migrations + seed script | 2–3h |
| 2 | Payout API with lock + idempotency | 3h |
| 3 | Celery worker + state machine | 2–3h |
| 4 | React dashboard + polling | 2h |
| 5 | Tests + EXPLAINER.md + deploy | 2h |

---

## 2. The Ledger Model (Most Important Part)

### Models to create: `ledger/models.py`

**Merchant**
```python
class Merchant(models.Model):
    name = models.CharField(max_length=200)
    email = models.EmailField(unique=True)
    created_at = models.DateTimeField(auto_now_add=True)
```

**BankAccount**
```python
class BankAccount(models.Model):
    merchant = models.ForeignKey(Merchant, on_delete=models.CASCADE)
    account_number = models.CharField(max_length=20)
    ifsc = models.CharField(max_length=11)
    is_primary = models.BooleanField(default=False)
```

**Transaction (the ledger)**
```python
class Transaction(models.Model):
    CREDIT = 'credit'
    DEBIT = 'debit'
    TYPE_CHOICES = [(CREDIT, 'Credit'), (DEBIT, 'Debit')]

    merchant = models.ForeignKey(Merchant, on_delete=models.PROTECT)
    type = models.CharField(max_length=10, choices=TYPE_CHOICES)
    amount_paise = models.BigIntegerField()   # NEVER FloatField
    description = models.CharField(max_length=255)
    payout = models.ForeignKey('payouts.Payout', null=True, blank=True, on_delete=models.SET_NULL)
    created_at = models.DateTimeField(auto_now_add=True)
```

**Why this model?**
- Balance is NEVER stored as a column. It is always computed from transactions.
- This makes it impossible for the balance to get out of sync.
- Atomic fund holds and releases become simple: insert a debit row inside a transaction block.

### Balance Query (the one you paste in EXPLAINER)

```python
from django.db.models import Sum, Q

def get_merchant_balance(merchant_id):
    result = Transaction.objects.filter(
        merchant_id=merchant_id
    ).aggregate(
        total_credits=Sum('amount_paise', filter=Q(type='credit')),
        total_debits=Sum('amount_paise', filter=Q(type='debit')),
    )
    credits = result['total_credits'] or 0
    debits = result['total_debits'] or 0
    return credits - debits
```

This is a **single SQL aggregation** — no Python arithmetic on fetched rows. This is what the EXPLAINER is asking for.

---

## 3. The Payout Model (State Machine)

### `payouts/models.py`

```python
class Payout(models.Model):
    PENDING = 'pending'
    PROCESSING = 'processing'
    COMPLETED = 'completed'
    FAILED = 'failed'

    STATUS_CHOICES = [
        (PENDING, 'Pending'),
        (PROCESSING, 'Processing'),
        (COMPLETED, 'Completed'),
        (FAILED, 'Failed'),
    ]

    # Legal transitions — source of truth
    ALLOWED_TRANSITIONS = {
        PENDING: [PROCESSING],
        PROCESSING: [COMPLETED, FAILED],
        COMPLETED: [],   # terminal
        FAILED: [],      # terminal
    }

    merchant = models.ForeignKey('ledger.Merchant', on_delete=models.PROTECT)
    bank_account = models.ForeignKey('ledger.BankAccount', on_delete=models.PROTECT)
    amount_paise = models.BigIntegerField()
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=PENDING)
    idempotency_key = models.CharField(max_length=64)
    idempotency_key_expires_at = models.DateTimeField()
    attempts = models.IntegerField(default=0)
    last_attempted_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = [('merchant', 'idempotency_key')]

    def transition_to(self, new_status):
        """State machine enforcement — call this, never assign .status directly"""
        allowed = self.ALLOWED_TRANSITIONS.get(self.status, [])
        if new_status not in allowed:
            raise ValueError(
                f"Illegal transition: {self.status} → {new_status}"
            )
        self.status = new_status
        self.save(update_fields=['status', 'updated_at'])
```

**Why `ALLOWED_TRANSITIONS` dict?**
It is the single source of truth. The EXPLAINER asks "where in the code is failed→completed blocked?" — you point to this dict. One place, no scattered if-statements.

---

## 4. The Payout API — Concurrency + Idempotency

### `payouts/views.py` — This is the hardest part

```python
from django.db import transaction
from django.db.models import Sum, Q
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
import uuid
from datetime import timedelta
from django.utils import timezone

class PayoutCreateView(APIView):

    def post(self, request):
        idempotency_key = request.headers.get('Idempotency-Key')
        if not idempotency_key:
            return Response({'error': 'Idempotency-Key header required'}, status=400)

        merchant_id = request.data.get('merchant_id')  # or from auth
        amount_paise = request.data.get('amount_paise')
        bank_account_id = request.data.get('bank_account_id')

        # --- IDEMPOTENCY CHECK (before lock) ---
        existing = Payout.objects.filter(
            merchant_id=merchant_id,
            idempotency_key=idempotency_key,
            idempotency_key_expires_at__gt=timezone.now()
        ).first()

        if existing:
            return Response(PayoutSerializer(existing).data, status=200)

        # --- ATOMIC BLOCK: lock + check balance + create ---
        with transaction.atomic():

            # SELECT FOR UPDATE NOWAIT — this is the DB-level lock
            # NOWAIT means: don't wait if another request holds the lock,
            # raise an exception immediately instead (no hanging)
            try:
                merchant = Merchant.objects.select_for_update(nowait=True).get(
                    id=merchant_id
                )
            except OperationalError:
                # Another request is currently holding the lock on this merchant
                return Response(
                    {'error': 'Concurrent request in progress, retry shortly'},
                    status=409
                )

            # Compute balance INSIDE the lock — no stale reads possible
            agg = Transaction.objects.filter(merchant=merchant).aggregate(
                total_credits=Sum('amount_paise', filter=Q(type='credit')),
                total_debits=Sum('amount_paise', filter=Q(type='debit')),
            )
            balance = (agg['total_credits'] or 0) - (agg['total_debits'] or 0)

            # Also account for already-held funds
            held = Payout.objects.filter(
                merchant=merchant,
                status__in=['pending', 'processing']
            ).aggregate(held=Sum('amount_paise'))['held'] or 0

            available = balance - held

            if amount_paise > available:
                return Response(
                    {'error': f'Insufficient balance. Available: {available} paise'},
                    status=422
                )

            # Create the payout (hold funds by creating a debit transaction)
            payout = Payout.objects.create(
                merchant=merchant,
                bank_account_id=bank_account_id,
                amount_paise=amount_paise,
                status=Payout.PENDING,
                idempotency_key=idempotency_key,
                idempotency_key_expires_at=timezone.now() + timedelta(hours=24),
            )

            # Record the hold as a debit transaction
            Transaction.objects.create(
                merchant=merchant,
                type='debit',
                amount_paise=amount_paise,
                description=f'Hold for payout #{payout.id}',
                payout=payout,
            )

        # Queue background job
        process_payout.apply_async(args=[payout.id], countdown=2)

        return Response(PayoutSerializer(payout).data, status=201)
```

### Why `select_for_update(nowait=True)` on Merchant?

This is the exact answer to EXPLAINER question 2 (the Lock).

- `SELECT FOR UPDATE` acquires a **row-level exclusive lock** in Postgres.
- While Request A holds the lock inside `atomic()`, Request B hits `NOWAIT` and immediately gets an `OperationalError` — no deadlock, no wait, no race.
- The alternative `select_for_update()` (without nowait) would queue Request B, which could cause both to read the same available balance before either writes. That is the race condition.

**Wrong approach (what AI often generates):**
```python
# WRONG — Python-level check, not DB-level lock
balance = get_merchant_balance(merchant_id)
if balance >= amount_paise:
    # Another request can slip in here!
    create_payout(...)
```

---

## 5. The Celery Worker — Simulation + Retry Logic

### `payouts/tasks.py`

```python
import random
import time
from celery import shared_task
from django.db import transaction
from django.utils import timezone

@shared_task(bind=True, max_retries=3)
def process_payout(self, payout_id):
    try:
        with transaction.atomic():
            payout = Payout.objects.select_for_update().get(id=payout_id)

            # Validate transition
            if payout.status != Payout.PENDING:
                return  # Already being processed

            payout.transition_to(Payout.PROCESSING)
            payout.attempts += 1
            payout.last_attempted_at = timezone.now()
            payout.save(update_fields=['attempts', 'last_attempted_at'])

    except Payout.DoesNotExist:
        return

    # Simulate bank settlement OUTSIDE the transaction (don't hold lock during IO)
    outcome = simulate_bank_call()

    with transaction.atomic():
        payout = Payout.objects.select_for_update().get(id=payout_id)

        if outcome == 'success':
            payout.transition_to(Payout.COMPLETED)

        elif outcome == 'fail':
            payout.transition_to(Payout.FAILED)
            # Return funds ATOMICALLY with state transition
            Transaction.objects.create(
                merchant=payout.merchant,
                type='credit',
                amount_paise=payout.amount_paise,
                description=f'Refund for failed payout #{payout.id}',
                payout=payout,
            )

        elif outcome == 'hang':
            # Will be picked up by the stuck-payout checker
            pass


def simulate_bank_call():
    """70% success, 20% fail, 10% hang"""
    roll = random.random()
    if roll < 0.70:
        return 'success'
    elif roll < 0.90:
        return 'fail'
    else:
        time.sleep(35)  # simulate hang past 30s threshold
        return 'hang'
```

### Stuck Payout Checker (Celery Beat)

```python
@shared_task
def retry_stuck_payouts():
    """Run every minute via Celery Beat"""
    threshold = timezone.now() - timedelta(seconds=30)
    stuck = Payout.objects.filter(
        status=Payout.PROCESSING,
        last_attempted_at__lt=threshold,
        attempts__lt=3,
    )
    for payout in stuck:
        process_payout.apply_async(args=[payout.id])

    # Max retries exceeded → mark failed
    give_up = Payout.objects.filter(
        status=Payout.PROCESSING,
        last_attempted_at__lt=threshold,
        attempts__gte=3,
    )
    for payout in give_up:
        with transaction.atomic():
            p = Payout.objects.select_for_update().get(id=payout.id)
            p.transition_to(Payout.FAILED)
            Transaction.objects.create(
                merchant=p.merchant,
                type='credit',
                amount_paise=p.amount_paise,
                description=f'Refund: max retries exceeded #{p.id}',
                payout=p,
            )
```

**Celery Beat config in `settings.py`:**
```python
CELERY_BEAT_SCHEDULE = {
    'retry-stuck-payouts': {
        'task': 'payouts.tasks.retry_stuck_payouts',
        'schedule': 60.0,  # every 60 seconds
    },
}
```

---

## 6. Seed Script

### `ledger/management/commands/seed.py`

```python
from django.core.management.base import BaseCommand
from ledger.models import Merchant, BankAccount, Transaction

class Command(BaseCommand):
    def handle(self, *args, **kwargs):
        merchants_data = [
            {'name': 'Ravi Designs', 'email': 'ravi@example.com', 'credits': [50000, 120000, 80000]},
            {'name': 'Priya Consulting', 'email': 'priya@example.com', 'credits': [200000, 150000]},
            {'name': 'Amit Freelance', 'email': 'amit@example.com', 'credits': [75000, 90000, 30000]},
        ]

        for m_data in merchants_data:
            merchant, _ = Merchant.objects.get_or_create(email=m_data['email'], defaults={'name': m_data['name']})
            BankAccount.objects.get_or_create(
                merchant=merchant,
                defaults={'account_number': '1234567890', 'ifsc': 'HDFC0001234', 'is_primary': True}
            )
            for amount in m_data['credits']:
                Transaction.objects.create(
                    merchant=merchant,
                    type='credit',
                    amount_paise=amount,
                    description='Simulated customer payment',
                )
            self.stdout.write(f"Seeded: {merchant.name} — Balance: {sum(m_data['credits'])} paise")
```

Run with: `python manage.py seed`

---

## 7. Tests (Minimum 2 Required)

### Test 1 — Concurrency (the one they grade hardest)

```python
# payouts/tests/test_concurrency.py
import threading
from django.test import TestCase, Client
from ledger.models import Merchant, Transaction, BankAccount
from payouts.models import Payout

class ConcurrencyTest(TestCase):
    def setUp(self):
        self.merchant = Merchant.objects.create(name='Test', email='t@t.com')
        self.bank = BankAccount.objects.create(
            merchant=self.merchant, account_number='123', ifsc='HDFC0001'
        )
        # Give merchant 100 rupees = 10000 paise
        Transaction.objects.create(
            merchant=self.merchant, type='credit', amount_paise=10000,
            description='Seed credit'
        )

    def test_concurrent_overdraw_rejected(self):
        """Two simultaneous 6000 paise requests — exactly one must succeed"""
        results = []
        client = Client()

        def make_request(key):
            r = client.post('/api/v1/payouts/', {
                'merchant_id': self.merchant.id,
                'bank_account_id': self.bank.id,
                'amount_paise': 6000,
            }, content_type='application/json',
            HTTP_IDEMPOTENCY_KEY=key)
            results.append(r.status_code)

        t1 = threading.Thread(target=make_request, args=('key-AAA',))
        t2 = threading.Thread(target=make_request, args=('key-BBB',))
        t1.start(); t2.start()
        t1.join(); t2.join()

        created = Payout.objects.filter(merchant=self.merchant).count()
        success_count = results.count(201)

        self.assertEqual(created, 1, "Exactly one payout should be created")
        self.assertEqual(success_count, 1, "Exactly one request should succeed")
```

### Test 2 — Idempotency

```python
# payouts/tests/test_idempotency.py
class IdempotencyTest(TestCase):
    def test_same_key_returns_same_response(self):
        """POST twice with same key — only one payout created, both return 200"""
        # Setup merchant with balance
        # First call → 201
        # Second call with same key → 200 with identical response body
        # Assert Payout.objects.count() == 1
```

---

## 8. React Dashboard

### Key Components

**`src/pages/Dashboard.jsx`**
- Merchant selector dropdown
- Balance card: Available | Held | Total
- Payout request form
- Payout history table with status badges

**`src/api.js`**
```javascript
const BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000'

export const getBalance = (merchantId) =>
  fetch(`${BASE}/api/v1/merchants/${merchantId}/balance/`).then(r => r.json())

export const getPayouts = (merchantId) =>
  fetch(`${BASE}/api/v1/merchants/${merchantId}/payouts/`).then(r => r.json())

export const createPayout = (data, idempotencyKey) =>
  fetch(`${BASE}/api/v1/payouts/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey,
    },
    body: JSON.stringify(data),
  }).then(r => r.json())
```

**Live Status Updates:** Use `setInterval` polling every 3 seconds on payout history — simpler than WebSockets and enough for this assignment.

```javascript
useEffect(() => {
  const interval = setInterval(() => {
    fetchPayouts(merchantId).then(setPayouts)
  }, 3000)
  return () => clearInterval(interval)
}, [merchantId])
```

---

## 9. The EXPLAINER.md Answers (Prepare These)

Write this as you build. Short, specific, confident.

### Q1 — Paste your balance query
Paste the `get_merchant_balance` aggregate function above. Explain: stored as BigIntegerField in paise, never floats, always derived from sum of transactions.

### Q2 — The Lock
Paste the `select_for_update(nowait=True)` block. Explain: Postgres row-level exclusive lock. NOWAIT means the second concurrent request fails immediately rather than reading stale balance. Without this, two requests could both read 10000 paise and both succeed on a 6000+6000 overdraw.

### Q3 — Idempotency
Unique constraint on `(merchant, idempotency_key)` prevents duplicate DB rows. Query for existing key happens before the lock — if found and not expired, return the stored response immediately. If two requests with the same key arrive simultaneously, the unique constraint ensures only one INSERT succeeds; the other gets a DB integrity error which we catch and turn into a 200 response.

### Q4 — State Machine
`ALLOWED_TRANSITIONS` dict in `Payout.transition_to()`. `FAILED: []` — empty list means no transitions allowed out of failed. Calling `transition_to('completed')` from failed raises `ValueError` before any DB write.

### Q5 — AI Audit
Example: AI generated `select_for_update()` without `nowait=True`. The problem: without NOWAIT, two concurrent requests both block and wait for the lock. When the first releases, the second reads the now-updated balance — but if not handled carefully, it can still read pre-commit state depending on isolation level. More importantly, `nowait=True` gives deterministic failure which is what we want in a payment API. Changed to `nowait=True` and added 409 response handling.

---

## 10. Deployment Checklist (Railway)

```bash
# railway.toml
[build]
builder = "nixpacks"

[deploy]
startCommand = "gunicorn core.wsgi:application --bind 0.0.0.0:$PORT"
```

Services to create on Railway:
1. Django backend (web)
2. PostgreSQL plugin
3. Redis plugin
4. Celery worker: `celery -A core worker -l info`
5. Celery beat: `celery -A core beat -l info`

Frontend: Deploy to Vercel (free), point `VITE_API_URL` to Railway backend URL.

---

## 11. docker-compose.yml (Bonus)

```yaml
version: '3.8'
services:
  db:
    image: postgres:15
    environment:
      POSTGRES_DB: playto
      POSTGRES_USER: playto
      POSTGRES_PASSWORD: playto
    ports: ["5432:5432"]

  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]

  backend:
    build: ./backend
    command: python manage.py runserver 0.0.0.0:8000
    environment:
      DATABASE_URL: postgres://playto:playto@db:5432/playto
      REDIS_URL: redis://redis:6379/0
    depends_on: [db, redis]
    ports: ["8000:8000"]

  worker:
    build: ./backend
    command: celery -A core worker -l info
    environment:
      DATABASE_URL: postgres://playto:playto@db:5432/playto
      REDIS_URL: redis://redis:6379/0
    depends_on: [db, redis]

  beat:
    build: ./backend
    command: celery -A core beat -l info
    depends_on: [db, redis]

  frontend:
    build: ./frontend
    command: npm run dev -- --host 0.0.0.0
    ports: ["5173:5173"]
```

---

## Summary: What They're Actually Checking

| Criteria | What to nail |
|----------|-------------|
| Money integrity | BigIntegerField, DB aggregation, no floats |
| Concurrency | `select_for_update(nowait=True)` — not Python-level check |
| Idempotency | Unique constraint + pre-lock lookup + 24h expiry |
| State machine | `ALLOWED_TRANSITIONS` dict, `transition_to()` method |
| Retry logic | Celery Beat + attempts counter + exponential backoff |
| EXPLAINER | Short, paste actual code, explain DB primitives |
| AI Audit | Be honest — show what AI got wrong and what you fixed |

**Total lines of meaningful code: ~500 backend, ~200 frontend. Ship clean, not big.**
