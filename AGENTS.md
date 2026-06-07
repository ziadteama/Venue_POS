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

## Roles (locked — 3 product roles)

The product has **three roles**. Everything else (kitchen display users, POS manager PINs, legacy DB enums) is staff configuration or implementation detail — not a fourth login tier.

| Role | Surface | Responsibility |
|------|---------|----------------|
| **Cashier** | POS only | Take orders, payments, day-to-day service |
| **Hub manager** | Web dashboard | All venues in the hub — menus, staff, permissions, venue settings, activity, health, operational tracking |
| **CEO** | Web dashboard | Business view — live KPIs, analytics, revenue, cheques (read), orders explorer, shifts/EOD, approvals |

**No web login for cashiers.** POS uses PIN + terminal headers.

### Code / seed aliases

| Product name | DB role | Dev login |
|--------------|---------|-----------|
| CEO | `hub_owner` | `owner` / `owner123` |
| Hub manager | `hub_manager` | `admin` / `admin123` |
| Cashier | `cashier` | PIN `1234` (`cashier1` in seed) |

`DASHBOARD_ROLES` = CEO + hub manager. Path guards: `packages/shared/src/hub-access.js`. Role helpers: `packages/shared/src/roles.js`.

### F&B industry pattern (reference)

Matches how multi-unit restaurant platforms split responsibilities:

| Layer | Our role | Typical F&B SaaS |
|-------|----------|------------------|
| Front of house | Cashier (POS) | Server/cashier on Toast POS, Square Terminal |
| Store/shift lead | Shift manager PIN (`venue_manager` staff) | Shift manager override PIN on same terminal |
| Back office / ops | Hub manager (dashboard) | GM back office — menu, staff, store settings |
| Corporate / owner | CEO (dashboard) | Multi-location reporting, revenue, EOD, approvals |

Service flow: cashier rings sale → shift manager PIN for void/discount → refund escalates to CEO approval on dashboard → hub manager maintains menu and roster centrally.

### Dashboard page split

| Page | CEO | Hub manager |
|------|-----|-------------|
| Overview / Analytics | Yes | No |
| Cheques / Shifts / EOD / Orders / Approvals | Yes | No |
| Menus / Staff / Settings | No | Yes |
| Activity / Health | Yes | Yes |

Login redirect: CEO → `/` (overview); hub manager → `/menus`.

### POS manager actions (discount, void, refund, comp, shift close)

Handled on the **POS terminal** with a **manager PIN** — not a separate web role. Hub manager creates staff and assigns PINs/permissions from **Staff** (`/users`). Dev seed includes `venue_mgr` / PIN `7777` only for testing POS manager flows.

## Hard rules

- POS renderer → local-agent IPC only (no direct DB)
- Offline-first: SQLite → sync queue → idempotent sync
- Menu read-only on POS; **hub manager** publishes from dashboard only
- Bilingual UI via `@venue-pos/i18n`; DB uses `nameEn`/`nameAr` with `@map`
- Prisma for all server DB access
- **KDS is optional** — `kds_enabled` / `FEATURE_KDS_ENABLED` set at provider onboarding; printer-only venues skip `apps/kds`

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

**Phase 5 in progress** (`Phase-5` branch) — analytics, venue config, shifts + EOD, staff management, system health, audit log, CEO vs hub manager dashboard split. Inventory out of scope. See `docs/TEAM_LOG.md`.

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

| Action | Who initiates | Who approves / reviews | Where |
|--------|---------------|------------------------|-------|
| Orders & payments | Cashier | — | POS |
| Discount / void / comp / transfer | Staff with manager PIN | — (audit log) | POS |
| Refund request | Manager PIN on POS | CEO | Dashboard `/approvals` |
| Menus, staff, permissions | Hub manager | — | Dashboard |
| Revenue / EOD review | CEO | — | Dashboard `/analytics`, `/shifts` |
| Shift over/short | Cashier | Manager PIN | POS close shift |

## Prompt tip (save tokens)

When continuing phase work, point the agent at **`AGENTS.md`** + **`docs/TEAM_LOG.md`** (Phase 3 section) first — not the whole repo. Use `docs/PRD.md` only for a specific user story’s acceptance criteria.

Example prefix: *Read `AGENTS.md` and `docs/TEAM_LOG.md` (Phase 3). Continue from the latest slice; don’t re-explore completed work.*
