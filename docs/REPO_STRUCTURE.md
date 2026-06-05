# Repository Structure

Monorepo layout for Venue POS. **Apps** are deployable; **packages** are shared libraries.

```
Venue_POS/
├── apps/                          # Deployable applications
│   ├── api/                       # Server — Fastify + Prisma + PostgreSQL
│   │   ├── prisma/
│   │   │   ├── schema.prisma      # DB schema (source of truth)
│   │   │   └── migrations/        # Versioned SQL migrations
│   │   └── src/
│   │       ├── routes/            # HTTP endpoints
│   │       ├── services/          # Business logic
│   │       ├── middleware/        # Auth, roles
│   │       ├── db/prisma.js       # PrismaClient singleton
│   │       └── plugins/           # Error handler, etc.
│   │
│   ├── dashboard/                 # Web — React admin (Vite + Tailwind)
│   │   └── src/
│   │       ├── pages/             # Login, dashboard modules
│   │       ├── components/      # Layout, LanguageToggle
│   │       └── hooks/             # useAuth, etc.
│   │
│   ├── pos/                       # Desktop — Electron kiosk POS
│   │   ├── electron/              # main.cjs, preload.cjs (IPC bridge)
│   │   └── src/                   # React renderer (Vite)
│   │
│   ├── kds/                       # Desktop — Kitchen Display System
│   │   ├── electron/
│   │   └── src/
│   │
│   └── local-agent/               # Desktop service — SQLite + sync + printers
│       └── src/
│           ├── db/sqlite.js       # Local cache + sync_queue
│           └── server.js          # HTTP :3456 for POS IPC
│
├── packages/                      # Shared code (no standalone deploy)
│   ├── shared/                    # ROLES, ERROR_CODES, API_BASE
│   └── i18n/                      # en.json, ar.json, getDirection()
│
├── docker/                        # Dockerfile.api
├── ops/
│   ├── nginx/                     # Reverse proxy config
│   └── secrets/                   # JWT keys (gitignored)
├── docs/                          # Team + product documentation
├── scripts/                       # generate-jwt-keys, lint-i18n
├── .cursor/                       # AI rules, skills, PROJECT_SPEC
├── .github/workflows/ci.yml       # Lint → test → build
├── docker-compose.yml
└── package.json                   # npm workspaces root
```

## Layer responsibilities

| Layer | Talks to | Must not |
|-------|----------|----------|
| Dashboard | API (HTTPS) | Access DB directly |
| POS renderer | Local agent (IPC/HTTP) | Access SQLite or Postgres |
| Local agent | SQLite + API (sync) | Render UI |
| API | Postgres (Prisma) + Redis (future) | Serve static POS assets |
| KDS | API (WebSocket, future) | Process payments |

## Package naming

All workspaces use `@venue-pos/<name>`. Install deps with:

```bash
npm install <pkg> -w @venue-pos/api
```

## Ports

| Service | Port |
|---------|------|
| API | 3000 |
| Dashboard | 5173 |
| POS (Vite) | 5174 |
| KDS (Vite) | 5175 |
| Local agent | 3456 |
| Postgres | 5432 |
| Redis | 6379 |

## What goes where (decision guide)

| Change type | Location |
|-------------|----------|
| New DB table | `apps/api/prisma/schema.prisma` + migration |
| New REST endpoint | `apps/api/src/routes/` + `services/` |
| New admin screen | `apps/dashboard/src/pages/` |
| New POS screen | `apps/pos/src/` |
| Shared UI string | `packages/i18n/locales/*.json` |
| Shared constant | `packages/shared/src/` |
| Offline/sync logic | `apps/local-agent/` (Phase 6) |
| WebSocket event | `apps/api/src/ws/` (future) |
