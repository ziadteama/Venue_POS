---
name: websocket-events
description: Socket.IO event contracts and room naming for Venue POS real-time features. Use when implementing WebSocket handlers, KDS updates, menu publish propagation, cross-venue notifications, or dashboard live metrics.
---

# WebSocket Events

**Full payload JSON:** `docs/TechSpec.md` §8

Stack: Socket.IO 4. JWT on connect. Terminals: `X-Terminal-ID` + `X-Terminal-Secret`.

## Rooms
`venue:{id}` · `venue:{id}:pos` · `venue:{id}:kitchen` · `dashboard:hub_manager` · `terminal:{id}`

## Key server → client events
`menu:updated` · `order:created` · `order:item_status` · `order:voided` · `cheque:cross_billed` · `cheque:lock_acquired` · `venue:config_updated` · `dashboard:metrics_tick`

## Key client → server
`terminal:heartbeat_ack` · `dashboard:subscribe` · `kitchen:status_update`

## Rules
- Validate JWT role before joining rooms
- Venue-scoped broadcasts only
- POS offline banner when WS disconnected
