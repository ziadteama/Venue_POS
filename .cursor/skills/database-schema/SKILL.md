---
name: database-schema
description: PostgreSQL and SQLite schema design for Venue POS including migrations, naming conventions, and core entities. Use when creating migrations, writing queries, designing tables, or working with venues, orders, menus, cheques, or sync data.
---

# Database Schema

## Naming (TechSpec §7.1)

- Tables: `snake_case`, plural (`menu_items`)
- PK: `id` UUID `gen_random_uuid()`
- FK: `{table}_id`
- Booleans: `is_*`
- JSON: `*_json` or `*_snapshot`
- Indexes: `idx_{table}_{column}`
- Migrations: `NNN_action_description.sql` — never edit existing files

## Server vs terminal

| Server (PostgreSQL) | Terminal (SQLite) |
|---------------------|-------------------|
| System of record | Cache + offline queue |
| All entities | menus, config, PIN hashes, open orders, sync_queue |

## Core relationships

```
venues ──┬── orders ── order_items
         ├── cheques ── payments
         ├── venue_billing_config (anchor → target)
         └── terminals

menu_templates ── categories ── menu_items ── modifier_groups
```

## Bilingual columns

Always pair: `name_en`, `name_ar`, `description_en`, `description_ar`.

API layer maps to camelCase: `nameEn`, `nameAr`.

## Audit log

Append-only. No UPDATE/DELETE grants for app role. Events: voids, config changes, logins, menu publishes.

## Prisma workflow

- Schema: `apps/api/prisma/schema.prisma`
- Dev migration: `npm run migrate:dev`
- Deploy migration: `npm run migrate`
- Regenerate client: `npm run db:generate`
- Use `@map` / `@@map` for snake_case DB columns

## Migration checklist

- [ ] UUID PKs with `gen_random_uuid()` via `@default(dbgenerated(...))`
- [ ] `createdAt` / `updatedAt` with `@map("created_at")`
- [ ] Prisma enums for roles and statuses
- [ ] `@@index` on FK and filter columns
- [ ] Run `prisma generate` after schema changes

## Full table list

See [reference.md](reference.md) or `.cursor/PROJECT_SPEC.md` §2.
