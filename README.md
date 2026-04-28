# 🏦 Playto Payout Engine

[![Build Status](https://img.shields.io/badge/Build-Passing-brightgreen)](https://github.com/Jatinjain1802/Playto_payout_engine)
[![Framework](https://img.shields.io/badge/Backend-Django-092e20)](https://www.djangoproject.com/)
[![Library](https://img.shields.io/badge/Frontend-React-61dafb)](https://reactjs.org/)
[![Database](https://img.shields.io/badge/Database-PostgreSQL-336791)](https://www.postgresql.org/)

A high-integrity, production-grade payout engine designed to handle merchant ledgers, concurrent payout requests, and automated bank settlement simulations with strict idempotency and data integrity.

---

## 🌐 Live Demo

- **Frontend Dashboard:** [https://playto-frontend-u3fo.onrender.com/](https://playto-frontend-u3fo.onrender.com/)
- **Backend API:** [https://playto-payout-engine.onrender.com](https://playto-payout-engine.onrender.com)
- **Django Admin Panel:** [https://playto-payout-engine.onrender.com/admin](https://playto-payout-engine.onrender.com/admin)
  - **Username:** `admin`
  - **Password:** `test@2405`

---

## 🚀 Core Engineering Philosophy

This is not just a CRUD application. It is a **financial ledger system** built on three pillars:

1.  **The Ledger (Append-Only):** Balances are never stored as a single mutable column. Instead, they are derived from an immutable history of `Credit` and `Debit` transactions. This ensures a perfect audit trail.
2.  **Strict Concurrency:** Using Database-level row locking (`SELECT FOR UPDATE`), the system prevents double-spending even when multiple API requests hit the server for the same merchant balance at the exact same millisecond.
3.  **Absolute Idempotency:** Every payout request is tied to a merchant-supplied `Idempotency-Key` (24h TTL), ensuring that network retries or duplicate clicks never result in duplicate money movement.

---

## ✨ Key Features

-   **Atomic Payouts:** Funds are "Held" (Debited) at the moment of request within a database transaction.
-   **State Machine Enforcement:** Payouts follow a strict `PENDING -> PROCESSING -> COMPLETED|FAILED` flow. Transitions like `FAILED -> COMPLETED` are physically blocked in code.
-   **Background Processing:** Asynchronous payout processing using **Celery** and **Redis**.
-   **Automated Retries:** Stuck payouts (simulating bank hangs) are automatically detected and retried with exponential backoff.
-   **Internal Transfers:** Support for merchant-to-merchant balance transfers with the same integrity guarantees as payouts.
-   **Live Dashboard:** A React-based interface showing real-time balance updates, transaction history, and payout status tracking.

---

## 🏗 System Architecture

![System Flow](./system_flow.png)
*Visualizing the flow from Request -> Ledger Lock -> Background Worker -> Bank Simulation.*

---

## 🛠 Tech Stack

-   **Backend:** Django 5.x, Django REST Framework
-   **Database:** PostgreSQL (Production), SQLite (Local Dev)
-   **Task Queue:** Celery + Redis
-   **Frontend:** React 18, Vite, Tailwind CSS, Lucide Icons
-   **Deployment:** Render (Web + Worker + Redis + Postgres)

---

## 💻 Local Setup (Windows)

### Prerequisites
- Python 3.10+
- Node.js 18+
- Redis (Optional, falls back to `Always-Sync` for simple testing)
- PostgreSQL (Optional, if you want to test database locking locally. Otherwise uses SQLite)

### 1. Automatic Setup (Recommended for SQLite)
We've included a PowerShell script to boot everything at once.
```powershell
# From the root directory
powershell -ExecutionPolicy Bypass -File .\start-all.ps1
```

### 1.5. Running Locally with PostgreSQL (Optional)
If you want to use PostgreSQL locally instead of SQLite (to test concurrency):
1. Install PostgreSQL and create a database (e.g., `playto_db`).
2. Create a `backend/.env` file and add your connection string:
   ```env
   DATABASE_URL=postgres://postgres:yourpassword@localhost:5432/playto_db
   ```
3. Proceed with the manual setup steps below.

### 2. Manual Setup
**Backend:**
```powershell
cd backend
python -m venv venv
.\venv\Scripts\activate
pip install -r requirements.txt
python manage.py migrate
python manage.py seed  # Seeds 3 merchants with balance
python manage.py runserver
```

**Worker:**
```powershell
cd backend
.\venv\Scripts\activate
celery -A core worker -l info --pool=solo
```

**Frontend:**
```powershell
cd frontend
npm install
npm run dev
```

---

## 🌐 Environment Variables

### Local (`backend/.env`)
```env
DJANGO_DEBUG=True
DATABASE_URL=sqlite:///db.sqlite3
CELERY_BROKER_URL=redis://localhost:6379/0
```

### Production (Deployed on Render)
These variables were used to configure the production environment:

| Variable | Description | Value (Masked) |
| :--- | :--- | :--- |
| `DATABASE_URL` | PostgreSQL Connection String | `postgresql://...` |
| `CELERY_BROKER_URL` | Redis URL for Task Queue | `redis://...` |
| `DJANGO_SECRET_KEY` | Production Secret | `**********` |
| `DJANGO_ALLOWED_HOSTS` | Allowed Domains | `*` or `domain.com` |
| `CORS_ALLOW_ALL_ORIGINS` | CORS Configuration | `True` |
| `DJANGO_SUPERUSER_...` | Admin Credentials | `admin / test@2405` |

---

## 🧪 Testing

The project includes critical tests for concurrency and idempotency.

```powershell
cd backend
python manage.py test
```

> [!IMPORTANT]
> The **Concurrency Test** requires a PostgreSQL database to verify row-level locking. If running on SQLite, this specific test will be skipped as SQLite does not support `select_for_update()`.

---

## 📄 Documentation Links
- **[EXPLAINER.md](./EXPLAINER.md)**: Deep dive into engineering decisions (Required for Assignment).
- **[DEPLOYMENT.md](./DEPLOYMENT.md)**: Steps taken to go live on Render.

