---
name: offline-sync
description: Implements offline-first sync for Venue POS local agent and POS terminals including SQLite cache, sync queue FIFO, idempotent replay, and conflict resolution. Use when building local-agent, sync endpoints, offline mode, or reconnect behavior.
---

# Offline Sync

## Write path

```
POS action → IPC → local-agent → SQLite (orders/payments) + sync_queue row → try POST /sync
```

Every write gets a client UUID (`syncId`). Server deduplicates on `sync_id`.

## sync_queue (SQLite)

| Column | Purpose |
|--------|---------|
| id | Client UUID |
| event_type | `order.create`, `payment.create`, `order.void`, etc. |
| payload_json | Full event payload |
| status | pending → synced \| failed |
| retry_count | Increment on failure |

Worker polls every 5s when online. FIFO order. Failed items stay queued; show operator notification.

## Conflict rules

| Conflict | Resolution |
|----------|------------|
| Stale menu prices | Server wins |
| Order edit | Originating terminal only |
| Duplicate syncId | No-op (409 DUPLICATE_SYNC_ID) |
| Void paid order | Reject (422 VOID_NOT_ALLOWED) |
| Cross-venue lock | 30s server timeout |

## Reconnect flow

1. Terminal sends `lastSyncAt` + `menuVersionHash`
2. Server returns missed config/menu changes
3. Mandatory menu sync if hash mismatch before new orders
4. Drain sync_queue batch (max 50)

## Offline limitations

- Cross-venue billing: **disabled** or **coordinator-routed** per Phase 6 slice — see `docs/PHASE6_OFFLINE_PLAN.md`
- **LAN coordinator:** designated POS `local-agent` is star hub when cloud down — **not** peer mesh between agents
- Hub-wide floor locks: coordinator authoritative while offline (shared physical tables)
- Manager dashboard writes: blocked
- Integrated card terminal: manual card only

## POS UI indicators

- Banner: "Offline — working locally" when WS down or API unreachable
- Sync queue depth badge
- Progress bar during reconnect sync

## local-agent API (IPC)

POS calls `127.0.0.1:3456` only. Agent owns SQLite, printers, sync worker, WS client.

## Tests (required)

1. Disconnect → create order + cash payment → reconnect → single server record
2. Replay same syncId → no duplicate
3. Stale menu hash → forced sync before order create
