# Venue POS — Documentation Index

Documentation for the **Unified Hub POS & Management System** team.

## Product & planning

| Document | Audience | Purpose |
|----------|----------|---------|
| [PRD.md](PRD.md) | PM, dev, QA | User stories, acceptance criteria, priorities |
| [Technical_Proposal.md](Technical_Proposal.md) | Stakeholders, architects | Architecture, features, 16-week plan |
| [TechSpec.md](TechSpec.md) | Developers | Naming, WebSocket contracts, security, deployment |

## Engineering (start here)

| Document | Audience | Purpose |
|----------|----------|---------|
| [DEVELOPMENT.md](DEVELOPMENT.md) | All developers | Local setup, commands, env vars, troubleshooting |
| [REPO_STRUCTURE.md](REPO_STRUCTURE.md) | All developers | Monorepo layout, apps vs packages, ports |
| [TEAM_LOG.md](TEAM_LOG.md) | Whole team | **Chronological log of what we built** — update every merge |

## AI / Cursor

| Document | Purpose |
|----------|---------|
| [../AGENTS.md](../AGENTS.md) | Agent entry point |
| [../.cursor/PROJECT_SPEC.md](../.cursor/PROJECT_SPEC.md) | Condensed build spec |
| [../.cursor/IMPLEMENTATION_PLAN.md](../.cursor/IMPLEMENTATION_PLAN.md) | Phase checklist |
| [../.cursor/rules/](../.cursor/rules/) | Cursor rules by layer (Prisma, Fastify, i18n, etc.) |
| [../.cursor/skills/](../.cursor/skills/) | Task-specific agent skills |

## Current status

**Phase 0 complete** (June 2026) — monorepo, Prisma API, auth, app shells, CI.  
**Next:** Phase 1 — menu + core POS order flow. See [TEAM_LOG.md](TEAM_LOG.md).
