# 🏦 Playto Pay — Founding Engineer Task Breakdown & Checklist

> **Role:** Founding Engineer | **Compensation:** 6–10 LPA + ESOPs | **Deadline:** 5 days from receipt
> **Estimated Effort:** 10–15 hours of focused work

---

## 📋 Overview

Build a minimal but production-grade **Payout Engine** for Playto Pay — a platform that helps Indian agencies and freelancers collect international payments. The engine must handle merchant balances, payout requests, and payout lifecycle with strict attention to **concurrency**, **idempotency**, and **data integrity**.

---

## ✅ Master Checklist

### 1. 🏗️ Project Setup

- [x] Initialize Django + DRF backend project
- [x] Set up React + Tailwind frontend project
- [x] Configure PostgreSQL as the database
- [x] Set up background job worker: Celery, Django-Q, or Huey (no faking with sync code)
- [x] Create clean Git repository with structured commit history
- [x] Write `README.md` with full local setup instructions

---

### 2. 💰 Merchant Ledger (Data Model)

- [x] Store all monetary amounts as **integers in paise** (`BigIntegerField`) — no `FloatField`, no `DecimalField`
- [x] Model separate `Credit` and `Debit` records per merchant
- [x] Balance must be **derived from DB-level aggregation** (`SUM(credits) - SUM(debits)`), not Python arithmetic on fetched rows
- [x] Seed **2–3 merchants** with existing credit history via a seed script
- [x] Verify invariant: `SUM(credits) - SUM(debits) == displayed balance` at all times

---

### 3. 🔌 Payout Request API

- [x] `POST /api/v1/payouts` endpoint implemented
- [x] Accepts `Idempotency-Key` in the request header (merchant-supplied UUID)
- [x] Request body includes `amount_paise` (integer) and `bank_account_id`
- [x] Creates payout in **`pending`** state and immediately **holds the funds**
- [x] Returns **identical response** for duplicate calls with the same idempotency key
- [x] Idempotency keys are **scoped per merchant** (same key, different merchant = new payout)
- [x] Idempotency keys **expire after 24 hours**

---

### 4. ⚙️ Payout Processor (Background Worker)

- [x] Background worker picks up `pending` payouts
- [x] Simulates bank settlement with the correct probability:
  - [x] **70%** → `completed` (success, payout is final)
  - [x] **20%** → `failed` (funds returned to merchant balance)
  - [x] **10%** → stays in `processing` (simulate hang)
- [x] On failure, funds are **atomically returned** along with the state transition
- [x] Payouts stuck in `processing` for **more than 30 seconds** are retried
- [x] Retry uses **exponential backoff**, max **3 attempts**, then moves to `failed` and returns funds

---

### 5. 🔒 Concurrency & Integrity (Critical)

- [x] Race condition handled: two simultaneous payout requests for more than available balance → **exactly one succeeds**, other is **cleanly rejected**
- [x] Balance check and deduction done via **database-level locking** (e.g., `SELECT FOR UPDATE`) — not Python-level check-then-act
- [x] No double-spend possible under any concurrent scenario
- [x] Atomic transactions used wherever balance changes occur

---

### 6. 🔄 State Machine (Strict)

- [x] Legal transitions enforced:
  - `pending` → `processing` → `completed` ✅
  - `pending` → `processing` → `failed` ✅
- [x] Illegal transitions blocked in code:
  - `completed` → any state ❌
  - `failed` → `completed` ❌
  - Any backwards transition ❌
- [x] State transition enforcement is explicit and visible in code (not just implicit)

---

### 7. 🖥️ Merchant Dashboard (React Frontend)

- [x] Displays **available balance** (in INR or paise, clearly labeled)
- [x] Displays **held balance** (funds locked in pending/processing payouts)
- [x] Shows **recent credits and debits** with timestamps
- [x] Form to **request a payout** (enter amount + bank account)
- [x] Table of **payout history** with status column
- [x] **Live status updates** (polling or WebSocket) — no manual refresh needed

---

### 8. 🧪 Tests (Minimum 2 Required)

- [x] **Concurrency test:** Two simultaneous payout requests exceeding balance — assert exactly one succeeds
- [x] **Idempotency test:** Same `Idempotency-Key` sent twice — assert same response, no duplicate payout created

---

### 9. 🚀 Deployment

- [ ] Deploy backend to a free host: Railway, Render, Fly.io, or Koyeb
- [ ] Deploy frontend to Vercel or same host
- [ ] Seed the live deployment with test merchant data
- [ ] Verify all features work on the live URL before submitting

---

### 10. 📄 EXPLAINER.md (Most Important Document)

Answer all 5 questions **short, specific, and with code snippets**. This is where most candidates are filtered out.

- [x] **Q1 – The Ledger:** Paste your balance calculation query. Explain why credits and debits are modeled this way.
- [x] **Q2 – The Lock:** Paste the exact code that prevents two concurrent payouts from overdrawing. Name the DB primitive used (e.g., `SELECT FOR UPDATE`).
- [x] **Q3 – The Idempotency:** Explain how the system detects a seen key. What happens if the first request is still in-flight when the second arrives?
- [x] **Q4 – The State Machine:** Show the exact code location where `failed → completed` (or any illegal transition) is blocked.
- [x] **Q5 – The AI Audit:** Give one specific example where AI wrote subtly wrong code. Paste the bad version, what you caught, and the corrected version.

---

### 11. 🎁 Optional Bonuses (Pick What You Care About)

- [ ] `docker-compose.yml` for one-command local setup
- [ ] Event sourcing for the ledger
- [ ] Webhook delivery with retries on payout status change
- [ ] Audit log for all balance-affecting operations

---

## 🗓️ Suggested Timeline (5 Days)

| Day | Focus |
|-----|-------|
| **Day 1** | Project setup, data models, seed script, basic API |
| **Day 2** | Concurrency logic, idempotency, state machine |
| **Day 3** | Background worker, retry logic, bank simulation |
| **Day 4** | React dashboard, live status updates, tests |
| **Day 5** | Deployment, EXPLAINER.md, cleanup & submission |

---

## 🎯 What Actually Gets Graded

| Area | What It Proves |
|------|---------------|
| Clean ledger model | You think like someone owning money-moving systems |
| Correct concurrency | You know DB-level vs Python-level locking |
| Solid idempotency | You've shipped APIs that deal with real networks |
| Sharp EXPLAINER.md | You understand your own code |
| Honest AI audit | You're senior enough to not trust AI blindly |

> **Not graded:** Pixel-perfect UI, 100% test coverage, fancy design patterns, extra features.

---

## 📬 Submission

1. Fill out the form: [https://forms.gle/71gdyG9Kyvddr7Vu6](https://forms.gle/71gdyG9Kyvddr7Vu6)
2. Include: GitHub repo link, live deployment URL, short note on what you're most proud of
3. Questions? Email: [sanhik@playto.so](mailto:sanhik@playto.so) — do NOT DM on LinkedIn/Instagram

> ⚠️ **Late submissions will not be reviewed.**

---

## 🔔 What Happens After Submission

1. CTO reviews code + EXPLAINER.md within 1–2 days
2. If shortlisted → 45-min technical call with CTO
3. Final 30-min chat with CEO
4. Offer within 48 hours of final chat

---

*Join the WhatsApp community for updates: [Link to Join](https://chat.whatsapp.com/IoftIZP9YKKBDUtKGKD19n)*
