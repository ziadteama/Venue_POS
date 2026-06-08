# Product Requirements Document (PRD)
# Unified Hub POS & Management System
# Version 1.0 | 6 June 2026

---

## 1. Document Control

| Field | Value |
|-------|-------|
| Document Type | Product Requirements Document |
| Version | 1.0 |
| Date | 6 June 2026 |
| Status | Draft |
| Classification | Confidential |

---

## 2. Product Overview

### 2.1 Product Vision
A unified Point-of-Sale and Management System for multi-venue food & beverage hubs. The system enables independent restaurant operations with shared infrastructure, centralized menu governance, cross-venue billing, and offline resilience.

### 2.2 Target Users
- Hub Manager / Admin
- Venue Manager
- Cashier / Waiter
- Kitchen Staff
- System Admin (IT)

### 2.3 Success Metrics
- Order submission latency < 500ms
- Menu publish propagation < 2 seconds
- 100% POS availability during connectivity loss
- Cashier training time < 2 hours
- 99.5% server uptime monthly

---

## 3. User Stories & Acceptance Criteria

### Epic 1: Authentication & Authorization

#### US-1.1: Manager Login
**As a** Hub Manager, **I want** to log into the admin dashboard, **so that** I can manage the system.

**Acceptance Criteria:**
- [ ] Manager can enter username and password
- [ ] Password must be bcrypt hashed
- [ ] System issues JWT access token (15-min expiry) and refresh token (30-day, HTTP-only cookie)
- [ ] Two-factor authentication (TOTP) available as optional
- [ ] Session timeout after 8 hours of inactivity
- [ ] Failed login attempts rate-limited (100 req/min per IP)
- [ ] HTTP redirects to HTTPS automatically

**Priority:** P0 | **Effort:** 3 days

#### US-1.2: Cashier Login
**As a** Cashier, **I want** to log into the POS terminal using a PIN, **so that** I can start my shift.

**Acceptance Criteria:**
- [ ] Cashier enters 4-6 digit PIN
- [ ] PIN validated against bcrypt hash in local SQLite cache
- [ ] Alternative: Card/RFID UID tap login
- [ ] JWT issued for terminal session
- [ ] PIN change enforced every 90 days
- [ ] Login events logged to audit trail

**Priority:** P0 | **Effort:** 2 days

#### US-1.3: Terminal Registration
**As an** IT Admin, **I want** to register a new POS terminal, **so that** it can connect to the system.

**Acceptance Criteria:**
- [ ] Terminal has pre-assigned unique terminal_id
- [ ] Pre-shared secret configured during onboarding
- [ ] Server validates terminal_id on every API call
- [ ] Terminal downloads latest menu and config on first launch
- [ ] Replacement terminal: same installer, server auto-deactivates old terminal_id
- [ ] Total setup time < 5 minutes per terminal

**Priority:** P0 | **Effort:** 3 days

#### US-1.4: Role-Based Access Control
**As a** Hub Manager, **I want** to assign roles to staff, **so that** access is properly scoped.

**Acceptance Criteria:**
- [ ] Roles: hub_manager, venue_manager, cashier, kitchen_staff, system_admin
- [ ] Hub Manager sees all venues and data
- [ ] Venue Manager sees only their venue's data
- [ ] Cashier sees only POS terminal (no admin data)
- [ ] Kitchen Staff sees only KDS view
- [ ] System Admin sees only server/network logs (no business data)
- [ ] JWT contains role, venue_id, user_id claims
- [ ] API endpoints validate role claim before processing

**Priority:** P0 | **Effort:** 4 days

---

### Epic 2: Menu Management

#### US-2.1: Create Menu Template
**As a** Hub Manager, **I want** to create a menu template, **so that** I can define what items are available.

**Acceptance Criteria:**
- [ ] Manager can create menu template with name
- [ ] Template can be assigned to one or more venues
- [ ] Template has bilingual fields: name_en, name_ar
- [ ] System stamps created_at and updated_at timestamps
- [ ] Menu templates listed in admin dashboard with status (draft/published/archived)

**Priority:** P0 | **Effort:** 3 days

#### US-2.2: Create Menu Categories
**As a** Hub Manager, **I want** to create categories within a menu, **so that** items are organized.

**Acceptance Criteria:**
- [ ] Manager can create categories: name_en, name_ar
- [ ] Categories belong to a menu_template
- [ ] Drag-and-drop category ordering supported
- [ ] Categories can be reordered without breaking item associations
- [ ] Category display order persisted in database

**Priority:** P0 | **Effort:** 2 days

#### US-2.3: Create Menu Items
**As a** Hub Manager, **I want** to add items to categories, **so that** they appear on the POS.

**Acceptance Criteria:**
- [ ] Item fields: name_en, name_ar, description_en, description_ar, price, tax_rate, image_url, is_available
- [ ] Item belongs to exactly one category
- [ ] Price validation: positive number, 2 decimal places
- [ ] Image served from server, lazy-loaded in POS
- [ ] Manager can toggle availability ("86" an item)
- [ ] Missing translation indicator for empty bilingual fields
- [ ] Bulk CSV export/import for translations
- [ ] Auto-translate button using external API (manager review required)

**Priority:** P0 | **Effort:** 4 days

#### US-2.4: Create Modifiers
**As a** Hub Manager, **I want** to add modifiers to items, **so that** customers can customize orders.

