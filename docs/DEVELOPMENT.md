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
| `discounts` | `FEATURE_DISCOUNTS_ENABLED=true` | **ON** | Cheque discount — `venue_manager` applies (POS PIN or dashboard JWT); logged for GM review. |
| `refunds` | `FEATURE_REFUNDS_ENABLED=true` | **ON** | Post-payment refund — venue manager applies; audit at `/manager/refunds` and Activity log. |
| `auto_receipt_print` | `FEATURE_AUTO_RECEIPT_PRINT=true` | **ON** | Local agent prints customer receipt on pay/refund when `KITCHEN_PRINTER_HOST` is set. |
| Kitchen printer | (venue config) | varies | Primary ticket path when KDS is OFF |

**Developing Phase 2:** Build KDS against `FEATURE_KDS_ENABLED=true` locally, but gate UI/routes/WS subscriptions so printer-only venues are unaffected. Core order send + `order:created` emit stay useful for printer integration either way.

See `docs/Technical_Proposal.md` §15.6 (feature flags) and `docs/PRD.md` (US feature-flag epic).

## Manager workflows

**Venue manager authority** (discount, refund, void, comp, line transfer): `venue_manager` PIN on POS (`7777` in seed) or JWT on dashboard. All actions audit-logged.

**GM review** (`hub_manager`): read-only **Activity log** at `/activity` — no approval queue.

**Policy PIN** (manual card above threshold, shift over/short): manager PIN on POS; hub or venue manager per policy.

Full matrix: `AGENTS.md` § Manager workflows.

## Dev credentials (after seed)

| Role | Credentials |
|------|-------------|
| Hub manager | `admin` / `admin123` (PIN `9999` for terminal-style actions) |
| Restaurant manager | `venue_mgr` / PIN `7777` (discount/refund requests from POS) |
| Cashier PIN | `1234` |
| Terminal ID | `00000000-0000-4000-8000-000000000001` |
| Terminal secret | `dev-terminal-secret` |

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
npm run seed        # optional, refresh dev data
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
| `npm run seed` | Dev data |
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
| 5 Dashboard analytics | Next | Revenue, live metrics — `docs/Technical_Proposal.md` §12 |
