# Venue POS — Agent Guide

Read this before writing code.

## Documentation map

| Document | Purpose |
|----------|---------|
| [docs/README.md](docs/README.md) | Team doc index |
| [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) | Setup, repo layout, ports, commands |
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

## Hard rules

- POS renderer → local-agent IPC only (no direct DB)
- Offline-first: SQLite → sync queue → idempotent sync
- Menu read-only on POS; managers publish from dashboard
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

**Phase 3 nearing close** (`phase-3` branch) — open cheques, payments, shifts, discounts/refunds with GM approval queue. Remaining tail: seat split, vouchers, integrated PDQ, receipt PDF. See `docs/TEAM_LOG.md` + `docs/PHASE3_SCALABLE_PLAN.md`.

## Manager workflows (quick reference)

| Action | Who initiates | Who approves | Where |
|--------|---------------|--------------|-------|
| Discount | `venue_manager` (POS PIN or dashboard) | `hub_manager` | Dashboard **Approvals** |
| Refund | `venue_manager` (dashboard; POS TBD) | `hub_manager` | Dashboard **Approvals** |
| Void / comp / line transfer | Either manager | Same step (one PIN) | POS or dashboard |
| Shift over/short | Cashier | Either manager PIN | POS close shift |

## Prompt tip (save tokens)

When continuing phase work, point the agent at **`AGENTS.md`** + **`docs/TEAM_LOG.md`** (Phase 3 section) first — not the whole repo. Use `docs/PRD.md` only for a specific user story’s acceptance criteria.

Example prefix: *Read `AGENTS.md` and `docs/TEAM_LOG.md` (Phase 3). Continue from the latest slice; don’t re-explore completed work.*
