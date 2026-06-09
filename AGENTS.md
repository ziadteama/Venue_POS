# Venue POS — Agent Guide

Read this before writing code.

## Documentation map

| Document | Purpose |
|----------|---------|
| [docs/README.md](docs/README.md) | Team doc index |
| [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) | Setup, repo layout, ports, commands |
| [docs/DEV_CREDENTIALS.md](docs/DEV_CREDENTIALS.md) | Dev logins, PINs, where to use each app |
| [docs/TEAM_LOG.md](docs/TEAM_LOG.md) | What's built + roadmap — **update every feature** |
| [docs/PHASE3_SCALABLE_PLAN.md](docs/PHASE3_SCALABLE_PLAN.md) | Deferred features + provider flags |
| [docs/PHASE6_OFFLINE_PLAN.md](docs/PHASE6_OFFLINE_PLAN.md) | **Next** — offline sync + LAN coordinator POS |
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

| Role | Surface | Responsibility |
|------|---------|----------------|
| **Cashier** | POS only | Orders, payments, daily service |
| **Hub manager** | Web dashboard | **All operations** — menus, staff, permissions, settings, cheques, orders, shifts/EOD, audit, health |
| **CEO** | Web dashboard | **Monitoring only** — live KPIs + revenue analytics (read-only, no operations) |

**No web login for cashiers.** POS uses PIN + terminal headers.

### Code / seed aliases

| Product name | DB role | Dev login |
|--------------|---------|-----------|
| CEO | `hub_owner` | `owner` / `owner123` |
| Hub manager | `hub_manager` | `admin` / `admin123` |
| Cashier | `cashier` | PIN `1234` (`cashier1` in seed) |

Path guards: `packages/shared/src/hub-access.js`. Role helpers: `packages/shared/src/roles.js`.

### F&B industry pattern (reference)

How multi-unit restaurant platforms (Toast, Lightspeed, Square) typically split access:

| Layer | Our role | F&B equivalent |
|-------|----------|----------------|
| Front of house | Cashier (POS) | Server/cashier terminal |
| Shift override PIN | Shift manager staff (`venue_manager`) | Manager PIN on same POS for discount/void |
| Back office / GM | Hub manager (dashboard) | Store admin — menu, roster, refunds, EOD, audit |
| Owner / investor | CEO (dashboard) | Corporate reporting portal — revenue dashboards only |

**Service flow:** cashier rings sale → **manager PIN on POS** for discount/void/refund request → **hub manager** force-refunds from **Cheques** (or direct `/approvals` URL if re-enabled) → **CEO** reviews revenue trends without touching operations.

**Cross-sell (Phase 4):** anchor POS only — **Standard / Cross-sell** toggle above menu; lazy `crossVenueGroupId` on current table; one cheque per venue; **one Pay** settles the group (cash, card, or split cash+card — proportional per venue). **Group discount:** percent only at anchor (manager PIN). Combined receipt: itemized lines per venue. Online-only (`FEATURE_CROSS_VENUE_BILLING`); card/split need `FEATURE_MANUAL_CARD_PAYMENT=true`.

### Dashboard page split

| Page | CEO | Hub manager |
|------|-----|-------------|
| Overview / Analytics | Yes (read-only) | No |
| Menus / Staff / Settings | No | Yes |
| Cheques / Orders / Shifts | No | Yes |
| Activity / Health | No | Yes |

Login redirect: CEO → `/` · hub manager → `/menus`.

### POS manager PIN

Discount, void, comp, transfer, shift close — **manager PIN on the POS**, not a web login. Hub manager creates shift managers and cashiers in **Staff** (`/users`). Dev seed: `venue_mgr` / PIN `7777`.

## Hard rules

- POS renderer → local-agent IPC only (no direct DB)
- Offline-first: SQLite → sync queue → idempotent sync
- Menu read-only on POS; **hub manager** publishes from dashboard only
- CEO API access limited to `manager/metrics` and `manager/analytics` only
- Bilingual UI via `@venue-pos/i18n`; DB uses `nameEn`/`nameAr` with `@map`
- Prisma for all server DB access
- **KDS is optional** — behind `FEATURE_KDS_ENABLED`

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
npm run dev
npm run dev:api|dashboard|pos|kds|agent
npm run migrate:dev
npm run migrate
npm run seed
npm run lint && npm run lint:i18n
```

## Status

**Phases 0–3, 5, and 4 complete.** Cross-venue billing shipped as integrated **cross-sell** on the main POS (US-4.1–4.3, US-8.6). **Next: Phase 6** — offline SQLite sync + **designated POS as LAN coordinator** when cloud is down (star failover, **not** peer mesh). Plan: `docs/PHASE6_OFFLINE_PLAN.md`. Loose ends: `docs/TEAM_LOG.md` § Roadmap.

## POS app layout (`apps/pos`)

Keep Electron thin — hooks + `PosModals.jsx`, not inline modal spaghetti in `App.jsx`.

## Manager workflows (quick reference)

| Action | Who initiates | Who handles | Where |
|--------|---------------|-------------|-------|
| Orders & payments | Cashier | — | POS |
| Discount / void / comp | Cashier + manager PIN | — (audit) | POS |
| Refund request | Manager PIN on POS | Hub manager force-refund | Dashboard `/cheques` |
| Cross-sell order | Cashier (anchor) | — | POS **Cross-sell** toggle + venue tabs |
| Menus, staff, permissions | Hub manager | — | Dashboard |
| Revenue review | CEO | — | Dashboard `/`, `/analytics` |
| EOD / shifts / cheques | Hub manager | — | Dashboard |

## Prompt tip

*Read `AGENTS.md` and `docs/TEAM_LOG.md` first when continuing phase work.*
