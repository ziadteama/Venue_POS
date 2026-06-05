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
- [ ] 4. Prisma schema + migrate:dev (if needed)
- [ ] 5. Service → route → test (Zod validation)
- [ ] 6. WebSocket events (TechSpec §8) if real-time
- [ ] 7. UI + i18n keys (en + ar)
- [ ] 8. Verify acceptance criteria
- [ ] 9. docs/TEAM_LOG.md entry
```

## Implementation order

1. `apps/api/prisma/schema.prisma` + `npm run migrate:dev`
2. `apps/api/src/services/`
3. `apps/api/src/routes/`
4. `apps/api/src/*.test.js`
5. Frontend + `packages/i18n/locales/*.json`
6. Socket.IO emit per TechSpec §8

## Branch

`feature/US-X.X-short-description`
