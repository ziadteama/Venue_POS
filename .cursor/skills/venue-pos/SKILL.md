---
name: venue-pos
description: Guides development of the Unified Hub POS & Management System (Venue_POS). Use when working in this repo, building POS, KDS, dashboard, API, local agent, offline sync, cross-venue billing, or hub multi-venue features.
---

# Venue POS

## First steps

1. Read [docs/TEAM_LOG.md](../../docs/TEAM_LOG.md) for what's already built.
2. Read [AGENTS.md](../../AGENTS.md) and [docs/DEVELOPMENT.md](../../docs/DEVELOPMENT.md).
3. Read [.cursor/PROJECT_SPEC.md](../PROJECT_SPEC.md) for schema, API, and events.
4. For user stories, open [docs/PRD.md](../../docs/PRD.md).
5. After shipping, append to `docs/TEAM_LOG.md`.

## Packages

| Package | Path | Role |
|---------|------|------|
| api | `packages/api` | REST + Socket.IO + auth + sync |
| dashboard | `packages/dashboard` | React admin SPA |
| pos | `packages/pos` | Electron kiosk POS |
| kds | `packages/kds` | Kitchen display |
| local-agent | `packages/local-agent` | SQLite, sync, printers, watchdog |

## Non-negotiables

- Offline-first: SQLite write → sync queue → idempotent server sync.
- POS renderer never touches DB; use local-agent IPC only.
- Menus read-only on POS; publish from dashboard.
- Bilingual: `*_en`/`*_ar` in DB; `en.json`/`ar.json` for UI.
- JWT RS256; bcrypt PINs; no card PANs in DB.

## Phase awareness

Check current phase in AGENTS.md. Do not build cross-venue billing before core single-venue orders work. Do not add integrated card SDK before manual card flow exists.

## Related skills

- `implement-user-story` — PRD → code workflow
- `database-schema` — tables and migrations
- `offline-sync` — agent and sync queue
- `websocket-events` — Socket.IO contracts
