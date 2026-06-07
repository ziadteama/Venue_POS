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
| Hub manager (GM) | `admin` | `admin123` | `9999` | Dashboard (full GM access) |
| Venue manager | `venue_mgr` | `venue123` | `7777` | Dashboard (venue ops) + POS manager actions |
| Cashier | `cashier1` | — | `1234` | POS (future PIN login); today demo uses fixed cashier ID |

---

## Dashboard (`http://localhost:5173`)

Login: **username + password** → `POST /api/v1/auth/login`

### Hub manager — `admin` / `admin123`

| Page | Path | Notes |
|------|------|-------|
| Overview (live KPIs) | `/` | Revenue today, open tables, orders/min |
| Analytics | `/analytics` | Charts, presets, CSV export |
| Cheques | `/cheques` | Open + paid tabs, GM actions |
| Shifts | `/shifts` | All venues (venue filter), EOD reconciliation |
| Activity (audit log) | `/activity` | Full audit — filters + CSV |
| System health | `/health` | Terminals, sync queue, server memory |
| Venue settings | `/settings` | Tax, service charge, printers |

**Cannot access:** Orders, Menus, Staff (venue-manager only).

### Venue manager — `venue_mgr` / `venue123`

| Page | Path | Notes |
|------|------|-------|
| Overview | `/` | Own venue metrics |
| Analytics | `/analytics` | Own venue |
| Orders | `/orders` | Shift → cheque → order rounds |
| Cheques | `/cheques` | Discount / refund on open & paid |
| Shifts | `/shifts` | Own venue shifts + EOD |
| Menus | `/menus` | Edit template, publish, translations |
| Staff | `/users` | Add cashiers/kitchen, reset PIN, deactivate |
| System health | `/health` | Own venue terminals |

**Cannot access:** Activity, Venue settings (hub only).

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

### Cashier

| Field | Dev value |
|-------|-----------|
| User | `cashier1` |
| User ID | `00000000-0000-4000-8000-000000000011` |
| PIN | `1234` |

**Current demo:** POS uses a hardcoded cashier ID (`DEMO_CASHIER_ID`) — you do not pick the cashier at login. PIN `1234` is used when the API validates cashier PIN auth (e.g. `POST /api/v1/auth/pin`).

### Manager PIN on POS (venue manager actions)

Enter when prompted for discount, refund, void, comp, line transfer, shift close, or manual card above threshold:

| PIN | Role | Use on POS |
|-----|------|------------|
| `7777` | Venue manager (`venue_mgr`) | Discount, refund, void, comp, transfer |
| `9999` | Hub manager (`admin`) | Policy PIN where hub manager is accepted |

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

```bash
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"venue_mgr","password":"venue123"}'
```

Use the returned `accessToken` as `Authorization: Bearer <token>` on manager routes.

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
