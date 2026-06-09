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
| [PHASE6_OFFLINE_PLAN.md](PHASE6_OFFLINE_PLAN.md) | Offline sync, LAN cluster — **v1.1 shipped**; P0 gaps in [TEAM_LOG.md](TEAM_LOG.md) |
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
| 5 (Epic 8) | ✅ Done | Dashboard v2 — CEO executive overview + hub operations overview, analytics, ops pages |
| **4** | ✅ Done | Cross-sell on anchor POS — billing matrix, group fire/pay, split tender, group % discount, itemized receipt |
| **6** | **v1.1 shipped** | Offline sync, dynamic LAN cluster, shift replay, device profile — P0 gaps remain ([PHASE6_OFFLINE_PLAN.md](PHASE6_OFFLINE_PLAN.md)) |

**KDS is optional** (`FEATURE_KDS_ENABLED`). **Cross-venue** requires `FEATURE_CROSS_VENUE_BILLING=true` + hub billing matrix; card/split pay also needs `FEATURE_MANUAL_CARD_PAYMENT=true`. **Phase 4 closed.** **Phase 6 v1.1** (offline + dynamic LAN cluster + shift replay + device profile + floor manager refund flow): [TEAM_LOG.md](TEAM_LOG.md) § Roadmap · [PHASE6_OFFLINE_PLAN.md](PHASE6_OFFLINE_PLAN.md).
