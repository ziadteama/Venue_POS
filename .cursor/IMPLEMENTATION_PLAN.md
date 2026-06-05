# Implementation Plan — Phase 0

## Phase 0: Setup (Week 1) ✅

### 0.1 Monorepo scaffold
- [x] Root `package.json` with npm workspaces (`apps/*`, `packages/*`)
- [x] Apps: api, dashboard, pos, kds, local-agent
- [x] Packages: shared, i18n
- [x] ESLint + Prettier
- [x] `.env.example` per app

### 0.2 API foundation
- [x] Fastify + `GET /health`, `GET /health/ready`
- [x] **Prisma** + PostgreSQL (`apps/api/prisma/schema.prisma`)
- [x] Core models: `venues`, `users`, `terminals`
- [x] Zod validation + global error handler
- [x] Pino logging (Fastify built-in)

### 0.3 Auth skeleton
- [x] JWT RS256 key script (`npm run generate:jwt-keys`)
- [x] `POST /api/v1/auth/login` (manager)
- [x] `POST /api/v1/auth/pin` (cashier + terminal headers)
- [x] Role middleware (`src/middleware/auth.js`)

### 0.4 Docker
- [x] `docker-compose.yml`: postgres, redis, api
- [x] `docker-compose.dev.yml` hot reload
- [x] `ops/nginx/nginx.conf` stub

### 0.5 CI
- [x] `.github/workflows/ci.yml`: lint → api test → build

### 0.6 Dashboard shell
- [x] Vite + React + Tailwind + i18n + login + RTL toggle

### 0.7 POS shell
- [x] Electron + Vite + local-agent health bridge

### 0.8 Local agent + KDS
- [x] Local agent Fastify :3456 + SQLite WAL
- [x] KDS Electron shell

## Local dev quickstart

```bash
npm install
npm run generate:jwt-keys
docker compose up -d postgres redis
cp apps/api/.env.example apps/api/.env
cp apps/dashboard/.env.example apps/dashboard/.env
npm run migrate:dev          # first time: creates Prisma migration
npm run seed
npm run dev:api                # :3000
npm run dev:dashboard          # :5173 — login admin/admin123
npm run dev:agent              # :3456
npm run dev:pos                # :5174
```

## Team documentation

- [docs/README.md](../docs/README.md) — doc index
- [docs/DEVELOPMENT.md](../docs/DEVELOPMENT.md) — setup guide
- [docs/REPO_STRUCTURE.md](../docs/REPO_STRUCTURE.md) — folder layout
- [docs/TEAM_LOG.md](../docs/TEAM_LOG.md) — **what we built (update every merge)**

## Phase 1: Core POS (Weeks 2–4) — NEXT

- [ ] Add menu models to Prisma schema
- [ ] Menu API + publish WebSocket event
- [ ] Menu cache in local-agent
- [ ] POS menu grid + order flow
