---
name: websocket-events
description: Socket.IO event contracts and room naming for Venue POS real-time features. Use when implementing WebSocket handlers, KDS updates, menu publish propagation, cross-venue notifications, or dashboard live metrics.
---

# WebSocket Events

Stack: Socket.IO 4. Auth via JWT on connect. Terminals also send `X-Terminal-ID` + `X-Terminal-Secret`.

## Rooms

```
venue:{venueId}              — all venue clients
venue:{venueId}:pos          — POS only
venue:{venueId}:kitchen      — KDS only
dashboard:hub_manager        — hub manager metrics
dashboard:venue:{venueId}    — venue manager
terminal:{terminalId}        — single terminal
cheque:{chequeId}            — cross-venue participants
```

## Server → client (emit on business action)

| Event | Trigger | Target room |
|-------|---------|-------------|
| `menu:updated` | Menu publish | `venue:{id}` |
| `order:created` | Send to kitchen | `venue:{id}:kitchen` |
| `order:item_status` | KDS bump | `venue:{id}:pos` |
| `order:voided` | Void approved | `venue:{id}` |
| `cheque:cross_billed` | Cross-venue paid | each linked `venue:{id}` |
| `cheque:lock_acquired` | Cross-venue start | affected venues |
| `venue:config_updated` | Admin config change | `venue:{id}` |
| `dashboard:metrics_tick` | Every 60s | `dashboard:hub_manager` |
| `alert:stock_low` | Low stock | `venue:{id}:pos` |

## Client → server

| Event | Source |
|-------|--------|
| `terminal:heartbeat_ack` | POS/agent every 30s |
| `dashboard:subscribe` | Dashboard on load |
| `kitchen:status_update` | KDS status change |

## Reconnection

- Backoff: 1s, 2s, 4s, 8s … max 30s
- On reconnect: send `lastEventId` for replay
- POS shows offline banner when disconnected

## Payload details

Full JSON shapes in [reference.md](reference.md) and `docs/TechSpec.md` §8.

## Implementation notes

- Validate JWT role before joining rooms
- Venue managers join `dashboard:venue:{theirVenueId}` only
- Hub managers join `dashboard:hub_manager`
- Never broadcast sensitive data outside venue scope
