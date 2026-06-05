# Entity Reference

## venues
```sql
type VARCHAR CHECK (type IN ('standard', 'anchor'))
currency VARCHAR DEFAULT 'EGP'
tax_rate DECIMAL(5,4)
tax_inclusive BOOLEAN DEFAULT false
```

## orders
```sql
status VARCHAR CHECK (status IN (
  'draft','sent','partially_ready','ready','served','billed','closed','voided'
))
order_number VARCHAR NOT NULL  -- venue-scoped sequence
terminal_id UUID REFERENCES terminals(id)
```

## order_items
```sql
unit_price DECIMAL(10,2) NOT NULL  -- snapshot at add time
modifiers_snapshot JSONB DEFAULT '[]'
status VARCHAR DEFAULT 'pending'
```

## cheques
```sql
status VARCHAR CHECK (status IN ('open','paid','voided'))
anchor_venue_id UUID REFERENCES venues(id)  -- null for single-venue
```

## sync_log (server)
```sql
sync_id UUID UNIQUE NOT NULL  -- client-generated, idempotency key
terminal_id UUID NOT NULL
event_type VARCHAR NOT NULL
payload_json JSONB NOT NULL
```

## sync_queue (terminal SQLite)
```sql
id TEXT PRIMARY KEY  -- UUID
event_type TEXT NOT NULL
payload_json TEXT NOT NULL
status TEXT DEFAULT 'pending'
retry_count INTEGER DEFAULT 0
created_at TEXT NOT NULL
```

## audit_log
```sql
event_type VARCHAR NOT NULL
user_id UUID
venue_id UUID
payload_json JSONB NOT NULL
-- No updated_at, no deleted_at — append only
```
