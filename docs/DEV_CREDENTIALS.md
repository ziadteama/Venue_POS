# Dev credentials (local seed)

**Local development only.** These accounts come from `npm run seed` (`apps/api/src/db/seed.js`). Never use these passwords or PINs in production.

Re-seed anytime:

```bash
npm run migrate
npm run seed
```

---

## Product roles (3)

| Role | Where | What they do |
|------|-------|--------------|
| **Cashier** | POS | Orders, payments, daily service |
| **Hub manager** | Web dashboard | All hub venues — menus, staff, permissions, settings, activity, health |
| **CEO** | Web dashboard | Analytics, revenue, cheques, orders, shifts/EOD, approvals |

Cashiers do **not** use the web dashboard.

---

## Quick reference (seed accounts)

| Role | Username | Password | PIN | Where |
|------|----------|----------|-----|-------|
| CEO | `owner` | `owner123` | — | Web dashboard |
| Hub manager | `admin` | `admin123` | `9999` | Web dashboard (+ hub policy PIN on POS when needed) |
| Cashier | `cashier1` | — | `1234` | POS only |

**Dev-only (POS manager PIN testing):** `venue_mgr` / PIN `7777` — simulates a floor lead on POS for void/discount/refund flows. Not a web login; hub manager creates real staff from **Staff** (`/users`).

Optional: kitchen users are added by hub manager in Staff — KDS only, no dashboard.

---

## Dashboard (`http://localhost:5173`)

**Who can log in:** `owner` (CEO) or `admin` (hub manager).

Login: **username + password** → `POST /api/v1/auth/login`  
After login: CEO → `/` · hub manager → `/menus`

### CEO — `owner` / `owner123`

| Page | Path | Notes |
|------|------|-------|
| Overview (live KPIs) | `/` | Revenue today, open tables, orders/min |
| Analytics | `/analytics` | Charts, presets, CSV export |
| Cheques | `/cheques` | Open + paid — investigation (actions on POS) |
| Orders | `/orders` | Order explorer — all venues, CSV |
| Shifts | `/shifts` | All venues, EOD reconciliation |
| Approvals | `/approvals` | Pending refund requests |
| Activity | `/activity` | Audit log — filters + CSV |
| System health | `/health` | Terminals, sync queue |

### Hub manager — `admin` / `admin123`

| Page | Path | Notes |
|------|------|-------|
| Menus | `/menus` | Templates, publish, translations |
| Staff | `/users` | Cashiers, kitchen, manager PINs per venue |
| Venue settings | `/settings` | Tax, service charge, printers |
| Activity | `/activity` | Audit log — filters + CSV |
| System health | `/health` | Terminals, sync queue |

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

### Cashier — `cashier1` / PIN `1234`

| Field | Dev value |
|-------|-----------|
| User | `cashier1` |
| User ID | `00000000-0000-4000-8000-000000000011` |
| PIN | `1234` |

**Current demo:** POS uses a hardcoded cashier ID (`DEMO_CASHIER_ID`) — you do not pick the cashier at login. PIN `1234` is used when the API validates cashier PIN auth (e.g. `POST /api/v1/auth/pin`).

### Manager PIN on POS

When the POS asks for a manager PIN (discount, void, refund, comp, transfer, shift close):

| PIN | Dev account | Notes |
|-----|-------------|-------|
| `7777` | `venue_mgr` | Dev floor-lead test account |
| `9999` | `admin` | Hub manager policy PIN |

### Order lookup (POS)

Header button **Orders** — search past cheques; reprint receipts. Available on POS; CEO has the full explorer on the web dashboard.

---

## Kitchen display — optional (`http://localhost:5175`)

Only if `FEATURE_KDS_ENABLED=true`. Same terminal headers as POS (`apps/kds/.env.example`). Kitchen users are created by hub manager in Staff.

---

## API / curl (direct testing)

Base URL: `http://localhost:3000`

### Dashboard login

```bash
# CEO
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"owner","password":"owner123"}'

# Hub manager
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'
```

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

Hub manager adds staff at **Staff** (`/users`). Those users get new usernames and PINs — they are not in this file until you note them locally.

CSV import format:

```csv
username,role,pin,card_uid
new_cashier,cashier,5678,
shift_lead,venue_manager,7777,
kitchen1,kitchen_staff,4321,RFID-ABC
```

---

## Related docs

- [DEVELOPMENT.md](DEVELOPMENT.md) — ports, `npm run dev`, env files
- [TEAM_LOG.md](TEAM_LOG.md) — role model and manager workflows
- [AGENTS.md](../AGENTS.md) — agent guide and permission matrix
