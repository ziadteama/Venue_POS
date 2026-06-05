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

## First-time setup

```bash
# 1. Clone and install
git clone <repo-url> Venue_POS
cd Venue_POS
npm install

# 2. JWT keys (one-time per machine)
npm run generate:jwt-keys

# 3. Start database
docker compose up -d postgres redis

# 4. Environment files
cp apps/api/.env.example apps/api/.env
cp apps/dashboard/.env.example apps/dashboard/.env
# Optional for POS/agent:
cp apps/pos/.env.example apps/pos/.env
cp apps/local-agent/.env.example apps/local-agent/.env

# 5. Database schema + seed data
npm run migrate
npm run seed
```

## Daily workflow

Open **4–5 terminals** (or use a process manager):

```bash
# Terminal 1 — API
npm run dev:api              # http://localhost:3000

# Terminal 2 — Admin dashboard
npm run dev:dashboard        # http://localhost:5173

# Terminal 3 — Local agent (required for POS)
npm run dev:agent            # http://127.0.0.1:3456

# Terminal 4 — POS (browser or Electron)
npm run dev:pos              # http://localhost:5174
npm run electron:dev -w @venue-pos/pos   # Electron window

# Terminal 5 — KDS (optional)
npm run dev:kds              # http://localhost:5175
```

## Dev credentials (after seed)

| Role | Credentials |
|------|-------------|
| Hub manager | `admin` / `admin123` |
| Cashier PIN | `1234` |
| Dev terminal ID | `00000000-0000-4000-8000-000000000001` |
| Dev terminal secret | `dev-terminal-secret` |

## Common commands

| Command | Purpose |
|---------|---------|
| `npm run lint` | ESLint across repo |
| `npm run lint:i18n` | Verify en/ar locale key parity |
| `npm run migrate:dev` | Create + apply Prisma migration (dev) |
| `npm run migrate` | Deploy migrations (CI/prod) |
| `npm run db:generate` | Regenerate Prisma client |
| `npm run seed` | Reset dev users/venue/terminal |
| `npm run test -w @venue-pos/api` | API integration tests |

## Prisma workflow

1. Edit `apps/api/prisma/schema.prisma`
2. Run `npm run migrate:dev -- --name describe_change`
3. Commit `schema.prisma` + new folder under `prisma/migrations/`
4. Log the change in `docs/TEAM_LOG.md`

## API health checks

```bash
curl http://localhost:3000/health
curl http://localhost:3000/health/ready
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'
```

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `JWT keys missing` | `npm run generate:jwt-keys` |
| `Can't reach database` | `docker compose up -d postgres` — wait for healthy |
| `Prisma client out of date` | `npm run db:generate` |
| `Docker pipe not found` | Start Docker Desktop (Windows) |
| POS shows offline | Start `npm run dev:agent` first |
| i18n lint fails | Add missing keys to both `packages/i18n/locales/en.json` and `ar.json` |

## Environment variables

Templates live in each app's `.env.example`. Never commit `.env` files.

Key API vars (`apps/api/.env`):

```
DATABASE_URL=postgresql://hub_pos:hub_pos_dev@localhost:5432/hub_pos
JWT_PRIVATE_KEY_PATH=../../ops/secrets/jwt-private.pem
JWT_PUBLIC_KEY_PATH=../../ops/secrets/jwt-public.pem
CORS_ALLOWED_ORIGINS=http://localhost:5173,http://localhost:5174,http://localhost:5175
```

## Team process

After completing work, append an entry to [TEAM_LOG.md](TEAM_LOG.md). See `.cursor/rules/team-workflow.mdc`.
