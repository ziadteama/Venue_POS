# WebSocket Payload Reference

Copied from TechSpec §8. Use camelCase in wire format.

## menu:updated
```json
{
  "templateId": "uuid",
  "venueIds": ["uuid"],
  "versionHash": "string",
  "publishedAt": "ISO8601"
}
```

## order:created
```json
{
  "orderId": "uuid",
  "venueId": "uuid",
  "tableId": "string",
  "items": [],
  "status": "sent",
  "sentAt": "ISO8601"
}
```

## order:item_status
```json
{
  "orderId": "uuid",
  "itemId": "uuid",
  "status": "in_progress|ready",
  "updatedBy": "uuid",
  "updatedAt": "ISO8601"
}
```

## cheque:cross_billed
```json
{
  "chequeId": "uuid",
  "anchorVenueId": "uuid",
  "linkedVenueIds": ["uuid"],
  "total": "150.00",
  "paidAt": "ISO8601"
}
```

## cheque:lock_acquired
```json
{
  "chequeId": "uuid",
  "lockedOrderIds": ["uuid"],
  "anchorVenueId": "uuid",
  "expiresAt": "ISO8601"
}
```

## terminal:heartbeat (client → server)
```json
{
  "terminalId": "uuid",
  "venueId": "uuid",
  "timestamp": "ISO8601",
  "syncQueueDepth": 0,
  "menuVersionHash": "string"
}
```

## dashboard:metrics_tick
```json
{
  "timestamp": "ISO8601",
  "venues": [{
    "venueId": "uuid",
    "revenueToday": "decimal",
    "activeOrders": 5,
    "ordersPerMinute": 2.3,
    "openTables": 8
  }]
}
```
