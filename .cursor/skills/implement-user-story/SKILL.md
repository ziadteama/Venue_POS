---
name: implement-user-story
description: Implements PRD user stories for Venue POS with acceptance-criteria checklists. Use when building features, implementing epics, or when the user references US-X.X story IDs.
---

# Implement User Story

## Workflow

```
- [ ] 1. Story in docs/PRD.md
- [ ] 2. Acceptance criteria + priority
- [ ] 3. Apps touched (api, dashboard, pos, kds, local-agent)
- [ ] 4. Offline sync impact — read .cursor/skills/offline-sync/SKILL.md if any write path
- [ ] 5. Prisma schema + migrate:dev (if needed)
- [ ] 6. Service → route → test (Zod validation)
- [ ] 7. WebSocket events (TechSpec §8) if real-time
- [ ] 8. UI + i18n keys (en + ar)
- [ ] 9. Verify acceptance criteria (include offline scenario if till-facing)
- [ ] 10. docs/TEAM_LOG.md entry
```

## Implementation order

1. `apps/api/prisma/schema.prisma` + `npm run migrate:dev`
2. `packages/shared/src/sync.js` — if new sync event type
3. `apps/api/src/services/` + `apps/local-agent/src/services/` (offline branch first for till ops)
4. `apps/api/src/routes/` + `apps/local-agent/src/routes/`
5. `apps/api/src/*.test.js` + `apps/local-agent/src/**/*.test.js`
6. Frontend + `packages/i18n/locales/*.json`
7. Socket.IO emit per TechSpec §8

## Offline slice (when story touches POS / cheques / payments)

1. Local SQLite mutation in `local-cheques.js` or relevant service
2. `enqueueSync(db, SYNC_EVENT_TYPES.*, payload)`
3. Route: `if (isCloudOnline())` try cloud; else offline handler
4. API replay handler in `apps/api/src/routes/sync.js`
5. Agent + API tests; matrix scenario if new user-facing offline path

## Branch

`feature/US-X.X-short-description`
