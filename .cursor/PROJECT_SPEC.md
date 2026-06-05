# Venue POS — Build Specification

Condensed reference for implementation. Full detail in `docs/`.

## 1. Architecture

```
Cloud Server (API + Postgres + Redis + Nginx)
    │ HTTPS / WSS
    ├── Local Agent (per terminal) ── IPC ── POS Electron App
    ├── KDS App
    └── Admin Dashboard (browser)
```

- **Local-first writes**: SQLite → sync_queue → REST `/api/v1/sync` (idempotent by `syncId`).
- **Real-time**: Socket.IO rooms per venue (`venue:{id}`, `:pos`, `:kitchen`).
- **Conflict policy**: server price wins; originating terminal wins order edits; duplicate syncId = no-op.

## 2. Core Database Tables

All PKs: `id UUID DEFAULT gen_random_uuid()`. Timestamps: `created_at`, `updated_at`. Soft delete: `deleted_at`.

| Table | Key columns |
|-------|-------------|
| `venues` | `name_en`, `name_ar`, `type` (standard\|anchor), `currency`, `is_active` |
| `venue_billing_config` | `anchor_venue_id`, `target_venue_id`, `is_enabled` |
| `menu_templates` | `name`, `status` (draft\|published\|archived), `published_at`, `version_hash` |
| `menu_template_venues` | `menu_template_id`, `venue_id` |
| `categories` | `menu_template_id`, `name_en`, `name_ar`, `display_order` |
| `menu_items` | `category_id`, `name_en`, `name_ar`, `description_en`, `description_ar`, `price`, `tax_rate`, `image_url`, `is_available` |
| `modifier_groups` | `name_en`, `name_ar`, `min_selection`, `max_selection` |
| `modifier_options` | `group_id`, `name_en`, `name_ar`, `price_delta` |
| `menu_items_modifiers` | `menu_item_id`, `modifier_group_id` |
| `users` | `username`, `password_hash`, `pin_hash`, `card_uid`, `role`, `venue_id`, `is_active` |
| `terminals` | `venue_id`, `secret_hash`, `is_active`, `last_seen_at` |
| `orders` | `venue_id`, `table_id`, `cashier_id`, `terminal_id`, `status`, `order_number`, `opened_at`, `closed_at` |
| `order_items` | `order_id`, `menu_item_id`, `quantity`, `unit_price`, `modifiers_snapshot` JSONB, `status` |
| `cheques` | `venue_id`, `status` (open\|paid\|voided), `total`, `anchor_venue_id` |
| `cheque_orders` | `cheque_id`, `order_id` |
| `payments` | `cheque_id`, `method`, `amount`, `reference`, `processed_at` |
| `shifts` | `user_id`, `venue_id`, `open_float`, `close_float`, `over_short_amount`, `opened_at`, `closed_at` |
| `sync_log` | `terminal_id`, `sync_id`, `event_type`, `payload_json`, `synced_at` |
| `audit_log` | `event_type`, `user_id`, `venue_id`, `payload_json`, `created_at` (append-only) |

### Order status enum
`draft` → `sent` → `partially_ready` → `ready` → `served` → `billed` → `closed` | `voided`

### Roles
`hub_manager`, `venue_manager`, `cashier`, `kitchen_staff`, `system_admin`

## 3. API Surface (v1)

Base: `/api/v1`. Responses camelCase; DB snake_case. Errors: `{ error: { code, message, details, timestamp, request_id } }`.

### Auth
- `POST /auth/login` — manager username/password → JWT + refresh cookie
- `POST /auth/pin` — cashier PIN (+ terminal headers) → JWT
- `POST /auth/refresh` — refresh token rotation
- `POST /auth/logout`

### Terminals
- `POST /terminals/register` — onboarding
- `GET /terminals/:id/config` — menu, venue config, feature flags

### Menu (manager)
- `GET/POST /menu-templates`
- `PATCH /menu-templates/:id`
- `POST /menu-templates/:id/publish` → emits `menu:updated`
- `GET/POST/PATCH /categories`, `/menu-items`, `/modifier-groups`

### Orders (POS)
- `POST /orders` — create draft
- `PATCH /orders/:id/items` — add/remove items (draft only)
- `POST /orders/:id/send` — draft → sent
- `POST /orders/:id/void` — manager PIN required
- `GET /orders` — list/filter (dashboard)

### Cheques & payments
- `POST /cheques` — standard or cross-venue
- `GET /cheques/:id`
- `POST /cheques/:id/payments`
- `POST /cheques/:id/complete`

### Cross-venue
- `GET /venues/:id/billing-permissions`
- `GET /venues/:id/open-orders?venueIds=`
- `POST /cheques/cross-venue` — acquires locks (30s timeout)

### Sync (terminal)
- `POST /sync` — batch sync queue items (idempotent)
- `GET /sync/status` — server changes since `lastSyncAt`

### Shifts
- `POST /shifts/open`, `POST /shifts/:id/close`

### Dashboard
- `GET /dashboard/metrics`, `GET /analytics/revenue`, `GET /audit-log`

## 4. Local Agent (SQLite)

Mirrors: published menus, venue config, user PIN hashes (cashiers only), open orders, sync_queue.

### sync_queue row
`id` (UUID), `created_at`, `event_type`, `payload_json`, `retry_count`, `status` (pending\|synced\|failed)

### Agent responsibilities
- HTTP API on `127.0.0.1:3456` for POS IPC
- Background sync worker (5s poll)
- ESC/POS printer bridge
- Watchdog for POS process
- WebSocket client to server

## 5. WebSocket Events (summary)

See `docs/TechSpec.md` §8 for full payloads.

| Event | Direction | Room |
|-------|-----------|------|
| `menu:updated` | S→C | `venue:{id}` |
| `order:created` | S→C | `venue:{id}:kitchen` |
| `order:item_status` | S→C | `venue:{id}:pos` |
| `order:voided` | S→C | `venue:{id}` |
| `cheque:cross_billed` | S→C | `venue:{id}` |
| `cheque:lock_acquired` | S→C | `venue:{id}` |
| `venue:config_updated` | S→C | `venue:{id}` |
| `dashboard:metrics_tick` | S→C | `dashboard:hub_manager` |
| `terminal:heartbeat` | C→S | `terminal:{id}` |
| `kitchen:status_update` | C→S | — |

## 6. Feature Flags (defaults)

| Flag | Default |
|------|---------|
| integrated_card_payment | OFF |
| reservation_module | OFF |
| loyalty_program | OFF |
| inventory_management | ON |
| digital_receipts | ON |
| kds_enabled | ON |
| cross_venue_billing | ON |
| multi_language | ON |

## 7. Performance Targets

- Order submit: < 500ms
- Menu publish: < 2s to connected terminals
- POS RAM (app + agent): < 300 MB
- Dashboard initial load: < 2s

## 8. i18n Rules

- UI: `react-i18next`, files `locales/en.json`, `locales/ar.json`
- RTL: `dir="rtl"` on `<html>` when Arabic; Tailwind logical properties (`ms-`, `me-`, `start`, `end`)
- API returns both `nameEn`/`nameAr` (or snake in DB, camel in API)
- ESLint i18n plugin: no hardcoded user-facing strings
