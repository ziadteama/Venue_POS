# Dev credentials (local seed)

**Local development only.** These accounts come from `npm run seed` (`apps/api/src/db/seed.js`). Never use these passwords or PINs in production.

Re-seed anytime:

```bash
npm run migrate
npm run seed
```

---

## Quick reference

| Role | Username | Password | PIN | Where to use |
|------|----------|----------|-----|--------------|
| Hub manager / hub owner (GM) | `admin` | `admin123` | `9999` | **Web dashboard only** (all venues) |
| Venue floor manager | `venue_mgr` | — | `7777` | **POS only** — manager PIN (no web login) |
| Cashier | `cashier1` | — | `1234` | **POS only** |
| Kitchen | (hub adds in Staff) | — | (set in Staff) | **KDS only** |

**Web = hub GM / hub owner.** Floor venue manager (`venue_mgr`) works on the **POS** with cashiers — PIN `7777`, not the dashboard.

---

## Dashboard (`http://localhost:5173`)

**Who:** `admin` / hub owner accounts only. `venue_mgr` **cannot** sign in here.

Login: **username + password** → `POST /api/v1/auth/login`

### Hub manager — `admin` / `admin123`

| Page | Path | Notes |
|------|------|-------|
| Overview (live KPIs) | `/` | Revenue today, open tables, orders/min |
| Analytics | `/analytics` | Charts, presets, CSV export |
| Cheques | `/cheques` | Open + paid — investigation (actions on POS) |
| Orders | `/orders` | Order explorer — all venues, CSV |
| Shifts | `/shifts` | All venues, EOD reconciliation |
| Staff | `/users` | Cashiers/kitchen per venue — PINs, RFID |
| Activity (audit log) | `/activity` | Full audit — filters + CSV |
| Menus | `/menus` | Templates, publish, translations |
| System health | `/health` | Terminals, sync queue |
| Venue settings | `/settings` | Tax, service charge, printers |

---

## POS (`http://localhost:5174`)

POS talks to the **local agent** (`http://127.0.0.1:3456`), not the API directly.

### Terminal (required for all POS API calls)

Set in `apps/pos/.env` (see `apps/pos/.env.example`):

| Variable | Dev value |
|----------|-----------|
| `VITE_TERMINAL_ID` | `00000000-0000-4000-8000-000000000001` |
| `VITE_TERMINAL_SECRET` | `dev-terminal-secret` |
| `VITE_LOCAL_AGENT_URL` | `http://127.0.0.1:3456` |

Terminal name in DB: **POS-1** · Venue: **Demo Cafe**

### Floor manager (`venue_mgr` — PIN `7777`)

Same POS as cashier. Enter PIN when prompted for discount, refund, void, comp, transfer, shift close. Header **Orders** for past cheque lookup + reprint.

### Order lookup (everyone on POS)

Header button **Orders** — search past cheques; reprint receipts. No web login.

### Cashier

| Field | Dev value |
|-------|-----------|
| User | `cashier1` |
| User ID | `00000000-0000-4000-8000-000000000011` |
| PIN | `1234` |

**Current demo:** POS uses a hardcoded cashier ID (`DEMO_CASHIER_ID`) — you do not pick the cashier at login. PIN `1234` is used when the API validates cashier PIN auth (e.g. `POST /api/v1/auth/pin`).

### Manager PINs on POS

| PIN | Role | Use on POS |
|-----|------|------------|
| `7777` | Floor manager (`venue_mgr`) | Discount, refund, void, comp, transfer, shift close |
| `9999` | Hub manager (`admin`) | Policy PIN where hub is accepted (rare on terminal) |

---

## Kitchen display — optional (`http://localhost:5175`)

Only if `FEATURE_KDS_ENABLED=true`. Same terminal headers as POS (`apps/kds/.env.example`).

---

## API / curl (direct testing)

Base URL: `http://localhost:3000`

### Manager login

```bash
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'
```

Floor manager `venue_mgr` has no dashboard login. Use `admin` for manager JWT routes in curl tests.

### Cashier PIN + terminal

```bash
curl -X POST http://localhost:3000/api/v1/auth/pin \
  -H "Content-Type: application/json" \
  -H "x-terminal-id: 00000000-0000-4000-8000-000000000001" \
  -H "x-terminal-secret: dev-terminal-secret" \
  -d '{"pin":"1234"}'
```

### Terminal-only routes (cheques, orders, shifts)

```bash
curl http://localhost:3000/api/v1/features \
  -H "x-terminal-id: 00000000-0000-4000-8000-000000000001" \
  -H "x-terminal-secret: dev-terminal-secret"
```

---

## Seed IDs (debugging / tests)

| Entity | UUID |
|--------|------|
| Demo Cafe (venue) | `00000000-0000-4000-8000-000000000010` |
| Terminal POS-1 | `00000000-0000-4000-8000-000000000001` |
| Cashier `cashier1` | `00000000-0000-4000-8000-000000000011` |

---

## Staff you create in the dashboard

Venue managers can add staff at **Staff** (`/users`). Those users get new usernames and PINs you set — they are not in this file until you note them locally.

CSV import format:

```csv
username,role,pin,card_uid
new_cashier,cashier,5678,
kitchen1,kitchen_staff,4321,RFID-ABC
```

---

## Related docs

- [DEVELOPMENT.md](DEVELOPMENT.md) — ports, `npm run dev`, env files
- [TEAM_LOG.md](TEAM_LOG.md) — role model and manager workflows
- [AGENTS.md](../AGENTS.md) — manager authority matrix
