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
| [docs/PHASE6_OFFLINE_PLAN.md](docs/PHASE6_OFFLINE_PLAN.md) | Offline sync + LAN cluster — **v1.1 shipped**; remaining P0 in TEAM_LOG |
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

**Service flow:** cashier rings sale → **floor manager PIN on POS** for discount/refund (shift manager `venue_manager`, not hub PIN) → refund notification on all POS at venue → **hub manager** can also refund from dashboard **Cheques** → **CEO** reviews executive overview + analytics.

**Cross-sell (Phase 4):** anchor POS only — **Standard / Cross-sell** toggle above menu; lazy `crossVenueGroupId` on current table; one cheque per venue; **one Pay** settles the group (cash, card, or split cash+card — proportional per venue). **Group discount:** percent only at anchor (floor manager PIN). Combined receipt: itemized lines per venue. Online-only (`FEATURE_CROSS_VENUE_BILLING`); card/split need `FEATURE_MANUAL_CARD_PAYMENT=true`.

### Dashboard page split (v2 — June 2026)

| Page | CEO | Hub manager |
|------|-----|-------------|
| Overview (`/`) | Executive — net sales, 7-day trend, venue table, recent changes | Operations — today EOD, refunds, open cheques/shifts, terminals, recent changes |
| Analytics (`/analytics`) | Revenue drill-down, CSV | — |
| Menus / Staff / Settings | No | Yes |
| Cheques / Orders / Shifts | No | Yes |
| Activity / Health | No | Yes |

Login redirect: **both roles → `/`** (CEO = executive, hub manager = operations).

API: `GET /api/v1/manager/dashboard/executive` (CEO) · `GET /api/v1/manager/dashboard/operations` (hub manager) · existing `metrics/live`, `analytics/revenue`.

### POS floor manager PIN

Discount, refund, void, comp, transfer, shift close — **floor manager PIN on the POS** (`venue_manager`), not hub manager PIN. Hub manager creates shift managers in **Staff** (`/users`). Dev seed: `venue_mgr` / PIN `7777`. Hub manager PIN `9999` works on dashboard web login only — **not** for POS terminal discount/refund.

### Semi-kiosk exit code

POS runs fullscreen (not OS kiosk mode) so the Ubuntu desktop/taskbar stays behind. Workers cannot leave unless they press `Ctrl+Shift+X` and enter exit code **`7894`** (hardcoded in Electron main process — not DB-stored). After minimizing, POS relaunches fullscreen on restore. IT override `1547` only applies to manager/setup PIN gates, NOT the semi-kiosk exit.

## Hard rules

- POS renderer → local-agent IPC only (no direct DB)
- Offline-first: SQLite → sync queue → idempotent sync
- Menu read-only on POS; **hub manager** publishes from dashboard only
- CEO API access limited to `manager/metrics`, `manager/analytics`, and `manager/dashboard/executive`
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

**Phases 0–6 complete** (offline ops, cross-sell coordinator, test harness). **Phase 7:** Epic 9 kiosk/watchdog shipped — `apps/watchdog`, `ops/windows/` (NSSM, kiosk user, firewall). US-7.4 menu publish drain on reconnect. **Dashboard v2** (executive + operations overview). `.exe` packaging deferred to final release. See `docs/TEAM_LOG.md` § **2026-06-10** entries.

## POS app layout (`apps/pos`)

Keep Electron thin — hooks + `PosModals.jsx`, not inline modal spaghetti in `App.jsx`.

## Manager workflows (quick reference)

| Action | Who initiates | Who handles | Where |
|--------|---------------|-------------|-------|
| Orders & payments | Cashier | — | POS |
| Discount / void / comp | Cashier + floor manager PIN | — (audit + Activity) | POS |
| Refund (paid cheque) | Floor manager PIN on POS | Hub manager via Cheques | POS + notification on all tills |
| Cross-sell order | Cashier (anchor) | — | POS **Cross-sell** toggle + venue tabs |
| Menus, staff, permissions | Hub manager | — | Dashboard |
| Revenue review | CEO | — | Dashboard `/`, `/analytics` |
| Daily ops / EOD | Hub manager | — | Dashboard `/` then Shifts, Cheques, Activity |

## Prompt tip

*Read `AGENTS.md` and `docs/TEAM_LOG.md` first when continuing phase work.*
