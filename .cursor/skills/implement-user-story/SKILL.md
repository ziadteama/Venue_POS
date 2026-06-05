---
name: implement-user-story
description: Implements PRD user stories for Venue POS with acceptance-criteria checklists. Use when building features, implementing epics, or when the user references US-X.X story IDs.
---

# Implement User Story

## Workflow

```
Task Progress:
- [ ] 1. Locate story in docs/PRD.md
- [ ] 2. List acceptance criteria and priority
- [ ] 3. Identify packages touched (api, dashboard, pos, kds, local-agent)
- [ ] 4. Schema/migration if needed
- [ ] 5. API + validation (Zod) + tests
- [ ] 6. WebSocket events if real-time
- [ ] 7. UI with i18n (en + ar)
- [ ] 8. Verify acceptance criteria
- [ ] 9. Append entry to docs/TEAM_LOG.md
```

## Story → package mapping

| Epic area | Primary packages |
|-----------|------------------|
| Auth (US-1.x) | api, dashboard, pos |
| Menu (US-2.x) | api, dashboard, pos, local-agent |
| Orders (US-3.x) | api, pos, kds, local-agent |
| Cross-venue (US-4.x) | api, pos, dashboard |
| Payments (US-5.x) | api, pos |
| KDS (US-6.x) | kds, api |
| Offline (US-7.x) | local-agent, pos, api |
| Dashboard (US-8.x) | dashboard, api |
| Kiosk (US-9.x) | pos, local-agent |
| i18n (US-11.x) | all frontends |
| Shifts (US-13.x) | api, pos, dashboard |

## Implementation order per story

1. **Migration** — `packages/api/migrations/NNN_description.sql`
2. **Service layer** — business logic in `packages/api/src/services/`
3. **Route** — `packages/api/src/routes/` with role checks
4. **Tests** — integration test for happy path + auth failure
5. **Frontend** — component + hook + i18n keys
6. **Events** — emit Socket.IO per TechSpec §8

## Acceptance criteria format

When done, report:

```markdown
## US-X.X: [Title]
- [x] Criterion from PRD
- [ ] Criterion not yet done (reason)
```

## Priority guidance

- **P0**: Required for MVP; implement fully before P1.
- **P1**: Next sprint; stub only if user explicitly asks for scaffolding.
- **P2**: Defer unless requested.

## Branch naming

`feature/US-X.X-short-description` (e.g. `feature/US-3.2-modifier-selection`)
