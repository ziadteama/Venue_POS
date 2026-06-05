---
name: database-schema
description: PostgreSQL and SQLite schema design for Venue POS including Prisma migrations, naming conventions, and core entities. Use when creating migrations, writing queries, designing tables, or working with venues, orders, menus, cheques, or sync data.
---

# Database Schema

## Source of truth
`apps/api/prisma/schema.prisma` — never duplicate schema in docs.

## Naming
- DB columns: snake_case via `@map`
- Prisma fields: camelCase (`nameEn`, `venueId`)
- Tables: `@@map("snake_case_plural")`
- Enums for roles/statuses

## Prisma workflow
1. Edit `schema.prisma`
2. `npm run migrate:dev -- --name describe_change`
3. `npm run db:generate`
4. Log in `docs/TEAM_LOG.md`

## Bilingual
Pair fields: `nameEn`/`nameAr`, `descriptionEn`/`descriptionAr`

## Server vs terminal
| PostgreSQL (Prisma) | SQLite (local-agent) |
|---------------------|----------------------|
| System of record | Cache + sync_queue |

## Future entities (Phase 1+)
Menus, orders, cheques — add to `schema.prisma` as phases progress. See `docs/PRD.md` for field requirements.
