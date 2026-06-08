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
| **Hub manager** | Web dashboard | **All operations** — menus, staff, cheques, orders, shifts, approvals, audit, health |
| **CEO** | Web dashboard | **Monitoring only** — live KPIs + revenue analytics |

Cashiers do **not** use the web dashboard.

---

## Quick reference (seed accounts)

| Role | Username | Password | PIN | Where |
|------|----------|----------|-----|-------|
| CEO | `owner` | `owner123` | — | Web dashboard (analytics only) |
| Hub manager | `admin` | `admin123` | `9999` | Web dashboard (full ops) |
| Cashier | `cashier1` | — | `1234` | POS only |

**Dev-only:** `venue_mgr` / PIN `7777` — shift manager on POS for void/discount/refund PIN tests. Hub manager creates real staff in **Staff** (`/users`).

---

## Dashboard (`http://localhost:5173`)

**Who can log in:** `owner` (CEO) or `admin` (hub manager).

Login: **username + password** → `POST /api/v1/auth/login`  
After login: CEO → `/` · hub manager → `/menus`

### CEO — `owner` / `owner123` (read-only monitoring)

| Page | Path | Notes |
|------|------|-------|
| Overview (live KPIs) | `/` | Revenue today, open tables, orders/min |
| Analytics | `/analytics` | Charts, presets, CSV export |

CEO has **no** access to cheques, orders, menus, staff, approvals, or other operational pages.

### Hub manager — `admin` / `admin123` (full back office)

| Page | Path | Notes |
|------|------|-------|
| Menus | `/menus` | Templates, publish, translations |
| Cheques | `/cheques` | Open + paid investigation |
| Orders | `/orders` | Order explorer — all venues, CSV |
| Shifts | `/shifts` | All venues, EOD reconciliation |
| Approvals | `/approvals` | Refund requests from POS |
| Staff | `/users` | Cashiers, kitchen, shift managers |
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

Terminal name in DB: **POS-1** · Venue: **Demo Cafe** (anchor)

### Restaurant terminal (cross-venue demos)

| Variable | Dev value |
|----------|-----------|
| `VITE_TERMINAL_ID` | `00000000-0000-4000-8000-000000000012` |
| `VITE_TERMINAL_SECRET` | `dev-terminal-secret-restaurant` |

Terminal name in DB: **POS-2** · Venue: **Demo Restaurant**

### Cashier — `cashier1` / PIN `1234` (Demo Cafe)

| Field | Dev value |
|-------|-----------|
| User | `cashier1` |
| User ID | `00000000-0000-4000-8000-000000000011` |
| PIN | `1234` |

### Cashier — `cashier2` / PIN `2345` (Demo Restaurant)

| Field | Dev value |
|-------|-----------|
| User | `cashier2` |
| PIN | `2345` |

**Cross-sell (v1):** only **POS-1 (Cafe anchor)** is required. Hub manager enables Cafe→Restaurant in **Settings → Cross-venue billing**, then on Cafe POS: open a table as usual → toggle **Cross-sell** above the menu → pick a linked venue tab → add items → **Send** → **Pay**. The first linked-venue item lazily attaches the group to the current cheque (no separate session). POS-2 is optional for standalone Restaurant demos.

### Manager PIN on POS

When the POS asks for a manager PIN (discount, void, refund, comp, transfer, shift close):

| PIN | Dev account | Notes |
|-----|-------------|-------|
| `7777` | `venue_mgr` | Shift manager (dev seed) |
| `9999` | `admin` | Hub manager policy PIN |

### Order lookup (POS)

Header button **Orders** — search past cheques; reprint receipts.

---

## Kitchen display — optional (`http://localhost:5175`)

Only if `FEATURE_KDS_ENABLED=true`. Kitchen users created by hub manager in Staff.

---

## API / curl (direct testing)

Base URL: `http://localhost:3000`

### Dashboard login

```bash
# CEO — metrics/analytics only
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"owner","password":"owner123"}'

# Hub manager — all ops routes
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

---

## Seed IDs (debugging / tests)

| Entity | UUID |
|--------|------|
| Demo Cafe (venue, anchor) | `00000000-0000-4000-8000-000000000010` |
| Demo Restaurant (venue) | `00000000-0000-4000-8000-000000000020` |
| Terminal POS-1 (Cafe) | `00000000-0000-4000-8000-000000000001` |
| Terminal POS-2 (Restaurant) | `00000000-0000-4000-8000-000000000012` |
| Cashier `cashier1` | `00000000-0000-4000-8000-000000000011` |
| Cashier `cashier2` | `00000000-0000-4000-8000-000000000012` |

---

## Staff you create in the dashboard

Hub manager adds staff at **Staff** (`/users`). **PINs must be unique across all staff in the system** (every venue and role — cashiers, kitchen, shift managers). The API rejects a PIN already used by anyone else.

```csv
username,role,pin,card_uid
new_cashier,cashier,5678,
shift_lead,venue_manager,4321,
kitchen1,kitchen_staff,8765,RFID-ABC
```

---

## Related docs

- [DEVELOPMENT.md](DEVELOPMENT.md) — ports, `npm run dev`, env files
- [TEAM_LOG.md](TEAM_LOG.md) — role model and manager workflows
- [AGENTS.md](../AGENTS.md) — agent guide and F&B role reference