**Acceptance Criteria:**
- [ ] Modifier groups: name_en, name_ar, min_selection, max_selection
- [ ] Modifier options: name_en, name_ar, price_delta
- [ ] Min/max selection rules enforced at order time
- [ ] Modifiers attached to items via menu_items_modifiers junction table
- [ ] Modifier snapshot stored with order_item at order time (price protection)

**Priority:** P1 | **Effort:** 3 days

#### US-2.5: Publish Menu
**As a** Hub Manager, **I want** to publish a menu, **so that** it appears on POS terminals.

**Acceptance Criteria:**
- [ ] Publish button in admin dashboard
- [ ] System stamps published_at timestamp
- [ ] WebSocket event menu:updated broadcast to affected venue terminals
- [ ] Terminals receive update, validate version_hash, write to local SQLite
- [ ] POS UI refreshes on next order screen load
- [ ] Offline terminals pull latest menu on next sync
- [ ] Version hash comparison detects stale menus
- [ ] Menu publish propagation < 2 seconds to connected terminals

**Priority:** P0 | **Effort:** 3 days

#### US-2.6: Menu Governance (Staff Cannot Modify)
**As a** Hub Manager, **I want** to prevent staff from modifying menus, **so that** pricing is controlled.

**Acceptance Criteria:**
- [ ] POS terminal menu is read-only for all staff roles
- [ ] No edit, create, or delete item buttons in POS UI
- [ ] No price modification capability in POS
- [ ] Staff can request menu changes (pending approval workflow)
- [ ] Venue Manager can view but not edit their venue's assigned menu
- [ ] Audit log captures any unauthorized modification attempts

**Priority:** P0 | **Effort:** 2 days

---

### Epic 3: Order Management

#### US-3.1: Create Order
**As a** Cashier, **I want** to create a new order, **so that** I can start taking a customer's order.

**Acceptance Criteria:**
- [ ] Order created with venue_id, table_id, cashier_id
- [ ] Initial status: draft
- [ ] Order has opened_at timestamp
- [ ] Table/seat assignment supported
- [ ] Order number auto-generated (venue-specific sequence)
- [ ] Order written to local SQLite first, then synced to server
- [ ] Order creation latency < 500ms

**Priority:** P0 | **Effort:** 3 days

#### US-3.2: Add Items to Order
**As a** Cashier, **I want** to add menu items to an order, **so that** the customer's selections are recorded.

**Acceptance Criteria:**
- [ ] Cashier taps item from menu grid
- [ ] Modifier selection modal appears if item has modifiers
- [ ] Min/max modifier rules enforced with visual validation
- [ ] Quantity can be adjusted (+/- buttons or numeric input)
- [ ] Unit price locked at time of addition (menu price snapshot)
- [ ] Order item stored with: order_id, menu_item_id, quantity, unit_price, modifiers_snapshot (JSON)
- [ ] Running total calculated in real-time
- [ ] Items can be removed from draft order before sending to kitchen

**Priority:** P0 | **Effort:** 4 days

#### US-3.3: Send Order to Kitchen
**As a** Cashier, **I want** to send the order to the kitchen, **so that** food preparation begins.

**Acceptance Criteria:**
- [ ] "Send to Kitchen" button available in draft status
- [ ] Order status changes: draft → sent
- [ ] Items locked after sending (no modification)
- [ ] Kitchen printer auto-prints order ticket grouped by station
- [ ] KDS receives real-time order:created event via WebSocket
- [ ] Order ticket shows: order number, table, items, modifiers, time sent, station grouping
- [ ] Void requires manager approval and reason

**Priority:** P0 | **Effort:** 3 days

#### US-3.4: Order Status Lifecycle
**As a** Kitchen Staff, **I want** to update order item status, **so that** the POS reflects preparation progress.

**Acceptance Criteria:**
- [ ] Status transitions: draft → sent → partially_ready → ready → served → billed → closed
- [ ] Kitchen staff can mark items as: in_progress, ready
- [ ] KDS UI shows status with color coding
- [ ] POS receives order:item_status updates via WebSocket
- [ ] Order age indicator visible in KDS (time since sent)
- [ ] SLA alerts for items exceeding configured time thresholds
- [ ] All items ready → order status auto-updates to ready
- [ ] Waiter confirms served → status updates to served

**Priority:** P1 | **Effort:** 4 days

#### US-3.5: Void Order
**As a** Cashier, **I want** to void an order, **so that** mistakes can be corrected.

**Acceptance Criteria:**
- [ ] Void button available for orders in draft or sent status
- [ ] Manager PIN required for void approval
- [ ] Void reason must be entered (required field)
- [ ] Order status changes to voided
- [ ] Audit log records: order_id, cashier_id, approver_id, reason, timestamp
- [ ] WebSocket event order:voided broadcast to KDS (removes ticket)
- [ ] Voided orders excluded from revenue reports
- [ ] Void on already-paid cheque rejected by server, flagged for manager review

**Priority:** P1 | **Effort:** 3 days

#### US-3.6: Split Order/Billing
**As a** Cashier, **I want** to split an order by item, seat, or custom amount, **so that** groups can pay separately.

**Acceptance Criteria:**
- [ ] Split by item: select specific items for each sub-cheque
- [ ] Split by seat: auto-group items by seat assignment
- [ ] Split by custom amount: enter specific amounts (must sum to total)
- [ ] Each split generates separate cheque record
- [ ] Original order linked to multiple cheques
- [ ] Payment processed per sub-cheque independently
- [ ] All splits visible in order explorer with linkage

