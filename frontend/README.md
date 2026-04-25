# Frontend - Playto Payout Engine

React + TypeScript dashboard for merchants.

## Features
- Balance cards: available, held, and total credits
- Recent transaction table
- Payout request modal with client-side validations
- Merchant-to-merchant transfer modal
- Auto-refresh every 5 seconds for payout status updates
- Manual refresh and dynamic merchant switcher from API

## Setup
```powershell
npm install
npm run dev
```

Open: `http://localhost:5173`

## Build
```powershell
npm run build
npm run preview
```

## Environment variables
Create `frontend/.env` when needed:
```bash
VITE_API_BASE_URL=http://localhost:8000/api/v1
```

For production, set `VITE_API_BASE_URL` to deployed backend URL (including `/api/v1`).

## Notes
- Payout submission sends `Idempotency-Key` in request headers.
- The form reuses the same idempotency key for retrying the same payload in one form session.
