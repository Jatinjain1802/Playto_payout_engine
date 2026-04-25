# 🚀 Playto Payout Engine: Implementation Roadmap

This document outlines the step-by-step engineering process to build the **Playto Payout Engine**. Each phase is designed to ensure **money integrity**, **concurrency safety**, and **idempotency**, while teaching you the core concepts of Django, React, and robust system design.

---

## 🛠 Phase 1: Environment Setup & Architecture
**Goal:** Create a rock-solid foundation for both Backend and Frontend.

### 1.1 Backend Initialization (Django + DRF)
We use Django because of its robust ORM and mature ecosystem for financial applications.
- **Task:** Initialize a Django project and a `payouts` app.
- **Learning Point:** Understand how Django's `settings.py` manages database connections (PostgreSQL) and background worker configurations.

### 1.2 Frontend Initialization (React + Tailwind)
- **Task:** Use Vite to create a React application.
- **Learning Point:** Setup Tailwind CSS for premium styling. We'll focus on **Atomic Design** principles for components.

---

## 💰 Phase 2: The Ledger & Data Integrity
**Goal:** Implement the "Golden Rule" of Fintech — never use floats for money.

### 2.1 Database Schema
We will define three primary models:
1.  **Merchant**: Basic profile and current balance (cached).
2.  **Transaction (Ledger)**: A "Source of Truth" log of every credit (payment in) and debit (payout out).
3.  **Payout**: Tracks the lifecycle of a withdrawal request.

### 2.2 Integrity Constraints
- **BigIntegerField:** We store everything in **paise** (100 paise = 1 INR). This avoids the precision errors inherent in floating-point math.
- **DB-Level Aggregation:** We don't calculate balance in Python. We use `Sum()` and `F()` expressions in Django to let PostgreSQL handle the math.

---

## 🔒 Phase 3: Payout API & Concurrency
**Goal:** Handle the "Double Spend" problem and duplicate requests.

### 3.1 Idempotency (The `Idempotency-Key`)
- **Mechanism:** A middleware or decorator that checks if a UUID has been used in the last 24 hours.
- **Outcome:** If a user clicks "Withdraw" twice due to lag, only one payout is created. The second call returns the *exact same* response as the first.

### 3.2 Concurrency (Database Locking)
- **Problem:** Two threads check balance simultaneously, both see ₹100, both approve a ₹60 payout.
- **Solution:** Use `select_for_update()` in Django. This places a row-level lock in PostgreSQL, forcing the second request to wait until the first transaction is committed.

---

## ⚙️ Phase 4: Background Processing (The Engine)
**Goal:** Move funds without blocking the user interface.

### 4.1 Worker Setup (Celery/Huey)
- **Task:** Create a task that simulates bank API calls.
- **Simulation Logic:**
    - 70% Success: Mark payout `COMPLETED`.
    - 20% Failure: Mark payout `FAILED` and **atomically** return funds to the ledger.
    - 10% Stuck: Keep in `PROCESSING` to test retry logic.

### 4.2 State Machine
We will implement a strict transition checker. A payout cannot go from `FAILED` to `COMPLETED`. This is critical for auditing.

---

## 🖥 Phase 5: Merchant Dashboard (React)
**Goal:** Create a "Premium" feel with real-time data.

### 5.1 Components
- **Balance Cards:** Showing Available vs. Held (Pending) funds.
- **Payout Form:** With instant validation and idempotency key generation.
- **Activity Table:** Using polling or WebSockets for live status updates.

### 5.2 Learning React
- **Hooks:** Using `useEffect` for data fetching and `useState` for UI state.
- **Context/State:** Managing global merchant data.

---

## 🧪 Phase 6: Testing & Validation
**Goal:** Prove the system works under stress.

- **Concurrency Test:** Fire 10 simultaneous requests for the same balance and verify only the correct amount is deducted.
- **Idempotency Test:** Verify that identical headers return identical responses without creating duplicate DB records.

---

## 📝 Phase 7: The Explainer
**Goal:** Finalize the `EXPLAINER.md` as required by the assignment.
- Document the exact SQL queries used for balance calculation.
- Detail the locking mechanism.
- Audit the AI-generated code for potential race conditions.

---

### 🚀 Getting Started
1. Initialize the Git repository.
2. Setup the Docker environment (PostgreSQL + Redis).
3. Start coding the models!
