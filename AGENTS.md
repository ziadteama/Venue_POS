# Venue POS — Agent Guide

Read this before writing code.

## Documentation map

| Document | Purpose |
|----------|---------|
| [docs/README.md](docs/README.md) | Team doc index |
| [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) | Setup, repo layout, ports, commands |
| [docs/DEV_CREDENTIALS.md](docs/DEV_CREDENTIALS.md) | Dev logins, PINs, where to use each app |
| [docs/TEAM_LOG.md](docs/TEAM_LOG.md) | What's built + roadmap — **update every feature** |
| [docs/PHASE3_SCALABLE_PLAN.md](docs/PHASE3_SCALABLE_PLAN.md) | Deferred features + provider flags (seat split, PDQ, vouchers) |
| [docs/PRD.md](docs/PRD.md) | User stories & acceptance criteria |
| [docs/Technical_Proposal.md](docs/Technical_Proposal.md) | Architecture & phased delivery |
| [docs/TechSpec.md](docs/TechSpec.md) | WebSocket contracts, security, deployment |
| [apps/api/prisma/schema.prisma](apps/api/prisma/schema.prisma) | **DB source of truth** |

## Stack

Node 20 · Fastify · Prisma 6 · PostgreSQL 16 · React 18 · Vite 5 · Electron 40 · Socket.IO 4 · Tailwind 3 · Zod · JWT RS256

## Monorepo

```
apps/     api, dashboard, pos, kds, local-agent
packages/ shared, i18n
```

## Roles & surfaces (locked)

**Web dashboard = hub manager / hub owner only** (`DASHBOARD_ROLES` → `hub_manager`). Enforced in `loginManager` + dashboard `ProtectedRoute`.

**POS = cashiers + venue floor manager** (same terminal). `venue_manager` uses PIN `7777` for discounts, voids, refunds, transfers, shift close, order lookup. No web login.

| Role | Dashboard (web) | POS (Electron) |
|------|-----------------|----------------|
| **hub_manager** (GM / hub owner) | All venues — menus, staff, settings, audit, analytics, orders, cheques (read), shifts/EOD | Policy PIN `9999` where API accepts hub |
| **venue_manager** (floor manager) | **No web** | Daily service + manager PIN + order lookup |
| **cashier** | **No web** | Orders + payments |
| **kitchen_staff** | **No web** | KDS only |

## Hard rules

- POS renderer → local-agent IPC only (no direct DB)
- Offline-first: SQLite → sync queue → idempotent sync
- Menu read-only on POS; **hub_manager** publishes from dashboard only
- Bilingual UI via `@venue-pos/i18n`; DB uses `nameEn`/`nameAr` with `@map`
- Prisma for all server DB access
- **KDS is optional** — `kds_enabled` / `FEATURE_KDS_ENABLED` set at provider onboarding; printer-only venues skip `apps/kds`. Still implement KDS behind the flag in Phase 2.

## Workflow

1. Check `docs/TEAM_LOG.md` for existing work
2. Find story in `docs/PRD.md`
3. Schema change → `apps/api/prisma/schema.prisma` + `npm run migrate:dev`
4. Implement: service → route → test → UI + i18n
5. WebSocket events per `docs/TechSpec.md` §8
6. Append to `docs/TEAM_LOG.md`
7. Commit: `type(scope): description`

## Commands

```bash
npm run dev              # all apps (see DEVELOPMENT.md)
npm run dev:api|dashboard|pos|kds|agent
npm run migrate:dev    # Prisma (dev)
npm run migrate        # Prisma (deploy)
npm run seed
npm run lint && npm run lint:i18n
```

## Cursor skills

`venue-pos` · `implement-user-story` · `database-schema` · `offline-sync` · `websocket-events`

## Status

**Phase 5 in progress** (`Phase-5` branch) — analytics, venue config, shifts + EOD, staff management (hub), system health, full audit log. Inventory out of scope. See `docs/TEAM_LOG.md`.

## POS app layout (`apps/pos`)

Keep Electron thin — no business logic spaghetti in `App.jsx`.

```
electron/          main.cjs + preload.cjs only
src/
  api/             local-agent HTTP client
  hooks/           session state (cheque, shift, menu, modals, sockets)
  components/      dumb UI — one concern per modal; PosModals.jsx renders all overlays
  utils/           pure helpers
  App.jsx          wiring only — hooks + layout, no new modals inline
```

**When adding POS features:** new hook or extend existing hook → new/updated component → wire in `PosModals.jsx` or layout — do not grow `App.jsx` with inline modal JSX.

## Manager workflows (quick reference)

| Action | Who initiates | Who approves | Where |
|--------|---------------|--------------|-------|
| Discount / refund | `venue_manager` (POS PIN) | — (logged for GM review) | POS |
| Void / comp / line transfer | `venue_manager` (PIN) | — (logged for review) | POS |
| GM review | `hub_manager` | Read-only + force actions | Dashboard |
| Shift over/short | Cashier | Manager PIN | POS close shift |
| Staff CRUD | `hub_manager` | — | Dashboard `/users` |

## Prompt tip (save tokens)

When continuing phase work, point the agent at **`AGENTS.md`** + **`docs/TEAM_LOG.md`** (Phase 3 section) first — not the whole repo. Use `docs/PRD.md` only for a specific user story’s acceptance criteria.

Example prefix: *Read `AGENTS.md` and `docs/TEAM_LOG.md` (Phase 3). Continue from the latest slice; don’t re-explore completed work.*
