---
name: offline-sync
description: Offline-first sync for Venue POS — SQLite cache, sync_queue FIFO, idempotent replay, LAN cluster, coordinator cross-sell, menu gate, reconnect handshake. Use when adding or changing any write path (orders, cheques, payments, shifts, cross-venue), local-agent routes, sync API handlers, POS IPC calls, reconnect behavior, or cloud-health/cluster logic. Read this before implementing new features in api, pos, or local-agent.
---

# Offline Sync (Phase 6 — shipped)

**Any new write or state-changing feature must work offline-first.** POS never talks to cloud directly — only `local-agent` (`127.0.0.1:3456`).

## Pre-change checklist

Before coding, answer:

1. **Does this mutate orders/cheques/payments/shifts/floor?** → Local SQLite write + `enqueueSync` (or coordinator buffer for cross-sell offline).
2. **Can it run while `isCloudOnline()` is false?** → Implement in `local-cheques.js` / route offline branch; do not proxy-only to API.
3. **Needs hub audit trail?** → If yes and cloud required (e.g. refunds), return `503` + `OFFLINE_MODE` — never silent fail.
4. **Uses menu prices?** → Respect `assertMenuReadyForWrite`; prices reconciled on reconnect via `menu-reconcile.js`.
5. **Cross-venue?** → Online: cloud proxy. Offline: coordinator only (`coordinator-cross-venue.js`); atomic `CROSS_VENUE_GROUP_REPLAY` on replay.
6. **Shared hub floor tables?** → Floor locks via coordinator when WAN down (`cluster-state.js`, `routes/floor.js`).
7. **Tests?** → Agent unit test + API replay test; add matrix scenario if user-facing offline path.

## Architecture

```
WAN up:   POS → local-agent → cloud API → PostgreSQL
WAN down: POS → local-agent → SQLite + sync_queue
          (optional) → LAN coordinator agent → coordinator SQLite (floor locks, cross-sell buffer)
Reconnect: runReconnectHandshake → menu drain → price reconcile → FIFO queue drain → cheque hydrate
```

Star topology only — **no peer mesh**. Cluster modes: `DIRECT` | `RELAY` | `LEADER` | `FOLLOWER` (see `packages/shared/src/sync.js`).

## Write path (required pattern)

```
POS IPC → local-agent route
  → assertMenuReadyForWrite (order/cheque creates)
  → mutate local SQLite (local_cheques, orders, etc.)
  → enqueueSync(db, SYNC_EVENT_TYPES.*, payload, syncId)
  → if isCloudOnline(): processSyncQueue (best-effort)
  → return local state to POS immediately
```

- Every event gets client UUID `syncId` (idempotency key). Duplicate enqueue → DB unique constraint / server `DUPLICATE_SYNC_ID`.
- Constants: `packages/shared/src/sync.js` (`SYNC_EVENT_TYPES`, `MAX_SYNC_BATCH`, intervals).

## Event types (use shared constants)

| Type | Offline local handler | API replay |
|------|----------------------|------------|
| `order.create` / `add_item` / `patch_item` / `send` / `void` | `orders.js` | Individual REST or batch |
| `cheque.*` (open, fire, pay, discount, clear, void, table_move, transfer, split) | `local-cheques.js` | `POST /api/v1/sync/events` |
| `shift.open` / `shift.close` | `routes/shifts.js` | batch + shift id link |
| `cross_venue.group_pay` / `cross_venue.group_replay` | `coordinator-cross-venue.js` | atomic group replay handler |
| `payment.create` | cheque pay flow | batch |

Add new types in **`packages/shared/src/sync.js`** first, then agent + API handler in `apps/api/src/routes/sync.js`.

## Online-only (by design)

| Operation | Offline behavior |
|-----------|------------------|
| Refunds | `503 OFFLINE_MODE` — `pos.offline.refundRequiresHub` |
| Manager dashboard writes | Blocked (no local-agent) |
| Cross-sell (non-coordinator) | Blocked or routed to coordinator |
| Integrated card terminal | Manual card only offline |

## Reconnect handshake order

`apps/local-agent/src/services/reconnect.js` — do not reorder without reason:

1. `POST /api/v1/terminals/reconnect` (`menuVersionHash`, `lastSyncAt`)
2. Refresh staff/features cache
3. Force menu sync if `menuStale`
4. `drainMenuPublishQueue` (WS publishes received while offline)
5. `reconcileLocalChequePrices` (server wins on stale prices)
6. Drain `sync_queue` in batches (`MAX_SYNC_BATCH`, progress meta for POS bar)
7. `hydrateOpenCheques` (90s interval while online)

## Menu gate

`assertMenuReadyForWrite(db, venueId)` blocks writes only when menu cache is empty (`MENU_NOT_CACHED`).

Pending `menu_publish_queue` rows and `menu_stale` are drained by **`menu-sync-worker.js`** every `MENU_SYNC_WORKER_INTERVAL_MS` (30s) while online — POS is not blocked. While **offline**, cached menu is used; worker resumes on reconnect.

## Sync queue worker

- SQLite table `sync_queue`: `pending` → `done` | `failed`
- Worker: `SYNC_WORKER_INTERVAL_MS` (10s) when online + pending
- Failed jobs: `sync-retry-worker.js` re-queues and replays every `SYNC_FAILED_RETRY_INTERVAL_MS` (30s) when online or LAN relay; reconnect handshake also re-queues failed rows
- Skip replay while cloud marked offline (`isCloudOnline()` false)

## Key files

| Concern | Path |
|---------|------|
| Event constants | `packages/shared/src/sync.js` |
| Enqueue + replay | `apps/local-agent/src/services/sync-processor.js` |
| Cheque offline ops | `apps/local-agent/src/services/local-cheques.js` |
| Cross-sell buffer | `apps/local-agent/src/services/coordinator-cross-venue.js` |
| Reconnect | `apps/local-agent/src/services/reconnect.js` |
| Menu gate | `apps/local-agent/src/services/menu-gate.js` |
| Price reconcile | `apps/local-agent/src/services/menu-reconcile.js` |
| Cloud health | `apps/local-agent/src/services/cloud-health.js` |
| Cluster / relay | `apps/local-agent/src/services/cluster-state.js`, `relay-client.js` |
| API replay | `apps/api/src/routes/sync.js` |
| WS menu queue | `apps/local-agent/src/services/ws-client.js` |
| E2E matrix (10 scenarios) | `apps/local-agent/test/e2e/phase6-matrix.test.js` |

Plan reference: `docs/PHASE6_OFFLINE_PLAN.md` · Sign-off: `docs/TEAM_LOG.md` § Phase 6.

## Tests (required for sync changes)

```bash
npm run test -w @venue-pos/local-agent   # uses Node 20 via scripts/run-tests.mjs
npm run test -w @venue-pos/api
```

Minimum coverage per change:

1. Offline action persists in SQLite + enqueues correct `event_type`
2. Replay with same `syncId` → no duplicate server row
3. Reconnect / `processSyncQueue` marks job `done`
4. Online-only paths return `OFFLINE_MODE` when cloud down

## Anti-patterns

- POS calling cloud API directly
- API-only route with no local-agent offline branch for till operations
- New sync event without shared constant + API handler
- Skipping `enqueueSync` on offline success path
- Cross-venue partial writes without atomic group replay
- Assuming menu prices in open cheques are current without reconcile
