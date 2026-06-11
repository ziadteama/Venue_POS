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
| **Hub manager** | Web dashboard | **All operations** — overview, menus, staff, cheques, orders, shifts, audit, health |
| **CEO** | Web dashboard | **Monitoring only** — executive overview + revenue analytics |

Cashiers do **not** use the web dashboard.

---

## Quick reference (seed accounts)

| Role | Username | Password | PIN | Where |
|------|----------|----------|-----|-------|
| CEO | `owner` | `owner123` | — | Web dashboard (executive + activity) |
| Hub manager | `admin` | `admin123` | `9999` | Web dashboard (full ops) |
| Dev ops | `devops` | `devops123` | — | Web dashboard `/ops` only |
| Cashier | `cashier1` | — | `1234` | POS only |

**Dev-only:** `venue_mgr` / PIN `7777` — **floor manager** (shift manager) on POS for discount/refund/void PIN tests. Hub manager creates real staff in **Staff** (`/users`).

**PIN rule on POS:** discount and refund accept **floor manager PIN only** (`7777`). Hub manager PIN `9999` is for web login — it does **not** authorize POS terminal refunds.

---

## Dashboard (`http://localhost:5173`)

**Who can log in:** `owner` (CEO), `admin` (hub manager), or `devops` (internal ops console).

Login: **username + password** → `POST /api/v1/auth/login`  
After login: **both roles → `/`** (different content per role)

### CEO — `owner` / `owner123` (read-only monitoring)

| Page | Path | Notes |
|------|------|-------|
| Executive overview | `/` | Net sales today/week, 7-day trend, venue performance, recent changes (3 days) |
| Analytics | `/analytics` | Revenue drill-down, presets, CSV export |

CEO has **no** access to cheques, orders, menus, staff, or other operational pages.

### Hub manager — `admin` / `admin123` (full back office)

| Page | Path | Notes |
|------|------|-------|
| Operations overview | `/` | Today net sales, refunds, open cheques/shifts, terminals, 7-day trend, recent changes |
| Menus | `/menus` | Templates, publish, translations |
| Cheques | `/cheques` | Open + paid; refunds from paid tab |
| Orders | `/orders` | Order explorer — all venues, CSV |
| Shifts | `/shifts` | All venues, EOD reconciliation |
| Staff | `/users` | Cashiers, kitchen, shift managers |
| Venue settings | `/settings` | Tax, service charge, printers, terminals |
| Activity | `/activity` | Full audit log — filters + CSV |
| System health | `/health` | Terminals, sync queue, LAN profile |

~~Approvals~~ (`/approvals`) — nav removed; use **Cheques → refund** on paid cheques.

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
| `VITE_API_URL` | `http://localhost:3000` |

Second demo till (Demo Restaurant): `VITE_TERMINAL_ID=00000000-0000-4000-8000-000000000002` (same secret).

### Staff login (cashier)

| Username | PIN | Venue |
|----------|-----|-------|
| `cashier1` | `1234` | Demo Cafe (terminal 1) |
| `cashier2` | `2345` | Demo Restaurant (terminal 2) |

POS supports PIN-only login after roster cache (log in once while API is up).

### Manager override on POS (discount / refund / void)

| Staff | PIN | Role | Notes |
|-------|-----|------|-------|
| `venue_mgr` | `7777` | `venue_manager` | **Floor manager** — required for POS discount, refund, void, comp, transfer |
| — | `9999` | hub manager web PIN | **Not accepted** on POS terminal refund/discount routes |

After any refund (POS, dashboard Cheques, or hub force-refund), all POS at the venue show a dismissible **refund notification** banner via WebSocket `manager:notification`.

Offline: discount apply/edit/remove works with cached floor manager PIN when WAN is down (local-agent).

### Cross-sell (dev seed)

- **Anchor:** Demo Cafe (`00000000-0000-4000-8000-000000000010`)
- **Target:** Demo Restaurant (`00000000-0000-4000-8000-000000000020`)
- Billing matrix enabled Cafe → Restaurant
- Requires `FEATURE_CROSS_VENUE_BILLING=true` (+ `FEATURE_MANUAL_CARD_PAYMENT=true` for card/split)

---

## Local agent (`http://127.0.0.1:3456`)

Copy `apps/local-agent/.env.example` → `.env`. Key vars for Phase 6:

| Variable | Example | Purpose |
|----------|---------|---------|
| `CLOUD_HEALTH_URL` | `http://localhost:3000/health` | WAN probe |
| `AGENT_LAN_SECRET` | shared secret | LAN peer auth |
| `AGENT_PEERS` | `192.168.1.22,192.168.1.23` | Static peer IPs for gossip |
| `AGENT_DEVICE_LABEL` | `Cafe POS-1` | Till name in banners / hub health |

See `docs/DEVELOPMENT.md` § Phase 6 and `docs/PHASE6_OFFLINE_PLAN.md` for full env table.

---

## API login (curl)

**Dashboard / manager JWT:**

```bash
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"owner","password":"owner123"}'

curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'
```

**CEO executive overview** (Bearer token from owner login):

```bash
curl http://localhost:3000/api/v1/manager/dashboard/executive \
  -H "Authorization: Bearer <token>"
```

**Hub operations overview:**

```bash
curl "http://localhost:3000/api/v1/manager/dashboard/operations" \
  -H "Authorization: Bearer <token>"
```

Optional filter: `?venueId=00000000-0000-4000-8000-000000000010`

**POS terminal PIN** (direct API — production uses local-agent):

```bash
curl -X POST http://localhost:3000/api/v1/auth/pin \
  -H "Content-Type: application/json" \
  -H "X-Terminal-ID: 00000000-0000-4000-8000-000000000001" \
  -H "X-Terminal-Secret: dev-terminal-secret" \
  -d '{"pin":"1234"}'
```

---

## Seed IDs (curl / tests)

| Resource | UUID |
|----------|------|
| Demo Cafe venue | `00000000-0000-4000-8000-000000000010` |
| Demo Restaurant venue | `00000000-0000-4000-8000-000000000020` |
| Terminal 1 (Cafe) | `00000000-0000-4000-8000-000000000001` |
| Terminal 2 (Restaurant) | `00000000-0000-4000-8000-000000000002` |
| Cashier 1 | `00000000-0000-4000-8000-000000000011` |
| Cashier 2 | `00000000-0000-4000-8000-000000000021` |

---

## Other

- **Hub manager PIN `9999`:** web dashboard login / legacy shift policy tests — not POS floor manager.
- **Re-seed** resets all accounts above; update `apps/pos/.env` if you change terminal IDs in seed.
- **Production:** rotate terminal secrets, disable seed accounts, use real staff from **Staff** (`/users`).
