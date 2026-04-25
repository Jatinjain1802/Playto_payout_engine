# Playto Payout Engine

Production-oriented payout engine built for the Playto assignment.

## What this project implements
- Integer-only merchant ledger in paise using `BigIntegerField`
- Payout API with per-merchant idempotency key handling (24h TTL)
- Concurrency-safe balance deduction using `select_for_update()`
- Payout lifecycle: `pending -> processing -> completed|failed`
- Background processing with Celery and retry for stuck payouts
- Internal merchant-to-merchant transfer API with idempotency and atomic ledger updates
- React dashboard for balances, transactions, payout requests, transfer form, and live status tracking

## Tech stack
- Backend: Django + Django REST Framework
- Worker: Celery + Redis
- Frontend: React + TypeScript + Tailwind + Vite
- Database: PostgreSQL preferred (SQLite fallback for quick local setup)

## Repository structure
- `backend/` Django API, Celery tasks, tests
- `frontend/` React dashboard
- `EXPLAINER.md` engineering decisions and required answers
- `DEPLOYMENT.md` step-by-step deployment guide
- `docker-compose.yml` local full-stack orchestration

## Local development (without Docker)

### 1) Backend API
```powershell
cd backend
python -m venv venv
.\venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
python manage.py migrate
python manage.py seed_data
python manage.py runserver 0.0.0.0:8000
```

### 2) Celery worker and beat
In a second terminal:
```powershell
cd backend
.\venv\Scripts\activate
celery -A config worker -l info --pool=solo --concurrency=1
```

In a third terminal:
```powershell
cd backend
.\venv\Scripts\activate
celery -A config beat -l info
```

### 3) Frontend
```powershell
cd frontend
npm install
npm run dev
```

Open: `http://localhost:5173`

### One-command launcher (Windows)
From repo root:
```powershell
powershell -ExecutionPolicy Bypass -File .\start-all.ps1
```

## Local development (Docker)
```bash
docker-compose up --build
docker-compose exec backend python manage.py migrate
docker-compose exec backend python manage.py seed_data
```

## API endpoints
- `POST /api/v1/payouts`
- `POST /api/v1/transfers`
- `GET /api/v1/merchants`
- `GET /api/v1/payouts/<payout_id>`
- `GET /api/v1/merchants/<merchant_id>/balance`
- `GET /api/v1/merchants/<merchant_id>/transactions`
- `GET /api/v1/merchants/<merchant_id>/payouts`

## Tests
```powershell
cd backend
.\venv\Scripts\activate
python manage.py test payouts.tests
```

Notes:
- The concurrency test is Postgres-only and is skipped on SQLite.

## Deployment
Detailed instructions are in [DEPLOYMENT.md](./DEPLOYMENT.md).

## Assignment docs
- Technical explainer: [EXPLAINER.md](./EXPLAINER.md)
- Backend details: [backend/README.md](./backend/README.md)
- Frontend details: [frontend/README.md](./frontend/README.md)
