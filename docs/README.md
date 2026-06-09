# Venue POS — Documentation

## Start here (developers)

1. [DEVELOPMENT.md](DEVELOPMENT.md) — setup, repo layout, commands
2. [TEAM_LOG.md](TEAM_LOG.md) — what we built + what's next
3. [PRD.md](PRD.md) — user stories for your task

## Product & architecture

| Doc | Purpose |
|-----|---------|
| [PRD.md](PRD.md) | User stories, acceptance criteria, priorities |
| [Technical_Proposal.md](Technical_Proposal.md) | Architecture, features, 16-week plan |
| [TechSpec.md](TechSpec.md) | WebSocket payloads, env vars, security, CI |

## Engineering references

| Doc | Purpose |
|-----|---------|
| [DEVELOPMENT.md](DEVELOPMENT.md) | Local dev guide (includes repo structure) |
| [DEV_CREDENTIALS.md](DEV_CREDENTIALS.md) | **Dev logins, PINs, terminal secrets — where to use each** |
| [TEAM_LOG.md](TEAM_LOG.md) | Chronological build log — update every merge |
| [../apps/api/prisma/schema.prisma](../apps/api/prisma/schema.prisma) | Database schema (source of truth) |

## AI / Cursor

| Doc | Purpose |
|-----|---------|
| [../AGENTS.md](../AGENTS.md) | Agent entry point |
| [../.cursor/rules/](../.cursor/rules/) | Coding rules per layer |
| [../.cursor/skills/](../.cursor/skills/) | Task workflows |

## Current status

| Phase | Status | Notes |
|-------|--------|-------|
| 0–3 | ✅ Done | Monorepo, POS, kitchen, cheques, payments, shifts |
| 5 (Epic 8) | ✅ Done | Hub manager dashboard — menus, analytics, orders, cheques, shifts/EOD, staff, settings, audit, health |
| **4** | ✅ Done | Cross-sell on anchor POS — billing matrix, group fire/pay, split tender, group % discount, itemized receipt |
| **6** | **Next** | Offline SQLite sync; cross-venue requires online until then |

**KDS is optional** (`FEATURE_KDS_ENABLED`). **Cross-venue** requires `FEATURE_CROSS_VENUE_BILLING=true` + hub billing matrix; card/split pay also needs `FEATURE_MANUAL_CARD_PAYMENT=true`. **Phase 4 closed** — loose ends (offline, voucher, target POS refresh): [TEAM_LOG.md](TEAM_LOG.md) § Roadmap.
