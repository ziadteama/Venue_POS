# Venue POS — Agent Guide

Unified Hub POS & Management System for multi-venue F&B hubs. Read this before writing code.

## Documentation Map

| Document | Purpose |
|----------|---------|
| [docs/README.md](docs/README.md) | **Team doc index** — start here |
| [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) | Local setup, commands, troubleshooting |
| [docs/REPO_STRUCTURE.md](docs/REPO_STRUCTURE.md) | Monorepo layout, ports, what goes where |
| [docs/TEAM_LOG.md](docs/TEAM_LOG.md) | **Chronological build log** — update on every feature |
| [docs/PRD.md](docs/PRD.md) | User stories, acceptance criteria, priorities (P0/P1/P2) |
| [docs/Technical_Proposal.md](docs/Technical_Proposal.md) | Architecture, features, phased delivery |
| [docs/TechSpec.md](docs/TechSpec.md) | Naming, WebSocket contracts, security, deployment, testing |
| [.cursor/PROJECT_SPEC.md](.cursor/PROJECT_SPEC.md) | Condensed build spec (schema, API, structure) |
| [.cursor/rules/README.md](.cursor/rules/README.md) | Cursor rules index by layer |

## Product Summary

- **Hub-and-spoke**: Central Node.js API + PostgreSQL server; Electron POS/KDS at venues; local agent with SQLite for offline.
- **Core pillars**: Unified operations, manager-controlled menus, offline-first sync.
- **Users**: hub_manager, venue_manager, cashier, kitchen_staff, system_admin.
- **Currency/locale**: EGP, Arabic + English with RTL.

## Monorepo Structure

```
Venue_POS/
├── apps/                          # Deployable applications
│   ├── api/                       # Server: Fastify + Prisma + Socket.IO
│   ├── dashboard/                 # Web: React admin SPA
│   ├── pos/                       # Desktop: Electron kiosk POS
│   ├── kds/                       # Desktop: kitchen display
│   └── local-agent/               # Desktop service: SQLite + sync
├── packages/                      # Shared libraries
│   ├── shared/                    # Constants, error codes, roles
│   └── i18n/                      # en.json / ar.json locales
├── docker/                        # Dockerfile.api
├── ops/nginx/                     # TLS, WebSocket proxy
├── docs/                          # PRD, proposals, tech spec
└── package.json                   # npm workspaces root
```

## Tech Stack (Fixed)

| Layer | Choice |
|-------|--------|
| API | Node.js 20, Fastify, Prisma 6, Socket.IO 4, Zod 3, Pino 8 |
| DB | PostgreSQL 16 via Prisma (server), SQLite via better-sqlite3 9 (terminal) |
| Auth | JWT RS256 (15m access, 30d refresh), bcrypt PINs |
| Frontend | React 18, Vite 5, Tailwind 3, react-i18next |
| Desktop | Electron 30, electron-updater |
| Deploy | Docker Compose, Nginx, Ubuntu 22.04 |

## Hard Constraints

1. **POS must work 100% offline** — write to SQLite first, sync queue FIFO, idempotent UUIDs.
2. **Menu is read-only on POS** — managers publish from dashboard only.
3. **Cross-venue billing requires server** — disabled offline with clear UI message.
4. **Terminal lightweight** — POS + agent < 300 MB RAM, launch < 10s, no heavy renderer deps.
5. **Bilingual** — all UI strings in `en.json`/`ar.json`; DB content uses `*_en`/`*_ar` pairs.
6. **Security** — no PAN storage, PINs never in API responses, audit log append-only.

## Implementation Phases

Build in order; do not skip foundational work.

| Phase | Weeks | Deliverable |
|-------|-------|-------------|
| 0 Setup | 1 | Monorepo, Docker, Prisma, CI lint/test, dev env ✅ **DONE** |
| 1 Core POS | 2–4 | Order entry, menu display, send to kitchen, receipt print (online, single venue) |
| 2 Kitchen | 5 | KDS, kitchen printer, order status lifecycle |
| 3 Payments | 6 | Cash, manual card, split, shift open/close |
| 4 Multi-Venue | 7–8 | Cross-venue billing, venue_billing_config, real-time notifications |
| 5 Dashboard | 9–10 | Menu manager, analytics, venue config, users |
| 6 Offline | 11–12 | Local agent, sync queue, conflict resolution |
| 7 Kiosk | 13 | Kiosk mode, watchdog, lockdown |
| 8 Hardening | 14–15 | Load test, security basics, UAT |
| 9 Go-Live | 16 | Production deploy, terminal install |

**Start with Phase 0** unless the user specifies a different slice.

## Workflow for New Features

1. Find the user story in `docs/PRD.md` (e.g. `US-3.2`).
2. Check acceptance criteria and priority.
3. Read relevant sections in `.cursor/PROJECT_SPEC.md` and `docs/TechSpec.md`.
4. Implement smallest vertical slice: migration → API → tests → UI.
5. Match naming conventions in TechSpec §7.
6. Emit/consume correct WebSocket events (TechSpec §8).
7. Use commit format: `type(scope): description` (e.g. `feat(orders): add modifier modal`).

## Project Skills

Invoke these from `.cursor/skills/` when relevant:

| Skill | Use when |
|-------|----------|
| `venue-pos` | Any task in this repo |
| `implement-user-story` | Building a PRD feature |
| `database-schema` | Migrations, queries, entities |
| `offline-sync` | Local agent, sync queue, conflicts |
| `websocket-events` | Real-time events, Socket.IO rooms |

## Key Commands (once scaffolded)

```bash
npm install                    # root workspaces
npm run dev:api                # API on :3000
npm run dev:dashboard          # Dashboard on :5173
npm run dev:pos                # Electron POS
npm run dev:agent              # Local agent
npm run migrate:dev            # Prisma migrate (dev)
npm run migrate                # Prisma migrate deploy (prod/CI)
npm run db:generate            # Regenerate Prisma client
npm run test                   # unit + integration
npm run lint && npm run lint:i18n
```

## Do Not

- Store secrets in code; use `.env.example` templates only.
- Add moment.js, lodash full, or heavy animation libs to POS renderer.
- Let POS renderer access SQLite directly — use local-agent IPC.
- Modify applied Prisma migration SQL; add new migrations via `migrate:dev`.
- Implement Phase 6 offline patterns before Phase 0–1 scaffolding exists.
