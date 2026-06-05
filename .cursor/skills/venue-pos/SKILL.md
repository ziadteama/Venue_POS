---
name: venue-pos
description: Guides development of the Unified Hub POS & Management System (Venue_POS). Use when working in this repo, building POS, KDS, dashboard, API, local agent, offline sync, cross-venue billing, or hub multi-venue features.
---

# Venue POS

## First steps

1. [docs/TEAM_LOG.md](../../docs/TEAM_LOG.md) — what's built
2. [docs/DEVELOPMENT.md](../../docs/DEVELOPMENT.md) — setup & layout
3. [apps/api/prisma/schema.prisma](../../apps/api/prisma/schema.prisma) — DB truth
4. [docs/PRD.md](../../docs/PRD.md) — user stories
5. [docs/TechSpec.md](../../docs/TechSpec.md) — WebSocket, security, deployment
6. Append to `docs/TEAM_LOG.md` when done

## Apps

| App | Path | Role |
|-----|------|------|
| api | `apps/api` | REST + Socket.IO + auth |
| dashboard | `apps/dashboard` | React admin SPA |
| pos | `apps/pos` | Electron kiosk POS |
| kds | `apps/kds` | Kitchen display |
| local-agent | `apps/local-agent` | SQLite, sync, printers |

## Non-negotiables

- Offline-first via local-agent; POS renderer never touches DB
- Menus read-only on POS
- Bilingual: `@venue-pos/i18n` + Prisma `nameEn`/`nameAr`
- JWT RS256; no PAN storage

## Related skills

`implement-user-story` · `database-schema` · `offline-sync` · `websocket-events`
