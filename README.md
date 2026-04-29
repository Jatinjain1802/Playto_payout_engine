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

---

## 🏗 System Architecture

The Playto Payout Engine follows a robust asynchronous architecture designed for high availability and data consistency.

### 🗺 High-Level Architecture
```mermaid
graph TD
    Client[React Dashboard] -- REST API --> Django[Django Backend]
    Django -- Write/Read --> PG[(PostgreSQL)]
    Django -- Enqueue Task --> Redis((Redis))
    Redis -- Fetch Task --> Celery[Celery Worker]
    Celery -- Simulate Bank API --> Bank((External Bank))
    Celery -- Update Status --> PG
```

### 🔁 Payout Sequence Diagram
This diagram illustrates the lifecycle of a payout request, including row-locking and idempotency checks.

```mermaid
sequenceDiagram
    participant C as Client (Dashboard)
    participant A as API (Django)
    participant DB as Database (Postgres)
    participant W as Worker (Celery)

    C->>A: POST /payouts/ (Amount, Idempotency-Key)
    A->>DB: SELECT ... FOR UPDATE (Lock Merchant Row)
    A->>DB: Check Idempotency Record
    alt Key Exists
        A-->>C: Return 409 Conflict / Stored Response
    else New Key
        A->>DB: Calculate Ledger Balance (Sum Credits - Debits)
        alt Insufficient Balance
            A-->>C: Return 400 Insufficient Funds
        else Sufficient Balance
            A->>DB: Create Payout (PENDING)
            A->>DB: Insert Debit Transaction (Held)
            A->>A: Trigger Background Task
            A-->>C: Return 201 Created (Payout ID)
        end
    end
    Note over A,DB: Transaction Committed (Lock Released)

    W->>DB: Fetch Payout & Update to PROCESSING
    W->>W: Simulate External Bank API Call
    alt Success
        W->>DB: Update Payout to COMPLETED
    else Failure
        W->>DB: Update Payout to FAILED
        W->>DB: Insert Credit Transaction (Refund)
    end
```

### 🌊 System Flow
The following flow ensures that money is never lost or double-spent:

1.  **Request Capture:** Idempotency key is validated to prevent duplicate processing.
2.  **Ledger Lock:** The merchant's row is locked in the database to prevent concurrent balance checks from overlapping.
3.  **Balance Check:** Current balance is computed via the ledger (`SUM(credits) - SUM(debits)`).
4.  **Atomic Debit:** A `DEBIT` transaction is recorded, and the payout is saved in `PENDING` state.
5.  **Async Processing:** Celery picks up the payout and interacts with the bank simulation.
6.  **Final Settlement:** The status is updated to `COMPLETED` or `FAILED` (triggering an automatic refund).

---

---

## 📊 Database Schema (ER Diagram)

The system is designed with a strict relational model to ensure data integrity. The **Ledger** (Transactions) and **Payouts** are decoupled but linked via reference IDs.

```mermaid
erDiagram
    MERCHANT ||--o{ BANK_ACCOUNT : owns
    MERCHANT ||--o{ TRANSACTION : has
    MERCHANT ||--o{ PAYOUT : initiates
    MERCHANT ||--o{ IDEMPOTENCY_RECORD : tracks
    
    PAYOUT ||--o| TRANSACTION : triggers_debit
    PAYOUT ||--o| IDEMPOTENCY_RECORD : associated_with

    TRANSACTION {
        string direction "credit | debit"
        bigint amount_paise
        string reference_type "payout | transfer | refund"
    }

    PAYOUT {
        uuid id PK
        string status "pending | processing | completed | failed"
        uuid idempotency_key
    }
    
    IDEMPOTENCY_RECORD {
        uuid key PK
        string request_fingerprint
        json response_body
    }
```

---

## 🖼 Visual Gallery
*Static versions of the system diagrams.*

| Architecture | System Flow | Sequence Diagram |
| :--- | :--- | :--- |
| ![Architecture](./Architecture_Diagram.png) | ![Flow](./system_flow.png) | ![Sequence](./sequence_image.png) |

---

## ⚛️ Frontend Architecture (React)

The dashboard is built with **React 18** and **Vite**, focusing on real-time feedback and robust state management.

-   **State Management:** Uses React `useState` and `useEffect` for polling payout statuses.
-   **Service Layer:** Centralized API calls in `services/api.ts` with typed responses.
-   **UX/UI:** Tailwind CSS for a clean, responsive layout with **Lucide Icons** for status visualization.
-   **Idempotency Handling:** The frontend generates a unique UUID for every payout attempt, ensuring that even if the "Submit" button is clicked multiple times, only one payout is processed.

---

## 🎓 Engineering Deep Dive (Learning Points)

### 1. Why Append-Only Ledger?
In financial systems, you **never** do `UPDATE accounts SET balance = balance - 100`. Why? Because if that update fails or if someone asks "where did my money go?", you have no audit trail.
Instead, we use a **Ledger**:
- To decrease balance: Insert a `DEBIT` row.
- To increase balance: Insert a `CREDIT` row.
- **Result:** Balance is the `SUM(credits) - SUM(debits)`. This is immutable and auditable.

### 2. The Power of `SELECT FOR UPDATE`
In a high-concurrency environment (e.g., a merchant has 5 employees all trying to withdraw money at once), two requests might see a $100 balance and both try to withdraw $100.
Using `select_for_update()`, the first request "locks" the merchant row. The second request **waits** until the first one is finished. This prevents **Double Spending**.

### 3. Idempotency vs. Duplicates
An API is **Idempotent** if making the same call multiple times has the same effect as making it once.
We achieve this by storing the `Idempotency-Key` and a **Fingerprint** (hash of the request body). If a retry comes in with the same key but different data (e.g., different amount), we reject it as a conflict.

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

