# Deployment Guide

This guide uses Render because it supports web, worker, beat, Redis, and PostgreSQL in one place.

## 1) Deploy backend API service
Create a new **Web Service** from this repo.

- Root directory: `backend`
- Build command:
  ```bash
  pip install -r requirements.txt
  python manage.py migrate
  python manage.py seed
  ```
- Start command:
  ```bash
  gunicorn config.wsgi:application --bind 0.0.0.0:$PORT
  ```

### Backend environment variables
Set these in the backend service:
- `DJANGO_DEBUG=False`
- `DJANGO_SECRET_KEY=<strong-random-secret>`
- `DJANGO_ALLOWED_HOSTS=<backend-service-domain>`
- `POSTGRES_DB=<from Render Postgres>`
- `POSTGRES_USER=<from Render Postgres>`
- `POSTGRES_PASSWORD=<from Render Postgres>`
- `POSTGRES_HOST=<from Render Postgres>`
- `POSTGRES_PORT=5432`
- `CELERY_BROKER_URL=redis://<render-redis-host>:6379/0`
- `CELERY_RESULT_BACKEND=redis://<render-redis-host>:6379/1`
- `CELERY_TASK_ALWAYS_EAGER=False`
- `CORS_ALLOW_ALL_ORIGINS=False`
- `CORS_ALLOWED_ORIGINS=https://<frontend-domain>`

## 2) Deploy Celery worker service
Create a **Worker Service** from the same repo.

- Root directory: `backend`
- Build command:
  ```bash
  pip install -r requirements.txt
  ```
- Start command:
  ```bash
  celery -A config worker -l info
  ```

Use the same env vars as backend (DB + Redis + secrets).

## 3) Deploy Celery beat service
Create another **Worker Service**.

- Root directory: `backend`
- Build command:
  ```bash
  pip install -r requirements.txt
  ```
- Start command:
  ```bash
  celery -A config beat -l info
  ```

Use the same env vars as backend.

## 4) Deploy PostgreSQL and Redis
- Create one Render PostgreSQL instance.
- Create one Render Redis instance.
- Copy their credentials into all backend/worker/beat services.

## 5) Deploy frontend
Create a **Static Site** from this repo.

- Root directory: `frontend`
- Build command:
  ```bash
  npm ci
  npm run build
  ```
- Publish directory: `dist`
- Env var:
  - `VITE_API_BASE_URL=https://<backend-domain>/api/v1`

## 6) Post-deploy verification checklist
- Open frontend URL and confirm balances load.
- Create a payout from UI.
- Confirm payout moves from `pending/processing` to `completed` or `failed`.
- If failed, verify refund appears in transactions and available balance is restored.
- Run idempotency test manually with same `Idempotency-Key` via API client.

## Optional: one-time seed rerun
If needed, run in backend shell:
```bash
python manage.py seed
```

Seed command is idempotent by `seed:<email>` reference checks.