**Priority:** P1 | **Effort:** 4 days

---

### Epic 4: Cross-Venue Billing

#### US-4.1: Configure Cross-Venue Billing
**As a** Hub Manager, **I want** to configure which venues can be included in cross-venue cheques, **so that** the Cafe can bill for other restaurants.

**Acceptance Criteria:**
- [x] Venue type: standard or anchor configurable per venue (hub Settings)
- [x] Billing rules matrix in admin dashboard (`BillingMatrixSection`)
- [x] Toggle allowed pairs (anchor → target venue)
- [x] Changes take effect immediately via WebSocket (`venue:config_updated`)
- [x] Standard restaurants cannot initiate cross-venue (anchor terminal + `features.crossVenueBilling`)
- [x] Configuration stored in `venue_billing_config` table
- [x] Audit log captures all configuration changes

**Priority:** P0 | **Effort:** 3 days · **Status:** Shipped (Phase 4)

#### US-4.2: Create Cross-Venue Cheque
**As a** Cashier at an Anchor Venue, **I want** to build one order spanning multiple linked venues from the anchor POS, **so that** customers can order from Cafe and Restaurant menus and pay in one transaction.

**Workflow (implemented):** Open a table as usual → toggle **Standard / Cross-sell** above the menu → switch venue tabs → add items. First linked-venue item **lazily** stamps `crossVenueGroupId` on the current anchor cheque and creates sibling venue cheques. Same Send / Clear / Pay buttons as standard service.

