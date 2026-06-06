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
│   ├── kds/              # Kitchen display
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
| KDS | 5175 |
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

```bash
npm run dev:api              # :3000
npm run dev:dashboard        # :5173
npm run dev:agent            # :3456
npm run dev:pos              # :5174
npm run electron:dev -w @venue-pos/pos
npm run dev:kds              # :5175
```

## Dev credentials (after seed)

| Role | Credentials |
|------|-------------|
| Hub manager | `admin` / `admin123` |
| Cashier PIN | `1234` |
| Terminal ID | `00000000-0000-4000-8000-000000000001` |
| Terminal secret | `dev-terminal-secret` |

## Troubleshooting

### `npm audit` — 3 high severity (not Prisma)

After `npm install`, npm may report **3 high** findings. They are **not** from Prisma:

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

## Troubleshooting

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
DATABASE_URL=postgresql://hub_pos:hub_pos_dev@localhost:5432/hub_pos
JWT_PRIVATE_KEY_PATH=../../ops/secrets/jwt-private.pem
JWT_PUBLIC_KEY_PATH=../../ops/secrets/jwt-public.pem
```

## Team process

Append an entry to [TEAM_LOG.md](TEAM_LOG.md) after each feature. See `.cursor/rules/team-workflow.mdc`.

## Roadmap

| Phase | Status | Focus |
|-------|--------|-------|
| 0 Setup | ✅ Done | Monorepo, Prisma, auth, shells, CI |
| 1 Core POS | **Next** | Menu models, POS order flow |
| 2–9 | Planned | See `docs/Technical_Proposal.md` §12 |
