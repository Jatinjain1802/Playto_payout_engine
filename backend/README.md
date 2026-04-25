# Backend - Playto Payout Engine

Django + DRF + Celery backend for the payout engine.

## Features
- Ledger model with immutable credit/debit transactions in paise
- DB-level balance aggregation query
- Payout request API with idempotency key enforcement
- Internal transfer API (merchant to merchant) with idempotency key enforcement
- Row-level locking for concurrency-safe balance checks
- State transition guardrails for payout lifecycle
- Retry for stuck payouts with exponential backoff

## Setup
```powershell
python -m venv venv
.\venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
python manage.py migrate
python manage.py seed_data
```

## Run API
```powershell
python manage.py runserver 0.0.0.0:8000
```

## Run worker and beat
Worker (Windows-safe):
```powershell
celery -A config worker -l info --pool=solo --concurrency=1
```

Beat:
```powershell
celery -A config beat -l info
```

## Environment variables
Minimal:
- `DJANGO_SECRET_KEY`
- `DJANGO_DEBUG`
- `DJANGO_ALLOWED_HOSTS`
- `CELERY_BROKER_URL`
- `CELERY_RESULT_BACKEND`
- `CELERY_TASK_ALWAYS_EAGER`

Database:
- If `POSTGRES_DB` is set, backend uses PostgreSQL (`POSTGRES_*` vars)
- If not set, backend falls back to SQLite (`db.sqlite3`)

CORS:
- `CORS_ALLOW_ALL_ORIGINS=True|False`
- `CORS_ALLOWED_ORIGINS=https://frontend.example.com`

## API
- `POST /api/v1/payouts`
  - Header: `Idempotency-Key: <uuid>`
  - Body: `merchant_id`, `amount_paise`, `bank_account_id`
- `POST /api/v1/transfers`
  - Header: `Idempotency-Key: <uuid>`
  - Body: `source_merchant_id`, `destination_merchant_id`, `amount_paise`, `note?`
- `GET /api/v1/merchants`
- `GET /api/v1/payouts/<payout_id>`
- `GET /api/v1/merchants/<merchant_id>/balance`
- `GET /api/v1/merchants/<merchant_id>/transactions`
- `GET /api/v1/merchants/<merchant_id>/payouts`

## Tests
```powershell
python manage.py test payouts.tests.test_idempotency
python manage.py test payouts.tests.test_concurrency
python manage.py test payouts.tests.test_transfer
```

Note: Concurrency test requires PostgreSQL because it validates row locking semantics.
