# Development Guide

How to run Venue POS locally. Share this with every new team member.

## Prerequisites

| Tool | Version |
|------|---------|
| Node.js | 20 LTS |
| npm | 10+ |
| Docker Desktop | Latest (for Postgres + Redis) |
| Git | Latest |

Optional: [Prisma Studio](https://www.prisma.io/studio) via `npm run db:studio -w @venue-pos/api`

## Repository layout

**Apps** are deployable; **packages** are shared libraries.

```
Venue_POS/
├── apps/
│   ├── api/              # Fastify + Prisma + PostgreSQL
│   ├── dashboard/        # React admin (Vite + Tailwind)
│   ├── pos/              # Electron kiosk POS
│   ├── kds/              # Kitchen display (optional per deployment)
│   └── local-agent/      # SQLite + sync + printers (:3456)
├── packages/
│   ├── shared/           # ROLES, ERROR_CODES
│   └── i18n/             # en.json, ar.json
├── docs/                 # Product + team docs
├── docker/               # Dockerfile.api
└── ops/                  # nginx, JWT secrets
```

### Layer boundaries

| Layer | Talks to | Must not |
|-------|----------|----------|
| Dashboard | API (HTTPS) | Access DB directly |
| POS renderer | Local agent (IPC) | Access SQLite or Postgres |
| Local agent | SQLite + API | Render UI |
| API | Postgres via Prisma | Serve POS static assets |

### What goes where

| Change | Location |
|--------|----------|
| DB table | `apps/api/prisma/schema.prisma` + migration |
| REST endpoint | `apps/api/src/routes/` + `services/` |
| Admin screen | `apps/dashboard/src/pages/` |
| POS screen | `apps/pos/src/` |
| UI string | `packages/i18n/locales/*.json` |
| Shared constant | `packages/shared/src/` |

### Ports

| Service | Port |
|---------|------|
| API | 3000 |
| Dashboard | 5173 |
| POS | 5174 |
| KDS (optional) | 5175 |
| Local agent | 3456 |
| Postgres | 5432 |
| Redis | 6379 |

## First-time setup

```bash
git clone <repo-url> Venue_POS
cd Venue_POS
npm install
npm run generate:jwt-keys
docker compose up -d postgres redis

cp apps/api/.env.example apps/api/.env
cp apps/dashboard/.env.example apps/dashboard/.env

npm run migrate
npm run seed
# alias:
npm run db:seed
```

## Daily workflow

### One command (recommended)

```bash
npm run setup:node20   # once — rebuilds sqlite/bcrypt (scripts/node20.mjs)
npm run dev:stop       # if ports stuck from a prior run
npm run dev            # starts full stack; uses Node 20 even when shell has Node 24
```

**Windows + nvm:** `nvm use 20` often needs Administrator. `npm run dev` picks up nvm’s Node 20 automatically via `scripts/node20.mjs` — no `nvm use` required.

Run from the **repo root** (`Venue_POS/`), not `apps/api/`:

```bash
cd Venue_POS
npm run dev
```

Starts **API** (:3000), **dashboard** (:5173), **local-agent** (:3456, after API is healthy), and **POS** (Electron + :5174).  
Postgres must already be running (`pgAdmin` or `npm run docker:up`).

`npm run dev` automatically frees ports 3000, 3456, 5173–5175 from a crashed prior session before starting.

| Flag | Effect |
|------|--------|
| `npm run dev -- --browser` | POS in browser only (no Electron window) |
| `npm run dev -- --kds` | Also start KDS Vite (:5175) |
| `npm run dev -- --docker` | Start Redis container before apps |
| `npm run dev -- --no-stop` | Skip automatic port cleanup |
| `npm run dev:stop` | Manually kill processes on dev ports |

If you still see **`EADDRINUSE`**, run `npm run dev:stop`, then `npm run dev` again.

### Individual apps (if you prefer separate terminals)

```bash
npm run dev:api              # :3000
npm run dev:dashboard        # :5173
npm run dev:agent            # :3456
npm run dev:pos              # :5174 (Vite only)
npm run electron:dev -w @venue-pos/pos
npm run dev:kds              # :5175 (optional)
```

## Optional features (provider onboarding)

Not every hub needs every app. During **provider / client onboarding**, feature flags choose what gets deployed and shown. The monorepo still contains all apps; flags control runtime behaviour and ops focus.

| Flag | Env (dev) | Default | When OFF |
|------|-------------|---------|----------|
| `kds_enabled` | `FEATURE_KDS_ENABLED=false` | ON in spec; **turn OFF** for printer-only kitchens | No KDS installer, no `venue:*:kitchen` WS clients required. Orders still **send to kitchen** via API + printer. `apps/kds` not run in prod. |
| `manual_card_payment` | `FEATURE_MANUAL_CARD_PAYMENT=false` | **OFF** (cash-only venues) | POS hides card / split-card pay; API rejects `method: card`. Set `true` when the client uses an external PDQ and cashiers record card manually (US-5.3). |
| `line_transfer` | `FEATURE_LINE_TRANSFER=false` | **OFF** | POS hides transfer UI; API rejects line moves. Set `true` when venues move fired lines between tables (manager PIN + audit). |
| `discounts` | `FEATURE_DISCOUNTS_ENABLED=true` | **ON** | Cheque discount — manager PIN on POS; logged for CEO/hub review in Activity. |
| `refunds` | `FEATURE_REFUNDS_ENABLED=true` | **ON** | Post-payment refund — manager PIN on POS; CEO approves on dashboard when required. |
| `auto_receipt_print` | `FEATURE_AUTO_RECEIPT_PRINT=true` | **ON** | Local agent prints customer receipt on pay/refund when `KITCHEN_PRINTER_HOST` is set. |
| `cross_venue_billing` | `FEATURE_CROSS_VENUE_BILLING=false` | **OFF** | Anchor POS **Cross-sell** toggle; lazy `crossVenueGroupId`; group fire/pay. Hub enables pairs in Settings. |
| Kitchen printer | (venue config) | varies | Primary ticket path when KDS is OFF |

**Developing Phase 2:** Build KDS against `FEATURE_KDS_ENABLED=true` locally, but gate UI/routes/WS subscriptions so printer-only venues are unaffected. Core order send + `order:created` emit stay useful for printer integration either way.

See `docs/Technical_Proposal.md` §15.6 (feature flags) and `docs/PRD.md` (US feature-flag epic).

## Manager workflows

**Three product roles:** cashier (POS), hub manager (dashboard ops), CEO (dashboard revenue). See `AGENTS.md`.

**POS manager PIN** (discount, refund, void, comp, line transfer): staff with manager permissions — hub manager creates them in **Staff**. Dev seed uses `venue_mgr` / PIN `7777` for testing.

**CEO** reviews revenue on `/` (executive overview) and `/analytics` (read-only). **Hub manager** lands on `/` (operations overview), then menus, staff, venue settings, shifts, cheques/refunds, and audit.

### Dashboard (June 2026 refresh)

| Role | Default after login | Key pages |
|------|---------------------|-----------|
| CEO | `/` | Executive overview, `/analytics` |
| Hub manager | `/` | Operations overview, `/menus`, `/cheques`, `/shifts`, `/orders`, `/activity`, `/health` |

Shared UI: KPI cards with period comparison, 7-day net-sales chart, recent business changes (last 3 days). See `apps/dashboard/src/components/dashboard/`.

API summary endpoints: `GET /api/v1/manager/dashboard/executive` (CEO) · `GET /api/v1/manager/dashboard/operations` (hub manager).

### POS floor manager (shift manager)

**Floor manager** = DB role `venue_manager` (dev seed `venue_mgr`, PIN `7777`). On POS only — not a web login.

- **Discount** apply/edit/remove — floor manager PIN required (offline supported for apply/edit/remove when WAN down)
- **Refund** on paid cheque — floor manager PIN only; hub manager PIN `9999` does **not** work on POS
- After any refund, all POS at the venue show a notification banner naming cheque, amount, and authorizing manager

Hub manager still processes refunds from **Cheques** on the dashboard (JWT login, no PIN on web).

## Dev credentials (after seed)

See **[DEV_CREDENTIALS.md](DEV_CREDENTIALS.md)** for full logins, PINs, terminal headers, dashboard pages per role, and curl examples.

Quick: CEO `owner` / `owner123` · hub manager `admin` / `admin123` · cashier PIN `1234` · POS manager PIN `7777` (dev) · terminal secret `dev-terminal-secret`

## Troubleshooting

### `npm audit` (not Prisma)

If `npm audit` reports highs, they are usually **Electron** or legacy **tar** — not Prisma. After the pinned versions below, expect **0 vulnerabilities**:

| Package | Source | Risk context | Action |
|---------|--------|--------------|--------|
| `electron` | `apps/pos` + `apps/kds` dev shells | Dev/desktop only; POS loads localhost in dev | Pin `^40.x` (Node 20 compatible). **Do not** jump to `42.x` without upgrading Node to ≥22 |
| `tar` | old `bcrypt@5` → `@mapbox/node-pre-gyp` | Install-time extraction only | Fixed: `bcrypt@6` (no `node-pre-gyp`). Root `overrides` kept as belt-and-suspenders |

**Do not** run `npm audit fix --force` blindly — it can jump Electron major versions without testing the POS/KDS shells.

If audit still reports old `electron@33` after `git pull`, refresh the lockfile:

```bash
npm install electron@40.10.2 -w @venue-pos/pos -w @venue-pos/kds --save-dev
```

Prisma deprecation (`package.json#prisma`) is fixed via `apps/api/prisma.config.ts`. Upgrading Prisma (`^6.x`) is normal maintenance, not required for the EPERM issue.

### `EPERM` on `query_engine-windows.dll.node` (Windows)

Prisma replaces the query engine DLL during `prisma generate`. On Windows — especially on **mapped drives** (`Z:`) — that rename fails if the file is locked.

**You will only see** `prisma-generate: moved locked query engine aside, retrying…` when the first generate attempt failed and the script retried. On a local `C:` drive with no servers running, generate is usually silent.

**Fix (in order):**

1. Stop all Node dev servers (`dev:api`, `dev:agent`, Prisma Studio).
2. Run `npm run db:generate` (retry-safe wrapper in `scripts/prisma-generate.mjs`).
3. If it still fails, close apps indexing the repo (antivirus, backup sync) and retry.
4. Last resort: clone/work from a local path such as `C:\dev\Venue_POS` instead of a network share.

`npm install` runs the same generate script via root `postinstall` (once per install).

### Team checklist after `git pull`

```bash
nvm use 20          # or 20.20.2 — match .nvmrc if present
npm install         # runs postinstall → prisma generate
npm run db:generate # only if install warned or API fails with Prisma client errors
npm run migrate     # if migrations changed
npm run seed
# alias:
npm run db:seed        # optional, refresh dev data
```

If `npm install` fails on Prisma generate, **stop dev servers first**, then `npm run db:generate`, then `npm install` again.

## Common commands

| Command | Purpose |
|---------|---------|
| `npm run lint` | ESLint |
| `npm run lint:i18n` | en/ar key parity |
| `npm run migrate:dev` | Prisma migration (dev) |
| `npm run migrate` | Prisma deploy (CI/prod) |
| `npm run db:generate` | Regenerate Prisma client |
| `npm run seed` | Dev data (owner / owner123) |
| `npm run db:seed` | Same as `npm run seed` |
| `npm run test -w @venue-pos/api` | API tests |

## Prisma workflow

Config lives in `apps/api/prisma.config.ts` (schema path, migrations, seed). Do not add a `"prisma"` block back to `package.json`. Do not put `env('DATABASE_URL')` in the config — `npm ci` runs `prisma generate` before any DB exists (CI lint job).

1. Edit `apps/api/prisma/schema.prisma` (source of truth for DB)
2. `npm run migrate:dev -- --name describe_change`
3. Commit schema + `prisma/migrations/` folder
4. Log in `docs/TEAM_LOG.md`

## API health checks

```bash
curl http://localhost:3000/health
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'
```

### Other common problems

| Problem | Fix |
|---------|-----|
| JWT keys missing | `npm run generate:jwt-keys` |
| Can't reach database | `docker compose up -d postgres` |
| Prisma client stale | `npm run db:generate` |
| Docker pipe not found | Start Docker Desktop |
| POS offline | Start `npm run dev:agent` first |
| i18n lint fails | Add keys to both `en.json` and `ar.json` |

## Environment variables

Never commit `.env`. Templates: `apps/*/.env.example`.

```
# postgresql://USER:PASSWORD@HOST:PORT/DATABASE
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@localhost:5432/hub_pos
JWT_PRIVATE_KEY_PATH=../../ops/secrets/jwt-private.pem
JWT_PUBLIC_KEY_PATH=../../ops/secrets/jwt-public.pem
```

Use database name **`hub_pos`** (create it in pgAdmin if empty). Docker Compose uses user `hub_pos` instead of `postgres` — pick one stack and match `.env`.

## Team process

Append an entry to [TEAM_LOG.md](TEAM_LOG.md) after each feature. See `.cursor/rules/team-workflow.mdc`.

## Roadmap

| Phase | Status | Focus |
|-------|--------|-------|
| 0 Setup | ✅ Done | Monorepo, Prisma, auth, shells, CI |
| 1 Core POS | ✅ Done | Menu, modifiers, POS order flow, send to kitchen |
| 2 Kitchen | ✅ Done (optional KDS) | Printer, item status, void — [TEAM_LOG.md](TEAM_LOG.md) |
| 3 Cheques & payments | ✅ Closed (`phase-3`) | Open tabs, pay, split, shifts, discounts/refunds — [TEAM_LOG.md](TEAM_LOG.md) |
| 4 Cross-venue billing | ✅ Closed | Cross-sell, split pay, group % discount, itemized receipt — US-4.1–4.3, US-8.6 — [TEAM_LOG.md](TEAM_LOG.md) |
| 5 Dashboard (Epic 8) | ✅ Done | Epic 8 complete (US-8.6 shipped in Phase 4) — [TEAM_LOG.md](TEAM_LOG.md) |
| 6 Offline sync | ✅ Complete | Full offline ops, cross-sell coordinator, test harness — [PHASE6_OFFLINE_PLAN.md](PHASE6_OFFLINE_PLAN.md) |

## Phase 6 — offline sync & LAN coordinator

See [PHASE6_OFFLINE_PLAN.md](PHASE6_OFFLINE_PLAN.md). POS talks to `local-agent` only; agent caches menu, staff PINs, features, and replays `sync_queue` when cloud returns.

**v1.1:** Agents gossip on LAN (`AGENT_PEERS`), elect a relay when any peer still has WAN, or a lead till when all WAN is down. Open cheques are pre-hydrated while online. Each agent reports its till name, LAN IP, and cluster mode to the hub on startup and heartbeat.

### Agent env (`apps/local-agent/.env`)

| Variable | Purpose |
|----------|---------|
| `CLOUD_HEALTH_URL` | WAN probe (default API `/health`) |
| `AGENT_LAN_HOST` | Advertised LAN IP (auto-detected if empty) |
| `AGENT_LAN_PORT` | Peer gossip + relay port (default `3456`) |
| `AGENT_LAN_SECRET` | Shared secret for LAN peer/relay routes |
| `AGENT_PEERS` | Comma-separated static peer IPs for gossip |
| `AGENT_PRIORITY` | Leader election priority (higher wins ties) |
| `AGENT_DEVICE_LABEL` | Local till display name override (hub name used if empty) |
| `COORDINATOR_TERMINAL_ID` | Hub-designated coordinator terminal UUID |
| `COORDINATOR_LAN_HOST` | Fixed LAN IP/hostname of coordinator machine |
| `COORDINATOR_FALLBACK_ENABLED` | `true` — route floor/coordination to coordinator when WAN down |
| `IS_COORDINATOR` | `true` on the lead till running coordinator SQLite |

Hub manager sets coordinator and till names in **Settings → Terminals** (persists `name`, `isCoordinator`, `coordinatorLanHost`; agents report `lastLanHost` / `lastClusterMode` via heartbeat).

### Windows service (coordinator till)

Run the coordinator `local-agent` outside Electron so floor locks survive POS close:

```powershell
# From repo root — install deps once
npm install -w @venue-pos/local-agent

# Option A: NSSM (https://nssm.cc)
nssm install VenuePosAgent "C:\Program Files\nodejs\node.exe" "Z:\Plegmo\Venue_POS\apps\local-agent\src\index.js"
nssm set VenuePosAgent AppDirectory "Z:\Plegmo\Venue_POS\apps\local-agent"
nssm set VenuePosAgent AppEnvironmentExtra "IS_COORDINATOR=true" "COORDINATOR_FALLBACK_ENABLED=true"
nssm start VenuePosAgent

# Option B: pm2
npm i -g pm2
cd apps/local-agent && pm2 start src/index.js --name venue-pos-agent
```

### Verify offline

1. `npm run dev:agent` + POS with terminal env set.
2. Stop API (`dev:api`) → PIN login (cached roster), open table, add items, cash pay.
3. Start API → agent drains queue; one server cheque.
4. `npm run test -w @venue-pos/api` (includes `phase6-offline.test.js`).
5. `npm run test -w @venue-pos/local-agent` (unit + E2E harness).

### Phase 6 manual test matrix (no production env)

Automated equivalent: `npm run test -w @venue-pos/local-agent` → `test/e2e/phase6-matrix.test.js` (all 10 scenarios). Use the table below for on-hardware smoke before release.

| # | Scenario | Steps | Expected |
|---|----------|-------|----------|
| 1 | Single-venue offline pay | Online login → stop API → open table → send → pay cash → start API | One server cheque; queue empty; offline banner clears |
| 2 | Coordinator floor lock | Two POS agents; mark coordinator; stop API; occupy Table 5 on POS A | POS B floor shows Table 5 busy via coordinator |
| 3 | Cross-sell offline | Enable billing matrix; coordinator + linked menus cached; stop API; Cross-sell → add anchor + target items → send → pay | Group paid locally; one atomic replay on reconnect |
| 4 | Manager ops offline | Offline: clear draft, move table, split, line transfer (floor manager PIN) | Ops succeed locally; replay without duplicates |
| 5 | Refund blocked offline | Offline: attempt refund on paid cheque | Clear “Refunds require hub connection” message (no crash) |
| 6 | Failed sync review | Force bad queue row → banner Review → retry/dismiss | Operator can clear or retry |
| 7 | Menu stale gate | Reconnect with stale menu hash | New orders blocked until menu sync completes |
| 8 | Power-loss | Kill agent mid-order → restart agent | SQLite WAL intact; open cheque + queue preserved |
| 9 | Cloud flap | Toggle API on/off rapidly | Cluster mode hysteresis; no split-brain floor state |
| 10 | Duplicate replay | Replay same `syncId` twice | 409 `DUPLICATE_SYNC_ID`; no double payment |
