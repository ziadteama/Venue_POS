# Cursor Rules Index

Rules auto-apply based on file globs or always-on context.

## Always active
| Rule | Purpose |
|------|---------|
| `core.mdc` | Stack, architecture, hard constraints |
| `team-workflow.mdc` | Branches, commits, TEAM_LOG updates |

## By layer
| Rule | Globs | Purpose |
|------|-------|---------|
| `monorepo.mdc` | `package.json`, workspaces | npm workspaces, ports, deps |
| `prisma.mdc` | `apps/api/**` | Schema, migrations, client |
| `database.mdc` | `apps/api/prisma/**` | Entity naming, bilingual fields |
| `fastify-api.mdc` | `apps/api/src/**` | Routes, Zod, errors, auth |
| `api-server.mdc` | `apps/api/**` | API package structure |
| `react-ui.mdc` | `apps/{dashboard,pos,kds}/**` | React, Tailwind, hooks |
| `i18n-rtl.mdc` | frontends + `packages/i18n` | en/ar locales, RTL |
| `electron-terminal.mdc` | `apps/{pos,kds,local-agent}/**` | Electron, IPC, SQLite agent |
| `shared-packages.mdc` | `packages/**` | shared + i18n packages |
| `docker-ci.mdc` | `docker/`, `ops/`, `.github/` | Compose, CI, secrets |

## Skills (`.cursor/skills/`)
Use for multi-step tasks: `venue-pos`, `implement-user-story`, `database-schema`, `offline-sync`, `websocket-events`.
