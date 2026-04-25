# Playto Payout Engine Assignment

## 📌 Role Details
- Role: Founding Engineer (Remote, India)
- Compensation: 6–10 LPA + ESOPs
- Deadline: 5 days
- Expected Effort: 10–15 hours

---

## 🚀 Objective
Build a minimal **Payout Engine System** that allows merchants to:
- View balance
- Request payouts
- Track payout status

This system must simulate real-world financial constraints like:
- Concurrency
- Idempotency
- Data integrity

---

## 🧠 Problem Context
Playto helps Indian freelancers/agencies receive international payments:
- Customers pay in USD
- Playto collects funds
- Merchants withdraw in INR

---

## 🏗️ Core Features

### 1. Merchant Ledger
- Balance stored in **paise (integer only)**
- No float usage
- Balance = Credits - Debits
- Seed 2–3 merchants with initial credits

---

### 2. Payout API
Endpoint:
POST /api/v1/payouts

Request:
- amount_paise
- bank_account_id

Headers:
- Idempotency-Key (UUID)

Requirements:
- Prevent duplicate payouts
- Same key → same response

---

### 3. Background Worker
- Process payouts asynchronously
- Simulate outcomes:
  - 70% success
  - 20% failure
  - 10% stuck

---

### 4. Merchant Dashboard (Frontend)
- Show:
  - Available balance
  - Held balance
  - Transaction history
- Allow payout requests
- Show real-time payout status

---

## ⚠️ Critical Engineering Constraints

### 💰 Money Integrity
- Use BigIntegerField (paise)
- No floats allowed
- Use DB-level aggregation
- Ensure:
  SUM(credits) - SUM(debits) = balance

---

### 🔄 Concurrency Handling
- Prevent race conditions
- Example:
  Balance = ₹100
  Two requests of ₹60 → only one succeeds

---

### 🔁 Idempotency
- Same Idempotency-Key:
  - No duplicate payout
  - Return same response
- Keys expire after 24 hours
- Scoped per merchant

---

### 🔒 State Machine

Valid transitions:
- pending → processing → completed
- pending → processing → failed

Invalid transitions:
- completed → anything
- failed → completed

---

### 🔁 Retry Logic
- Retry stuck payouts (>30 sec)
- Exponential backoff
- Max 3 retries
- Then mark failed and refund

---

## 🛠️ Tech Stack

- Backend: Django + DRF
- Frontend: React + Tailwind
- Database: PostgreSQL
- Background Jobs: Celery / Django-Q / Huey

---

## 📦 Deliverables

- GitHub Repository
- Clean commit history
- README.md (setup instructions)
- Seed script (initial merchants)
- At least 2 tests:
  - Concurrency test
  - Idempotency test
- Live deployment (Railway / Render / Fly.io / Vercel / Koyeb)

---

## 🧾 EXPLAINER.md Requirements

You must clearly explain:

1. Ledger Design
   - Balance calculation query
   - Why credits/debits model

2. Concurrency Handling
   - Code for locking
   - DB mechanism used

3. Idempotency
   - How duplicate requests are prevented
   - Handling in-flight requests

4. State Machine
   - Where invalid transitions are blocked

5. AI Audit
   - One incorrect AI-generated code example
   - Your fix and reasoning

---

## 🎯 Evaluation Criteria

They will evaluate:
- Ledger correctness
- Concurrency handling
- Idempotency implementation
- Code understanding (EXPLAINER.md)

They will NOT evaluate:
- Fancy UI
- Extra features
- Perfect styling

---

## ⏭️ Hiring Process

1. CTO review (1–2 days)
2. Technical interview (45 min)
3. CEO discussion (30 min)
4. Offer within 48 hours

---

## 📌 Submission

Submit:
- GitHub repo link
- Live deployment URL
- Short note

---

## ⚡ Summary

Build a **production-like payout system** focusing on:
- Correct balance handling
- Safe concurrent transactions
- Duplicate request prevention
- Reliable state transitions