**Acceptance Criteria:**
- [x] Anchor cashier uses **Cross-sell** mode on main POS (online-only; hub unreachable surfaces agent error)
- [x] POS shows venue tabs (anchor home + `venue_billing_config` targets)
- [x] Each tab loads that venue's published menu from the server
- [x] Adding an item creates/uses a real cheque + draft order for that venue (`cheque.venueId` / `order.venueId` = item's venue)
- [x] Server rejects menu items that do not belong to the selected venue tab
- [x] **Send** fires every venue's draft round to its own kitchen (`order:created` per `order.venueId`)
- [x] Combined cart shows items grouped by venue with per-venue subtotals
- [x] Cross-venue group linked via `crossVenueGroupId` on each venue's cheque
- [ ] Cross-venue disabled when offline with clear UI message — **deferred Phase 6**

**Priority:** P0 | **Effort:** 5 days · **Status:** Shipped v1 (integrated cross-sell)

#### US-4.3: Pay Cross-Venue Cheque
**As a** Cashier at an Anchor Venue, **I want** to process payment for a cross-venue cheque, **so that** the transaction is completed.

**Acceptance Criteria:**
- [x] Payment processed at anchor venue's terminal (same Pay modal as standard)
- [x] Cash payment with tender/change (v1 single method for whole group)
- [ ] Card / voucher / split tender on cross-venue group — **deferred** (standard single-cheque split still works)
- [x] Server updates every member cheque: open → paid
- [x] WebSocket `cheque:cross_billed` broadcast after group pay
- [x] Linked orders status updated to closed
- [x] Revenue attribution: one `Payment` row per venue cheque (`cheque.venueId`)
- [ ] KDS at linked venues auto-refreshes on cross-billed — **loose** (no dedicated listener on target POS)
- [x] Customer receipt: one combined slip with per-venue subtotals (not itemized lines per venue)

**Priority:** P0 | **Effort:** 4 days · **Status:** Shipped v1 (single-tender pay)

---

### Epic 5: Payment Processing

#### US-5.1: Cash Payment
**As a** Cashier, **I want** to process cash payments, **so that** customers can pay with cash.

**Acceptance Criteria:**
- [ ] Cashier enters amount tendered
- [ ] System calculates change due automatically
- [ ] Change amount displayed prominently
- [ ] Payment record created: cheque_id, method=cash, amount, processed_at
- [ ] Shift float updated (cash in drawer tracked)
- [ ] Receipt prints automatically (configurable)
- [ ] Order status updates: billed → closed

**Priority:** P0 | **Effort:** 2 days

#### US-5.2: Card Payment (Integrated)
**As a** Cashier, **I want** to process card payments through an integrated terminal, **so that** transactions are seamless.

**Acceptance Criteria:**
- [ ] Integrated PDQ terminal (Ingenico, PAX) connected via SDK or serial
- [ ] Amount sent to terminal automatically
- [ ] Transaction ID stored against cheque
- [ ] No card PANs stored (PCI-DSS compliant)
- [ ] Fallback to manual entry if terminal connection fails
- [ ] Feature flag: integrated_card_payment (default OFF)

**Priority:** P1 | **Effort:** 5 days

#### US-5.3: Card Payment (Manual)
**As a** Cashier, **I want** to record a manual card payment, **so that** venues without integrated terminals can accept cards.

**Acceptance Criteria:**
- [ ] Cashier marks payment method as "card"
- [ ] Last-4 digits of card entered (optional)
- [ ] Payment record created without transaction ID
- [ ] Clear UI indication that this is manual entry
- [ ] Manager approval required for amounts above configured threshold

**Priority:** P0 | **Effort:** 2 days

#### US-5.4: Split Payment
**As a** Cashier, **I want** to accept multiple payment methods for one cheque, **so that** customers can split the bill.

**Acceptance Criteria:**
- [ ] Multiple payment rows per cheque
- [ ] Each row: method, amount, reference (optional)
- [ ] Running balance shows remaining amount
- [ ] Sum of all payments must equal cheque total (validation)
- [ ] Cash + Card combination supported
- [ ] Card + Voucher combination supported
- [ ] Any number of splits supported (practical limit: 5)
- [ ] Each payment method tracked separately in reports

**Priority:** P1 | **Effort:** 3 days

#### US-5.5: Voucher/Promo Payment
**As a** Cashier, **I want** to apply voucher codes, **so that** customers can use promotions.

**Acceptance Criteria:**
- [ ] Voucher code entered in payment screen
- [ ] Server validates voucher code (active, not expired, not used)
- [ ] Discount applied before payment calculation
- [ ] Voucher value deducted from total
- [ ] Remaining balance paid via other methods
- [ ] Voucher usage logged (one-time use enforced)
- [ ] Audit log captures voucher application

**Priority:** P2 | **Effort:** 3 days

#### US-5.6: Refund Processing
**As a** Manager, **I want** to process refunds, **so that** customer complaints can be resolved.

**Workflow (implemented):**
- **Venue manager** (`venue_manager`) **requests** a refund from POS (PIN) or dashboard Cheques — creates a pending `ManagerApprovalRequest`.
- **Hub manager** (`hub_manager`) **force-refunds** from dashboard **Cheques** (Approvals nav removed; `/approvals` API + page code remain for optional re-enable).
- On approval or force-refund, the refund is executed, audited, and receipt printed (when printer configured).

**Acceptance Criteria:**
- [x] Refund initiated from POS or dashboard Cheques (venue manager request)
- [x] Hub manager approval required before refund executes (venue manager cannot finalize alone)
- [x] Refund linked to original cheque
- [x] Refund amount cannot exceed original payment
- [x] Refund method validated against original payment method (cash/card/voucher caps)
- [x] Audit log records: cheque, amount, reason, initiator, approver
- [x] Refund reflected in revenue reports (negative revenue)
- [x] Receipt printed for refund transaction (on approve / force-refund)
- [ ] Refund initiated from order explorer (hub) — deferred; use Cheques + Approvals

**Priority:** P1 | **Effort:** 3 days · **Status:** Shipped (request → approve)

---

### Epic 6: Kitchen Display System (KDS)

> **Optional deployment:** `kds_enabled` is set during provider/client onboarding (see feature-flag epic). When OFF, venues rely on kitchen printer only — Epic 6 stories do not apply to that client, but US-6.3 (printer) and send-to-kitchen from Phase 1 still do. Implement KDS behind the flag; do not assume every hub runs `apps/kds`.

#### US-6.1: KDS Order Display
**As a** Kitchen Staff, **I want** to see incoming orders on a screen, **so that** I can prepare food efficiently.

**Acceptance Criteria:**
- [ ] KDS displays orders in real-time via WebSocket
- [ ] Orders grouped by station (grill, cold, bar, etc.)
- [ ] Each ticket shows: order number, table, items, modifiers, time elapsed
- [ ] Color coding by age: green (< 5 min), yellow (5-10 min), red (> 10 min)
- [ ] SLA alerts for items exceeding configured thresholds
- [ ] New orders appear with visual/audible notification
- [ ] KDS supports multiple stations per screen (filterable)

**Priority:** P0 | **Effort:** 4 days

#### US-6.2: KDS Status Updates
**As a** Kitchen Staff, **I want** to update item status, **so that** the POS knows preparation progress.

**Acceptance Criteria:**
- [ ] Touchscreen or bump-bar interaction
- [ ] Status actions: Start (in_progress), Ready (ready), Bump (served)
- [ ] Single-tap or button press to change status
- [ ] Status change emitted via WebSocket (order:item_status)
- [ ] POS receives update and reflects in UI
- [ ] Order removed from KDS when all items served or order voided
- [ ] Undo action available for 30 seconds after status change

**Priority:** P0 | **Effort:** 3 days

#### US-6.3: Kitchen Printer Integration
**As a** Kitchen Staff, **I want** orders printed automatically, **so that** I have a physical ticket.

**Acceptance Criteria:**
- [ ] Auto-print on order:created event
- [ ] Items grouped by station with clear headers
- [ ] ESC/POS protocol via USB or network printer
- [ ] Printer IP configurable per venue
- [ ] Fallback to KDS-only if printer offline
- [ ] Print retry logic (3 attempts, then alert)
- [ ] Printer status visible in system health panel

**Priority:** P1 | **Effort:** 3 days

---

### Epic 7: Offline Resilience

#### US-7.1: Offline Order Creation
**As a** Cashier, **I want** to create orders when the internet is down, **so that** business continues uninterrupted.

**Acceptance Criteria:**
- [ ] POS functions fully during internet outage
- [ ] Orders written to local SQLite first
- [ ] Sync queue table stores all write operations
- [ ] Each queue item: UUID, timestamp, event_type, payload_json
- [ ] FIFO ordering preserved
- [ ] UI banner: "Offline — working locally" when disconnected
- [ ] Banner auto-dismisses on reconnection
- [ ] No data loss on terminal power loss (SQLite WAL mode)

**Priority:** P0 | **Effort:** 5 days

#### US-7.2: Offline Payment Processing
**As a** Cashier, **I want** to process payments offline, **so that** customers can still pay.

**Acceptance Criteria:**
- [ ] Cash payments process normally offline
- [ ] Card payments: manual entry only (no integrated terminal)
- [ ] Payment records queued in sync_queue
- [ ] Queue depth visible in POS UI (indicator)
- [ ] Payments sync automatically on reconnect
- [ ] Duplicate payment detection via UUID (idempotent)
- [ ] Failed queue items flagged but not dropped
- [ ] Operator notification for repeatedly failing items

**Priority:** P0 | **Effort:** 4 days

#### US-7.3: Sync on Reconnect
**As a** Cashier, **I want** all offline data to sync when connectivity returns, **so that** the server is up to date.

**Acceptance Criteria:**
- [ ] Background sync worker polls every 5 seconds when online
- [ ] Queue drained in order on successful connection
- [ ] Server sync endpoint idempotent (client UUID deduplication)
- [ ] Terminal announces last_sync_at on reconnect
- [ ] Server responds with missed menu/config changes
- [ ] Version hash comparison detects stale menus
- [ ] Mandatory menu sync before accepting new orders post-reconnect
- [ ] Conflict resolution: server price wins, originating terminal wins for order modifications
- [ ] Sync progress indicator in POS UI

**Priority:** P0 | **Effort:** 5 days

#### US-7.4: Offline Menu Access
**As a** Cashier, **I want** to access the menu offline, **so that** I can continue taking orders.

**Acceptance Criteria:**
- [ ] Full menu cached locally in SQLite
- [ ] Menu functional indefinitely offline
- [ ] Cached menu includes: items, categories, modifiers, prices, tax rates
- [ ] Menu refreshed on every successful sync or menu_update event
- [ ] Price conflicts: server price wins on reconciliation
- [ ] Stale menu detection via version_hash
- [ ] Menu publish events queued if terminal offline at publish time

**Priority:** P0 | **Effort:** 3 days

---

### Epic 8: Admin Dashboard

#### US-8.1: Live Sales Overview
**As a** Hub Manager, **I want** to see real-time sales data, **so that** I can monitor operations.

**Acceptance Criteria:**
- [x] Real-time sales counter (total revenue today)
- [x] Active orders by venue (live count)
- [x] Orders-per-minute rate
- [x] Current open tables heat map
- [x] Data updates every 60 seconds via WebSocket (`dashboard:metrics_tick`)
- [ ] Page load < 2 seconds initial, < 500ms subsequent — not formally benchmarked
- [x] Responsive layout for tablet and desktop

**Priority:** P0 | **Effort:** 4 days · **Status:** Shipped

#### US-8.2: Revenue Analytics
**As a** Hub Manager, **I want** to analyze revenue trends, **so that** I can make business decisions.

**Acceptance Criteria:**
- [x] Revenue by venue, category, item
- [x] Period comparison: today vs yesterday, this week vs last, etc.
- [x] Date range picker (presets + custom start/end)
- [x] Charts using Recharts
- [x] Export to CSV
- [x] Drill-down from venue → category → item
- [x] Currency formatting respects locale (EGP)

**Priority:** P1 | **Effort:** 4 days · **Status:** Shipped

#### US-8.3: Order Explorer
**As a** Venue Manager, **I want** to search and view orders for my venue, **so that** I can investigate issues. *(Hub manager uses Orders explorer, Activity, and Cheques for refunds; order explorer is scoped to venue managers per product decision.)*

**Acceptance Criteria:**
- [x] Search by: order number, cheque number, table, cashier, date range, status
- [x] Filter by: venue (single), status, payment method, amount range
- [x] Drill down to line items, modifiers, payment details (grouped by shift → cheque → orders)
- [x] Reprint order/cheque receipt
- [x] View voided orders with reason (via status filter)
- [x] View cross-venue cheque linkage — Phase 4
- [x] Pagination: 50 per page
- [x] Export filtered results to CSV

**Priority:** P1 | **Effort:** 3 days · **Status:** Shipped (venue_manager only)

#### US-8.4: Menu Manager
**As a** Hub Manager, **I want** a visual interface to manage menus, **so that** I can update offerings easily.

**Acceptance Criteria:**
- [x] Create/edit menu templates
- [x] Drag-and-drop category ordering
- [x] Item form with side-by-side Arabic/English fields
- [x] Missing translation indicator + suggest Arabic
- [x] Item availability toggle (86)
- [x] One-click publish with confirmation
- [x] Preview menu as it appears in POS
- [x] Bulk CSV export/import for translations
- [ ] Auto-translate via external API — deferred (suggest copies EN for manager edit)

**Priority:** P0 | **Effort:** 5 days · **Status:** Shipped (core)

#### US-8.5: Venue Configuration
**As a** Hub Manager, **I want** to configure venue settings, **so that** each venue operates correctly.

**Acceptance Criteria:**
- [x] Set venue name (en/ar), type (standard/anchor)
- [x] Tax settings (rate, inclusive/exclusive)
- [x] Service charge (optional rate, enable/disable)
- [x] Receipt template selection
- [x] Printer IP configuration (kitchen + receipt; synced to local-agent)
- [x] Changes propagate via WebSocket immediately (`venue:config_updated`)
- [x] Audit log captures all changes (`venue_config_audits`)

**Priority:** P1 | **Effort:** 3 days · **Status:** Shipped (slice 1)

#### US-8.6: Billing Rules Configuration
**As a** Hub Manager, **I want** to configure cross-venue billing rules, **so that** anchor venues can bill correctly.

**Acceptance Criteria:**
- [x] Visual matrix: anchor venues × target venues (Settings → Cross-venue billing)
- [x] Toggle per pair (enabled/disabled)
- [x] Changes take effect immediately
- [x] WebSocket propagation to affected terminals (`venue:config_updated`)
- [x] Audit log captures rule changes
- [x] Visual indicator of current configuration state (enabled/disabled per pair)

**Priority:** P0 | **Effort:** 2 days · **Status:** Shipped (Phase 4)

#### US-8.7: User Management
**As a** Hub Manager, **I want** to manage staff accounts, **so that** the right people have access.

**Acceptance Criteria:**
- [ ] Add/edit/deactivate staff
- [ ] Assign venue and role
- [ ] Set/reset PIN (4-6 digits)
- [ ] Assign RFID card UID
- [ ] View shift history per user
- [ ] Bulk import via CSV
- [ ] Deactivated users cannot log in
- [ ] Audit log captures user changes

**Priority:** P1 | **Effort:** 3 days

#### US-8.8: Inventory Tracking
**As a** Hub Manager, **I want** to track inventory levels, **so that** I can prevent stockouts.

**Acceptance Criteria:**
- [ ] Set par levels per item
- [ ] Log deliveries (quantity, date, supplier)
- [ ] Consumption reports (based on orders)
- [ ] Low-stock alert thresholds
- [ ] Alert:stock_low WebSocket event to POS
- [ ] Manual stock count adjustment
- [ ] Feature flag: inventory_management (default ON)

**Priority:** P2 | **Effort:** 4 days

#### US-8.9: Shift Management
**As a** Hub Manager, **I want** to view and manage cashier shifts, **so that** I can track cash handling.

**Acceptance Criteria:**
- [x] View open shifts (cashier, venue, open time)
- [x] View declared float vs actual close float
- [x] Over/short report per shift
- [x] Force-close shift (manager override)
- [x] Shift history searchable by date, venue, cashier
- [x] Export shift reports to CSV
- [ ] End-of-day reconciliation view — slice 2

**Priority:** P1 | **Effort:** 3 days · **Status:** Shipped (slice 1)

#### US-8.10: System Health Panel
**As a** System Admin, **I want** to monitor system health, **so that** I can detect issues.

**Acceptance Criteria:**
- [ ] Terminal list with last_seen timestamp
- [ ] Online/offline status badge per terminal
- [ ] Sync queue depth per terminal
- [ ] Pending event count
- [ ] WebSocket connection status
- [ ] Server resource usage (CPU, RAM, disk)
- [ ] Alert for terminals offline > 5 minutes
- [ ] Export health snapshot to CSV

**Priority:** P1 | **Effort:** 3 days

#### US-8.11: Audit Log
**As a** Hub Manager, **I want** to view an immutable audit trail, **so that** I can investigate suspicious activity.

**Acceptance Criteria:**
- [ ] Immutable timeline (append-only)
- [ ] Events: voids, discounts, config changes, user logins, menu publishes
- [ ] Filter by: event type, user, venue, date range
- [ ] Search by keyword
- [ ] Export to CSV
- [ ] DB role permissions prevent deletion (even by server admins)
- [ ] 5-year retention minimum

**Priority:** P1 | **Effort:** 3 days

---

### Epic 9: Kiosk/Lockdown Mode

#### US-9.1: POS Kiosk Mode
**As an** IT Admin, **I want** the POS to run in kiosk mode, **so that** staff cannot access other applications.

**Acceptance Criteria:**
- [ ] Electron launches in --kiosk mode (fullscreen, no browser chrome)
- [ ] No right-click context menu
- [ ] No DevTools access (F12, Ctrl+Shift+I blocked)
- [ ] No window close button (Alt+F4 blocked)
- [ ] Windows shell replacement or Group Policy
- [ ] No access to Explorer, Task Manager, or other executables
- [ ] Auto-login to restricted OS user on boot
- [ ] POS launches directly on boot

**Priority:** P0 | **Effort:** 4 days

#### US-9.2: Watchdog Service
**As an** IT Admin, **I want** a watchdog to monitor the POS process, **so that** it restarts if it crashes.

**Acceptance Criteria:**
- [ ] Node.js Windows Service or systemd unit
- [ ] Monitors POS process every 5 seconds
- [ ] Auto-relaunches POS if process not found
- [ ] Logs watchdog events to local file
- [ ] Alert if restart count exceeds 3 in 10 minutes
- [ ] Watchdog starts automatically on boot
- [ ] No user interaction required for recovery

**Priority:** P1 | **Effort:** 3 days

#### US-9.3: Hardware Security
**As an** IT Admin, **I want** hardware-level security, **so that** the system cannot be bypassed.

**Acceptance Criteria:**
- [ ] BIOS password set
- [ ] Boot order locked (no USB/CD boot)
- [ ] USB autorun disabled
- [ ] External storage blocked via Group Policy/udev rules
- [ ] Network firewall: POS machine only reaches server IP:443
- [ ] No outbound HTTP to other hosts
- [ ] DHCP reservations for printers and KDS screens

**Priority:** P1 | **Effort:** 2 days

---

### Epic 10: Printing & Receipts

#### US-10.1: Receipt Printing
**As a** Cashier, **I want** to print customer receipts, **so that** customers have a record of purchase.

**Acceptance Criteria:**
- [ ] ESC/POS protocol via USB or network printer
- [ ] Receipt includes: venue name, logo, items, modifiers, prices, tax, total, payment method, transaction ID
- [ ] Configurable receipt template per venue
- [ ] Kitchen copy printed automatically (optional)
- [ ] Manager report template configurable
- [ ] Print triggered automatically on payment completion
- [ ] Reprint available from order explorer

**Priority:** P0 | **Effort:** 3 days

#### US-10.2: Digital Receipts
**As a** Cashier, **I want** to send digital receipts, **so that** customers can receive receipts via email or WhatsApp.

**Acceptance Criteria:**
- [ ] PDF generation server-side (Puppeteer or PDFKit)
- [ ] Email dispatch via configured SMTP
- [ ] WhatsApp dispatch (if API available)
- [ ] Customer enters email/phone at payment time
- [ ] Receipt generated in customer's preferred language
- [ ] Feature flag: digital_receipts (default ON)
- [ ] Delivery confirmation logged

**Priority:** P2 | **Effort:** 4 days

#### US-10.3: Customer-Facing Display
**As a** Cashier, **I want** a second screen for customers, **so that** they can see their order total.

**Acceptance Criteria:**
- [ ] Optional second screen support (HDMI output)
- [ ] Displays current order items and running total
- [ ] Payment amount and change due displayed
- [ ] Thank you message after payment
- [ ] RTL support for Arabic
- [ ] No sensitive data displayed (no prices visible to other customers)

**Priority:** P2 | **Effort:** 3 days

---

### Epic 11: Bilingual Support

#### US-11.1: Language Toggle
**As a** User, **I want** to switch between Arabic and English, **so that** I can use the system in my preferred language.

**Acceptance Criteria:**
- [ ] Toggle available on every screen (POS, KDS, dashboard)
- [ ] Toggle always visible in top navigation bar
- [ ] Switch takes effect instantly (no page reload)
- [ ] Preference saved per user account
- [ ] Persists across sessions and devices
- [ ] Kitchen printer uses venue default language (not cashier preference)
- [ ] Digital receipts in customer-requested language or venue default
- [ ] Dashboard toggle independent of POS toggle

**Priority:** P0 | **Effort:** 4 days

#### US-11.2: RTL Layout
**As an** Arabic User, **I want** the UI to mirror for RTL, **so that** the layout feels natural.

**Acceptance Criteria:**
- [ ] HTML root element receives dir='rtl' when Arabic active
- [ ] Flex and grid layouts reverse automatically
- [ ] TailwindCSS configured with RTL variant support
- [ ] Logical properties (start/end) used, not physical (left/right)
- [ ] Directional icons (arrows, back buttons) mirrored via CSS transform
- [ ] Consistent RTL across Electron POS and React dashboard
- [ ] Number formatting: Arabic-Indic numerals optional (default Western)
- [ ] Currency symbol placement: right side for Arabic (e.g., 150.00 ج.م)

**Priority:** P0 | **Effort:** 5 days

#### US-11.3: Bilingual Content Management
**As a** Manager, **I want** to manage content in both languages, **so that** all users are served.

**Acceptance Criteria:**
- [ ] All user-facing content stored as bilingual pairs in DB
- [ ] Menu items: name_en, name_ar, description_en, description_ar
- [ ] Categories: name_en, name_ar
- [ ] Modifiers: name_en, name_ar, option_en, option_ar
- [ ] Venues: name_en, name_ar, address_en, address_ar
- [ ] Receipt templates: header_en, header_ar, footer_en, footer_ar
- [ ] API returns both fields; client picks based on active locale
- [ ] No additional API calls needed on language switch
- [ ] 100% string coverage in translation files (en.json, ar.json)
- [ ] ESLint i18n plugin enforces no hardcoded strings
- [ ] Date/time formatted using Intl.DateTimeFormat with active locale
- [ ] Hijri calendar optional toggle for Arabic users

**Priority:** P0 | **Effort:** 5 days

---

### Epic 12: White-Label & Multi-Client

#### US-12.1: Client Provisioning
**As an** Ops Engineer, **I want** to provision a new client deployment, **so that** they can use the system under their brand.

**Acceptance Criteria:**
- [ ] Control Plane: internal web app for ops team
- [ ] New Client wizard: cloud region, domain, logo, brand colors, feature flags
- [ ] One-click deploy via Terraform + Docker Compose
- [ ] Automated VM provisioning: 15-20 minutes
- [ ] DNS auto-configuration
- [ ] TLS certificate auto-issued (Let's Encrypt)
- [ ] Dedicated VM + DB per client (single-tenant)
- [ ] No shared database or application server between clients

**Priority:** P1 | **Effort:** 5 days

#### US-12.2: Branding Customization
**As a** Client, **I want** the system to reflect my brand, **so that** customers see my identity.

**Acceptance Criteria:**
- [ ] Logo (SVG/PNG) uploaded via Control Plane
- [ ] Logo displayed: POS header, receipt header, dashboard header, login screen
- [ ] Primary brand color (hex) applied via CSS custom properties
- [ ] Secondary/background color optional
- [ ] App name configurable per client (e.g., "City Walk POS")
- [ ] Receipt header: client name, address, tax registration number, logo
- [ ] Dashboard domain: dashboard.clientname.com or custom domain
- [ ] Email sender: client-branded address via SMTP config
- [ ] No code changes required for new client branding

**Priority:** P1 | **Effort:** 4 days

#### US-12.3: Feature Flags
**As an** Ops Engineer, **I want** to toggle features per client, **so that** I can offer tiered plans.

**Acceptance Criteria:**
- [ ] Feature flags stored in Control Plane, pushed to client server
- [ ] Flags read at boot and on demand
- [ ] POS app and dashboard show/hide features based on flags
- [ ] Available flags:
  - integrated_card_payment (default OFF)
  - reservation_module (default OFF)
  - loyalty_program (default OFF)
  - inventory_management (default ON)
  - digital_receipts (default ON)
  - kds_enabled (default ON in spec; **OFF allowed** — printer-only kitchens skip KDS app and kitchen WS UI)
  - cross_venue_billing (default ON)
  - multi_language (default ON)
- [ ] Flag changes take effect without code deployment
- [ ] Audit log of flag changes

**Priority:** P1 | **Effort:** 3 days

---

### Epic 13: Shift Management

#### US-13.1: Open Shift
**As a** Cashier, **I want** to open a shift, **so that** my session and float are tracked.

**Acceptance Criteria:**
- [ ] Cashier logs in and declares opening float amount
- [ ] Shift record created: user_id, venue_id, open_float, opened_at
- [ ] Shift active for this cashier at this terminal
- [ ] All transactions linked to active shift
- [ ] Only one active shift per cashier at a time
- [ ] Shift open event logged to audit trail

**Priority:** P0 | **Effort:** 2 days

#### US-13.2: Close Shift
**As a** Cashier, **I want** to close my shift, **so that** the day's transactions are reconciled.

**Acceptance Criteria:**
- [ ] Cashier counts cash and declares close_float
- [ ] System calculates expected cash (open_float + cash payments - cash refunds)
- [ ] Over/short amount calculated and displayed
- [ ] Shift record updated: close_float, closed_at, over_short_amount
- [ ] Shift report generated: transactions by type, total revenue, payment breakdown
- [ ] Manager approval required if over/short exceeds threshold
- [ ] Shift close event logged to audit trail
- [ ] Cashier cannot start new shift until current shift closed

**Priority:** P0 | **Effort:** 3 days

---

## 4. Non-Functional Requirements

### 4.1 Performance
| Requirement | Target | Measurement |
|-------------|--------|-------------|
| Order submission latency | < 500ms | Server round-trip under normal load |
| Menu publish propagation | < 2 seconds | To all connected terminals |
| Dashboard page load | < 2s initial, < 500ms subsequent | SPA routing |
| POS app launch | < 10 seconds | On minimum-spec hardware |
| RAM usage (POS + Agent) | < 300 MB | Combined at all times |

### 4.2 Availability
| Requirement | Target |
|-------------|--------|
| Server uptime | 99.5% monthly (< 4 hours downtime) |
| POS availability | 100% during connectivity loss (offline mode) |
| Backup RTO | < 2 hours |

### 4.3 Scalability
| Requirement | Target |
|-------------|--------|
| Concurrent terminals | Up to 50 without performance degradation |
| Orders per day | Up to 10,000 per venue |
| Clients (white-label) | Unlimited (single-tenant per client) |

### 4.4 Security
| Requirement | Implementation |
|-------------|----------------|
| TLS | 1.2+ only, self-signed certs prohibited |
| JWT | RS256 asymmetric signing, private key server-only |
| PIN storage | bcrypt hashed, never returned in API |
| Card data | No PANs stored, PCI-DSS scope on terminal |
| Backups | AES-256 encrypted before upload |
| Audit log | Append-only, DB role prevents deletion |
| Network | POS machines only reach server IP:443 |
| Rate limiting | 100 req/min per IP on API |

### 4.5 Compliance
| Requirement | Target |
|-------------|--------|
| Receipt format | Egyptian tax authority compliant |
| Audit retention | 5 years minimum |
| Data isolation | Single-tenant per client |

---

## 5. Out of Scope (Phase 1)

- Loyalty / points program
- Online ordering or delivery integration
- Accounting software integration (QuickBooks, Xero)
- Multi-location (multi-hub) management
- Mobile POS (tablets)
- Advanced inventory (supplier management, purchase orders)
- Customer CRM
- Advanced analytics (predictive, ML)

---

## 6. Glossary

| Term | Definition |
|------|------------|
| POS | Point of Sale — order taking and payment processing |
| KDS | Kitchen Display System — kitchen order screen |
| ESC/POS | Standard printer command protocol |
| JWT | JSON Web Token — stateless authentication |
| WebSocket | Full-duplex real-time communication |
| Electron | Cross-platform desktop app framework |
| SQLite | Lightweight embedded database |
| Anchor Venue | Venue authorized for cross-venue billing |
| Cross-Venue Cheque | Single bill spanning multiple venues |
| Kiosk Mode | Locked-down OS running only POS |
| Idempotent | Operation safe to replay multiple times |
| White-Label | Rebrandable product for resale |
| Single-Tenant | Dedicated server/database per client |
| Control Plane | Internal ops dashboard |
| Feature Flag | Toggle features per client |
| i18n | Internationalization |
| RTL | Right-to-Left layout |

---

*End of PRD — Version 1.0*
*Confidential — Intended for named recipients only*
