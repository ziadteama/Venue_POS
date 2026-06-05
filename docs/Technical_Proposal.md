**UNIFIED HUB POS & MANAGEMENT SYSTEM**

_Technical Proposal & Architecture Document_

| **Prepared For**   | Hub Management & Stakeholders            |
| ------------------ | ---------------------------------------- |
| **Document Type**  | Technical Proposal & System Architecture |
| ---                | ---                                      |
| **Version**        | 1.0 - Initial Release                    |
| ---                | ---                                      |
| **Date**           | 5 June 2026                              |
| ---                | ---                                      |
| **Classification** | Confidential                             |
| ---                | ---                                      |

# **1\. Executive Summary**

This document presents the complete technical proposal for a Unified Hub Point-of-Sale and Management System, designed for a multi-venue food & beverage hub opening imminently. The hub consists of multiple restaurants and a cafe, each operating as an independent business while sharing infrastructure, management oversight, and - where configured - billing capabilities.

The proposed system is purpose-built around three core pillars:

- Unified Operations - A single hosted server drives all venue POS terminals and the admin dashboard, keeping all data consistent and real-time.
- Granular Control - A manager-controlled menu and billing configuration layer lets administrators preset menus, define which venues can cross-bill, and audit everything from a central web dashboard.
- Resilience - A local-first architecture with a cloud sync buffer ensures operations never stop during an internet outage; all transactions are captured locally and pushed when connectivity is restored.

**Key Constraints Addressed**

• Kiosk/locked-down OS mode: restaurant computers run only the POS application - no access to desktop, browser, or other software.

• Cross-venue billing: the cafe (or any designated venue) can produce a combined cheque spanning multiple restaurants; this is configurable per venue pair.

• Menu governance: menus are defined centrally by managers and pushed to venues - staff cannot modify pricing or items.

• Offline resilience: transactions buffer locally and sync automatically when connectivity is restored.

• Real-time dashboard: revenue, order flow, and inventory update live on the admin web dashboard.

# **2\. Project Scope & Stakeholder Map**

## **2.1 Stakeholder Roles**

| **Role**            | **Responsibilities & Access**                                                                                                     |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Hub Manager / Admin | Full access to admin web dashboard. Sets menus, prices, venue configurations, cross-billing rules. Views all revenue & analytics. |
| ---                 | ---                                                                                                                               |
| Venue Manager       | Scoped dashboard view for their own venue. Can view their sales, request menu changes (pending approval).                         |
| ---                 | ---                                                                                                                               |
| Cashier / Waiter    | POS terminal only. Takes orders, issues cheques, handles payment. Cannot modify prices, menus, or system settings.                |
| ---                 | ---                                                                                                                               |
| Kitchen Staff       | Kitchen Display System (KDS) view only - incoming orders, status updates. No billing access.                                      |
| ---                 | ---                                                                                                                               |
| System Admin (IT)   | Server, deployment, backup, and network management. No business data access beyond logs.                                          |
| ---                 | ---                                                                                                                               |

## **2.2 Venue Types & Billing Behaviour**

The system supports two logical venue types, configurable per venue:

| **Venue Type**          | **Billing Behaviour**                                                                                                                                                                   |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Standard Restaurant     | Issues cheques only for items ordered at that venue. Cannot merge with other venues.                                                                                                    |
| ---                     | ---                                                                                                                                                                                     |
| Hub Anchor (e.g., Cafe) | Configurable to merge cheques from any subset of venues. Per-venue inclusion can be toggled by managers. Example: Cafe can bill for Restaurant A and Restaurant B but not Restaurant C. |
| ---                     | ---                                                                                                                                                                                     |

## **2.3 In-Scope Features**

### **POS Terminal Application (Desktop - Kiosk Mode)**

- Order entry with table/seat assignment
- Menu display driven by manager-defined menus (read-only for staff)
- Modifier support (e.g., no onions, extra sauce, size variants)
- Split billing - by item, by seat, or by custom amount
- Cross-venue cheque aggregation (where enabled)
- Payment processing - cash, card, voucher, split payment
- Receipt printing and digital receipt dispatch
- Order routing to kitchen printer or KDS
- Offline mode with sync queue
- Shift open/close and cashier session management
- Void, refund, and discount workflows (with role-based approval)
- Customer-facing display (optional second screen)

### **Kitchen Display System (KDS)**

- Real-time order ticket display by station (grill, cold, bar, etc.)
- Ticket status: New → In Progress → Ready → Served
- Bump-bar or touchscreen interaction
- Order age indicator and SLA alerts

### **Admin Web Dashboard**

- Live sales feed - orders placed, revenue by venue, revenue by item
- Revenue analytics - daily, weekly, monthly, custom range; by venue, by category, by item
- Menu management - create/edit/archive items, categories, modifiers; publish to venues
- Cross-billing configuration - per-venue include/exclude rules for hub cheques
- User & role management - create staff accounts, assign PIN or card credentials
- Inventory tracking - stock level alerts, consumption reports
- Shift reports and end-of-day reconciliation
- System health panel - terminal connectivity, sync status, offline event log

### **Out of Scope (Phase 1)**

- Loyalty / points program
- Online ordering or delivery integration
- Accounting software integration (QuickBooks, Xero)
- Multi-location (multi-hub) management

# **3\. System Architecture**

## **3.1 Architecture Overview**

The system follows a Hub-and-Spoke architecture with a centrally hosted backend server, local terminal agents at each venue, and a browser-based admin dashboard. All communication uses secure HTTPS/WSS (WebSocket Secure).

**Architectural Layers**

Layer 1 - Hosted Cloud Server: Central API, database, auth service, real-time event bus, file/menu storage.

Layer 2 - Local Terminal Agent (per venue): Lightweight background service on each POS computer. Maintains a local SQLite database, queues offline transactions, handles kiosk lockdown, bridges to printers.

Layer 3 - POS Application (Electron): Fullscreen kiosk-mode desktop app, communicates with local agent. Renders order UI, handles payment, prints receipts.

Layer 4 - KDS Application (Electron or Browser): Order display app on kitchen screens, connected via WebSocket.

Layer 5 - Admin Web Dashboard: React SPA hosted on the server, accessible from any browser with manager credentials.

## **3.2 Component Diagram (Text Representation)**

┌──────────────────────────────────────────────────────┐

│ CLOUD / HOSTED SERVER │

│ ┌──────────┐ ┌──────────┐ ┌────────┐ ┌──────────┐ │

│ │ REST API │ │WebSocket │ │Auth/ │ │ Postgres │ │

│ │ (Node) │ │ Event Bus│ │JWT Svc │ │ DB │ │

│ └──────────┘ └──────────┘ └────────┘ └──────────┘ │

└─────────────────────────┬────────────────────────────┘

│ HTTPS / WSS

┌───────────────┼────────────────┐

│ │ │

┌──────┴─────┐ ┌──────┴─────┐ ┌───┴────────┐

│ Restaurant │ │ Restaurant │ │ Cafe │

│ Local Agt │ │ Local Agt │ │ Local Agt │

│ SQLite DB │ │ SQLite DB │ │ SQLite DB │

│ POS App │ │ POS App │ │ POS App │

│ KDS App │ │ KDS App │ │ KDS App │

└────────────┘ └────────────┘ └────────────┘

┌─────────────────────────────────────────────────┐

│ Admin Web Dashboard (Browser) │

│ Any device - Manager credentials required │

└─────────────────────────────────────────────────┘

## **3.3 Technology Stack**

| **Layer**          | **Technology**                    | **Rationale**                                                          |
| ------------------ | --------------------------------- | ---------------------------------------------------------------------- |
| Backend API        | Node.js + Express / Fastify       | High I/O throughput, large ecosystem, WebSocket native support         |
| ---                | ---                               | ---                                                                    |
| Real-Time Events   | Socket.IO (WebSocket + fallback)  | Bi-directional, auto-reconnect, room-based pub/sub                     |
| ---                | ---                               | ---                                                                    |
| Primary Database   | PostgreSQL 16                     | ACID compliant, JSONB for menu structures, strong relational integrity |
| ---                | ---                               | ---                                                                    |
| Local Cache DB     | SQLite (via better-sqlite3)       | Embedded, zero-config, synchronous reads for offline POS               |
| ---                | ---                               | ---                                                                    |
| POS / KDS App      | Electron.js                       | Cross-platform desktop, Chromium renderer, Node.js backend, kiosk mode |
| ---                | ---                               | ---                                                                    |
| Admin Dashboard    | React + Vite + TailwindCSS        | Fast SPA, component reuse, real-time chart libraries                   |
| ---                | ---                               | ---                                                                    |
| Charts & Analytics | Recharts / Chart.js               | Lightweight, SSR-compatible, real-time data binding                    |
| ---                | ---                               | ---                                                                    |
| Auth               | JWT (access) + Refresh Tokens     | Stateless, role-encoded claims, PIN-based cashier auth                 |
| ---                | ---                               | ---                                                                    |
| Offline Sync       | Custom sync queue (SQLite → REST) | Deterministic, idempotent, conflict-resolution by timestamp            |
| ---                | ---                               | ---                                                                    |
| Printer Protocol   | ESC/POS via node-escpos           | Industry standard for receipt/kitchen printers                         |
| ---                | ---                               | ---                                                                    |
| Hosting            | VPS / Cloud VM (Ubuntu 22 LTS)    | Full control, low latency, Docker-based deployment                     |
| ---                | ---                               | ---                                                                    |
| Containerization   | Docker + Docker Compose           | Reproducible environment, easy rollback, service isolation             |
| ---                | ---                               | ---                                                                    |
| Reverse Proxy      | Nginx                             | TLS termination, static asset serving, WebSocket proxy                 |
| ---                | ---                               | ---                                                                    |
| Cert Management    | Let's Encrypt / Certbot           | Automated TLS renewal                                                  |
| ---                | ---                               | ---                                                                    |

# **4\. Database Schema (Core Entities)**

## **4.1 Entity Overview**

The central PostgreSQL database holds the system of record. All POS terminals have a read replica of menus and configuration in local SQLite, synced on startup and on menu publish events.

| **Entity**                  | **Description**                                                                                  |
| --------------------------- | ------------------------------------------------------------------------------------------------ |
| venues                      | Each restaurant or cafe. Has a type (standard \| anchor), name, currency, active status.         |
| ---                         | ---                                                                                              |
| venue_billing_config        | Defines which venues an anchor venue can include in a cross-cheque. One row per allowed pairing. |
| ---                         | ---                                                                                              |
| menu_templates              | Manager-defined menus. A template belongs to a set of venues. Has a published_at timestamp.      |
| ---                         | ---                                                                                              |
| categories                  | Item categories (Starters, Mains, Drinks). Belong to a menu_template.                            |
| ---                         | ---                                                                                              |
| menu_items                  | Individual items. Belong to a category. Price, description, image_url, tax_rate, is_available.   |
| ---                         | ---                                                                                              |
| modifiers / modifier_groups | Options attached to items (size, extras, remove ingredients). min/max selection rules.           |
| ---                         | ---                                                                                              |
| orders                      | A table's order session. venue_id, table_id, status, opened_at, closed_at, cashier_id.           |
| ---                         | ---                                                                                              |
| order_items                 | Line items in an order. order_id, menu_item_id, quantity, unit_price, modifiers_snapshot.        |
| ---                         | ---                                                                                              |
| cheques                     | A billing unit. Can span multiple orders (cross-venue). status: open \| paid \| voided.          |
| ---                         | ---                                                                                              |
| cheque_orders               | Join table linking a cheque to one or more orders (cross-venue scenario).                        |
| ---                         | ---                                                                                              |
| payments                    | Payment records. cheque_id, method (cash/card/voucher), amount, processed_at.                    |
| ---                         | ---                                                                                              |
| users                       | All staff. role, venue_id (nullable for managers), PIN hash, card_uid.                           |
| ---                         | ---                                                                                              |
| shifts                      | Cashier sessions. user_id, venue_id, open_float, close_float, opened_at, closed_at.              |
| ---                         | ---                                                                                              |
| sync_log                    | Per-terminal record of offline events. terminal_id, event_type, payload_json, synced_at.         |
| ---                         | ---                                                                                              |
| audit_log                   | Immutable audit trail of sensitive actions: voids, discounts, config changes.                    |
| ---                         | ---                                                                                              |

## **4.2 Cross-Venue Billing Configuration**

The venue_billing_config table drives the cross-venue cheque feature. An admin can enable or disable any combination via the dashboard:

**Example: Cafe Billing Configuration**

Cafe (anchor) → Restaurant A: ENABLED

Cafe (anchor) → Restaurant B: ENABLED

Cafe (anchor) → Restaurant C: DISABLED

Effect: A cashier at the Cafe can open a cheque, add items from Restaurant A and B to it,

and bill the customer in one transaction. Restaurant C items are not available for cross-billing.

Standard restaurants only see their own orders and cannot initiate cross-venue cheques.

# **5\. Core Feature Specifications**

## **5.1 Menu Management & Publishing**

Menus are governed entirely by managers. Staff at any venue cannot create, edit, or delete menu items.

- Manager creates or edits a menu template in the Admin Dashboard.
- Manager assigns the template to one or more venues.
- Manager publishes the menu. The server stamps a published_at timestamp and broadcasts a menu_update event over WebSocket to all connected terminals for affected venues.
- Each terminal receives the update, validates it, and writes the new menu to its local SQLite cache. The POS UI refreshes on the next order screen load.
- If a terminal is offline at publish time, it pulls the latest menu on next sync. A version_hash comparison detects stale menus.

## **5.2 Order Lifecycle**

| **Status**      | **Description**                                             |
| --------------- | ----------------------------------------------------------- |
| draft           | Order created, items being added. Not yet sent to kitchen.  |
| ---             | ---                                                         |
| sent            | Order transmitted to kitchen (KDS / printer). Items locked. |
| ---             | ---                                                         |
| partially_ready | Some items marked ready by kitchen.                         |
| ---             | ---                                                         |
| ready           | All items ready for service.                                |
| ---             | ---                                                         |
| served          | Waiter has confirmed delivery to table.                     |
| ---             | ---                                                         |
| billed          | A cheque has been issued for this order.                    |
| ---             | ---                                                         |
| closed          | Payment received and reconciled.                            |
| ---             | ---                                                         |
| voided          | Order cancelled (with reason and approver logged).          |
| ---             | ---                                                         |

## **5.3 Cross-Venue Cheque Workflow**

- Cashier at the anchor venue (Cafe) selects 'New Cheque' and chooses 'Cross-Venue'.
- The POS app queries the server for the list of venues this anchor is permitted to include (from venue_billing_config).
- Cashier selects which venues to pull from. The POS fetches open, unbilled orders from those venues.
- Cashier selects specific orders or items to include. The cheque is assembled.
- Server creates the cheque record and links it to all included orders via cheque_orders. Linked orders are locked from being billed elsewhere.
- Payment is processed at the anchor venue's terminal.
- All linked venues receive a real-time notification: 'Order #X billed via \[Cafe\]. Amount: EGP YYY.' Their KDS/POS reflects the closed status.

## **5.4 Kiosk / Locked-Down Mode**

Each restaurant computer runs only the POS application. The following measures prevent use of any other application:

- Electron app launches in --kiosk mode: fullscreen, no browser chrome, no right-click, no DevTools.
- Windows Group Policy or a custom shell replacement (e.g., the app registered as the Windows shell) prevents access to Explorer, Task Manager, or any other executable.
- A watchdog service (Node.js Windows Service) monitors the POS process and relaunches it if it crashes or is forcibly closed.
- USB autorun disabled. External storage devices blocked via Group Policy / udev rules (Linux) or device manager restrictions (Windows).
- Network access restricted by firewall rules on the local router - the POS machine can only reach the hub server IP and designated payment gateway. No public internet browsing.
- Auto-login to a restricted OS user account on boot, launching directly into the POS kiosk.
- BIOS password set and boot order locked to prevent live-USB booting.

## **5.5 Payment Processing**

| **Payment Method** | **Handling**                                                                                              |
| ------------------ | --------------------------------------------------------------------------------------------------------- |
| Cash               | Cashier enters amount tendered. System calculates change. Shift float tracked.                            |
| ---                | ---                                                                                                       |
| Card (Integrated)  | Payment terminal (e.g., Ingenico, PAX) connected via SDK or serial. Transaction ID stored against cheque. |
| ---                | ---                                                                                                       |
| Card (Manual)      | Cashier marks as 'card' and enters last-4 digits. For venues without integrated PDQ.                      |
| ---                | ---                                                                                                       |
| Split Payment      | Multiple payment rows on one cheque. Sum must equal cheque total.                                         |
| ---                | ---                                                                                                       |
| Voucher / Promo    | Voucher code validated server-side. Discount applied before payment.                                      |
| ---                | ---                                                                                                       |
| Refund             | Manager-approval required. Linked to original cheque. Audit-logged.                                       |
| ---                | ---                                                                                                       |

## **5.6 Printing**

- Receipt Printer: Connected to each POS terminal via USB or network (ESC/POS protocol). Customer receipt, kitchen copy, and manager report templates configurable per venue.
- Kitchen Printer: Dedicated printer in kitchen area. Order tickets auto-print on order send. Items grouped by station (configurable).
- KDS (Kitchen Display System): Optional replacement or supplement for kitchen printer. Touchscreen panel running a lightweight Electron or browser app, showing live order tickets.
- PDF Receipts: Server-side PDF generation (via Puppeteer or PDFKit) for digital receipts dispatched by email or WhatsApp.

# **6\. Offline Resilience & Sync Strategy**

## **6.1 Design Philosophy**

The POS application must function fully during internet or server outages. The Local Terminal Agent maintains a local SQLite database that mirrors the minimum required state for uninterrupted operations.

## **6.2 What Is Cached Locally**

| **Data**            | **Cache Behaviour**                                                   |
| ------------------- | --------------------------------------------------------------------- |
| Published menus     | Full copy. Refreshed on every successful sync or menu_update event.   |
| ---                 | ---                                                                   |
| Venue configuration | Including cross-billing rules and tax settings.                       |
| ---                 | ---                                                                   |
| User credentials    | Salted PIN hashes for cashier login. No manager-level auth offline.   |
| ---                 | ---                                                                   |
| Open orders         | Written locally first, synced to server immediately if online.        |
| ---                 | ---                                                                   |
| Pending payments    | Queued if offline. Processed on reconnect.                            |
| ---                 | ---                                                                   |
| Sync queue          | A FIFO queue of all write operations that failed to reach the server. |
| ---                 | ---                                                                   |

## **6.3 Sync Queue Mechanism**

- Every write operation (new order, new item, payment, void) is written to local SQLite first, then enqueued in the sync_queue table with a UUID, timestamp, and JSON payload.
- A background sync worker polls the server every 5 seconds. On success, it drains the queue in order, posting each event to the server API.
- If a queue item fails repeatedly (network error, validation error), it is flagged but not dropped. An operator notification appears on-screen.
- The server's sync endpoint is idempotent - it uses the client-generated UUID to deduplicate. Replaying an event that already arrived is a no-op.
- On reconnect, the terminal announces itself with a last_sync_at timestamp. The server responds with any configuration or menu changes that occurred while the terminal was offline.

**Conflict Resolution Policy**

• Price conflicts: server price always wins. If a local menu has different prices than the server (stale cache), the server-side cheque total is authoritative.

• Order conflicts: orders have a terminal_id. Only the originating terminal can modify an order. Conflicts from cross-venue billing are mediated by server lock acquisition.

• Duplicate payment: if a payment event arrives twice (UUID match), the second is discarded silently.

• Void conflicts: a void on an already-paid cheque is rejected by the server and flagged for manager review.

## **6.4 Offline Duration Limits**

- Menus: functional indefinitely offline (using cached version).
- Orders & payments: functional indefinitely. All data is queued.
- Cross-venue cheques: disabled when offline (server coordination required). Cashier is informed with a clear UI message.
- Admin dashboard: read-only mode using last-known data if server is down. Write operations are blocked.

# **7\. Real-Time Communication**

## **7.1 WebSocket Event Architecture**

The server maintains a Socket.IO event bus. Clients (POS terminals, KDS, admin dashboard) subscribe to rooms based on their venue. The server emits targeted or broadcast events.

| **Event**              | **Description & Recipients**                                                                                       |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------ |
| menu:updated           | Emitted when manager publishes a menu. Received by all terminals of affected venues. Triggers local cache refresh. |
| ---                    | ---                                                                                                                |
| order:created          | Emitted when an order is submitted. Received by KDS of same venue. Triggers ticket display.                        |
| ---                    | ---                                                                                                                |
| order:item_status      | Emitted by KDS when an item status changes (in_progress, ready). Received by POS terminal of same venue.           |
| ---                    | ---                                                                                                                |
| order:voided           | Emitted on void. Received by KDS (removes ticket) and all POS terminals of the venue.                              |
| ---                    | ---                                                                                                                |
| cheque:cross_billed    | Emitted when a cross-venue cheque is paid. Received by all linked venue terminals. Closes linked orders.           |
| ---                    | ---                                                                                                                |
| cheque:lock_acquired   | Server emits to affected venues when an anchor starts assembling a cross-venue cheque. Prevents double-billing.    |
| ---                    | ---                                                                                                                |
| terminal:heartbeat     | Each terminal emits every 30s. Server tracks last_seen for system health panel.                                    |
| ---                    | ---                                                                                                                |
| dashboard:metrics_tick | Server emits aggregated metrics every 60s to admin dashboard subscribers. Powers live revenue counters.            |
| ---                    | ---                                                                                                                |
| venue:config_updated   | Emitted when an admin changes venue settings or billing rules. All affected terminals reload config.               |
| ---                    | ---                                                                                                                |
| alert:stock_low        | Emitted when an item is manually flagged as low stock. Received by POS of that venue.                              |
| ---                    | ---                                                                                                                |

## **7.2 Reconnection Strategy**

- Socket.IO client configured with exponential back-off reconnection: 1s, 2s, 4s, 8s, up to 30s max interval.
- On reconnect, client sends a reconnect_ack with last_event_id. Server replays any missed events since that ID.
- POS UI shows a persistent 'Offline - working locally' banner when WebSocket is disconnected. Banner auto-dismisses on reconnection.

# **8\. Admin Web Dashboard**

## **8.1 Dashboard Modules**

| **Module**        | **Features**                                                                                                                |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Live Overview     | Real-time sales counter, active orders by venue, order-per-minute rate, current open tables heat map.                       |
| ---               | ---                                                                                                                         |
| Revenue Analytics | Revenue by venue, by category, by item. Period comparison (today vs yesterday, this week vs last). Export to CSV/Excel.     |
| ---               | ---                                                                                                                         |
| Order Explorer    | Search, filter, and view any order. Drill down to line items, modifiers, payment method, cashier. Reprint any receipt.      |
| ---               | ---                                                                                                                         |
| Menu Manager      | Create/edit menu templates. Drag-and-drop category ordering. Item availability toggle (86 an item). Publish with one click. |
| ---               | ---                                                                                                                         |
| Venue Config      | Set venue name, type (standard/anchor), tax settings, receipt template, printer IP, table layout.                           |
| ---               | ---                                                                                                                         |
| Billing Rules     | Cross-venue billing matrix. Toggle allowed pairs. Changes take effect immediately and propagate via WebSocket.              |
| ---               | ---                                                                                                                         |
| User Management   | Add/edit/deactivate staff. Assign venue, role, PIN. View shift history.                                                     |
| ---               | ---                                                                                                                         |
| Inventory         | Set par levels, log deliveries, view consumption reports. Low-stock alert thresholds.                                       |
| ---               | ---                                                                                                                         |
| Shift & Cash Mgmt | View open shifts, float declared vs actual, over/short report. Force-close a shift if needed.                               |
| ---               | ---                                                                                                                         |
| System Health     | Terminal list with last_seen timestamp, online/offline badge, sync queue depth, pending event count.                        |
| ---               | ---                                                                                                                         |
| Audit Log         | Immutable timeline of sensitive actions: voids, discounts, config changes, user logins.                                     |
| ---               | ---                                                                                                                         |

## **8.2 Access & Security**

- Dashboard served over HTTPS only. HTTP redirects to HTTPS.
- Two-factor authentication available for manager accounts (TOTP).
- Role-based access: Hub Manager sees all venues. Venue Manager sees only their venue's data.
- Session timeout: 8 hours of inactivity forces re-login.
- All API endpoints require a valid JWT bearing the correct role claim.

# **9\. Security Architecture**

## **9.1 Authentication & Authorization**

| **Mechanism** | **Detail**                                                                                                                                    |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Manager Auth  | Username + password (bcrypt hashed). JWT issued on login. Refresh token in HTTP-only cookie.                                                  |
| ---           | ---                                                                                                                                           |
| Cashier Auth  | 4-6 digit PIN, hashed with bcrypt. Card/RFID UID alternative. JWT issued for terminal session.                                                |
| ---           | ---                                                                                                                                           |
| Terminal Auth | Each terminal registers with a unique terminal_id and a pre-shared secret (configured during onboarding). Server validates on every API call. |
| ---           | ---                                                                                                                                           |
| JWT Claims    | user_id, role, venue_id, terminal_id, iat, exp. Signed with RS256 (asymmetric) - private key on server only.                                  |
| ---           | ---                                                                                                                                           |
| Token Refresh | Access token: 15-minute expiry. Refresh token: 30-day expiry, stored in DB, revocable.                                                        |
| ---           | ---                                                                                                                                           |

## **9.2 Network Security**

- All traffic over TLS 1.2+. Self-signed certificates are not permitted in production.
- Firewall rules: POS machines can only reach server IP (ports 443, WSS). No outbound HTTP to other hosts.
- Server firewall (UFW/iptables): only ports 80, 443 open. SSH restricted to a management IP whitelist.
- Nginx rate limiting: 100 req/min per IP on API endpoints to prevent brute-force.
- CORS policy: admin dashboard origin whitelisted. POS terminals use JWT, not cookies, so no CORS risk.

## **9.3 Data Security**

- No card PANs (Primary Account Numbers) stored. Integrated payment terminals handle PCI-DSS scope.
- Sensitive fields (PINs, API keys) never returned in API responses.
- Database backups encrypted with AES-256 before upload to remote storage.
- Audit log is append-only. Even server admins cannot delete rows (enforced by DB role permissions).

# **10\. Deployment & Infrastructure**

## **10.1 Server Setup**

| **Component**           | **Specification**                                                                                    |
| ----------------------- | ---------------------------------------------------------------------------------------------------- |
| VPS / VM                | Minimum: 4 vCPU, 8 GB RAM, 100 GB SSD. Ubuntu 22.04 LTS.                                             |
| ---                     | ---                                                                                                  |
| Docker Compose services | nginx, node-api, postgres, redis (session cache), pgbackup                                           |
| ---                     | ---                                                                                                  |
| Domain & DNS            | Hub domain with wildcard TLS cert. dashboard.hub.local / api.hub.local                               |
| ---                     | ---                                                                                                  |
| Backup                  | Automated daily pg_dump + WAL archiving. Uploaded to S3-compatible object storage. 30-day retention. |
| ---                     | ---                                                                                                  |
| Monitoring              | Uptime Kuma for endpoint health. Grafana + Loki for logs (optional). Alerts via email/Telegram.      |
| ---                     | ---                                                                                                  |

## **10.2 Terminal Setup (Per Venue Computer)**

- Install Windows 10/11 LTSC or Ubuntu Desktop LTS.
- Create a restricted OS user (no admin rights, no desktop shortcuts except POS).
- Install Electron POS application and Local Terminal Agent as a system service.
- Register terminal with server: generate terminal_id, configure server endpoint URL, store pre-shared secret.
- Configure receipt and kitchen printers (IP or USB).
- Apply kiosk lockdown: Group Policy (Windows) or custom .xinitrc (Linux).
- Set BIOS password and lock boot order.
- Test full flow: order, payment, KDS, receipt, offline mode, reconnect.

## **10.3 CI / CD Pipeline**

- GitHub repository with branch protection on main.
- GitHub Actions: lint → test → build Docker image → push to container registry.
- Production deploy: SSH into server, pull new image, docker compose up -d --no-deps api. Zero-downtime rolling restart via Nginx upstream health checks.
- Terminal app updates: auto-update via Electron's built-in updater (electron-updater). Server hosts delta updates. Terminal prompts operator before applying; update applies on next shift close.

# **11\. Non-Functional Requirements**

| **Category**    | **Requirement**          | **Target / Mechanism**                                                                 |
| --------------- | ------------------------ | -------------------------------------------------------------------------------------- |
| Performance     | Order submission latency | < 500 ms server round-trip under normal load                                           |
| ---             | ---                      | ---                                                                                    |
| Performance     | Menu publish propagation | < 2 seconds to all connected terminals                                                 |
| ---             | ---                      | ---                                                                                    |
| Performance     | Dashboard page load      | < 2 seconds initial, < 500 ms subsequent (SPA routing)                                 |
| ---             | ---                      | ---                                                                                    |
| Availability    | Server uptime            | 99.5% monthly (< 4 hours downtime/month)                                               |
| ---             | ---                      | ---                                                                                    |
| Availability    | POS availability         | 100% during connectivity loss (offline mode)                                           |
| ---             | ---                      | ---                                                                                    |
| Scalability     | Concurrent terminals     | Up to 50 terminals without performance degradation on minimum server spec              |
| ---             | ---                      | ---                                                                                    |
| Scalability     | Orders per day           | Up to 10,000 orders/day per venue (well within PostgreSQL capacity)                    |
| ---             | ---                      | ---                                                                                    |
| Reliability     | Sync queue durability    | No transaction loss. Queue survives terminal power loss (SQLite WAL mode).             |
| ---             | ---                      | ---                                                                                    |
| Usability       | Cashier training time    | < 2 hours to proficiency for basic order + payment flow                                |
| ---             | ---                      | ---                                                                                    |
| Usability       | UI language              | Arabic + English. RTL layout supported in Electron/React.                              |
| ---             | ---                      | ---                                                                                    |
| Maintainability | Deployment time          | New release deployable in < 10 minutes with zero order loss.                           |
| ---             | ---                      | ---                                                                                    |
| Compliance      | Receipt format           | Tax invoice format compliant with Egyptian tax authority requirements (if applicable). |
| ---             | ---                      | ---                                                                                    |
| Audit           | Log retention            | Audit and transaction logs retained for minimum 5 years.                               |
| ---             | ---                      | ---                                                                                    |

# **12\. Implementation Plan**

## **12.1 Phased Delivery**

| **Phase**                                         | **Scope & Deliverables**                                                                                         |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Phase 0 - Setup (Week 1)                          | Server provisioning, Docker setup, Postgres schema, CI/CD pipeline, dev environment.                             |
| ---                                               | ---                                                                                                              |
| Phase 1 - Core POS (Weeks 2-4)                    | POS Electron app: order entry, menu display, send to kitchen, basic receipt printing. Single-venue, online only. |
| ---                                               | ---                                                                                                              |
| Phase 2 - Kitchen & Display (Week 5)              | KDS application, kitchen printer integration, order status lifecycle.                                            |
| ---                                               | ---                                                                                                              |
| Phase 3 - Payments (Week 6)                       | Cash payment, split payment, card (manual). Shift open/close. Basic receipt PDF.                                 |
| ---                                               | ---                                                                                                              |
| Phase 4 - Multi-Venue & Cross-Billing (Weeks 7-8) | Multi-venue support, venue_billing_config, cross-venue cheque workflow, real-time venue notifications.           |
| ---                                               | ---                                                                                                              |
| Phase 5 - Admin Dashboard (Weeks 9-10)            | Full dashboard: analytics, menu manager, venue config, billing rules, user management.                           |
| ---                                               | ---                                                                                                              |
| Phase 6 - Offline & Sync (Weeks 11-12)            | Local SQLite agent, sync queue, conflict resolution, offline UI indicators.                                      |
| ---                                               | ---                                                                                                              |
| Phase 7 - Kiosk Lockdown (Week 13)                | Kiosk mode, watchdog service, Group Policy scripts, BIOS guidance.                                               |
| ---                                               | ---                                                                                                              |
| Phase 8 - Testing & Hardening (Weeks 14-15)       | Load testing, penetration testing basics, end-to-end UAT with client.                                            |
| ---                                               | ---                                                                                                              |
| Phase 9 - Go-Live (Week 16)                       | Production deployment, terminal installation at each venue, staff training, hypercare support.                   |
| ---                                               | ---                                                                                                              |

## **12.2 Team Requirements**

| **Role**                | **Responsibility**                                                      |
| ----------------------- | ----------------------------------------------------------------------- |
| Backend Engineer (x1)   | Node.js API, PostgreSQL schema, WebSocket server, sync logic, auth.     |
| ---                     | ---                                                                     |
| Frontend Engineer (x1)  | Electron POS app, KDS app, React admin dashboard.                       |
| ---                     | ---                                                                     |
| DevOps / IT (x1)        | Server setup, Docker, CI/CD, terminal OS configuration, kiosk lockdown. |
| ---                     | ---                                                                     |
| Project Manager (x1)    | Timeline, client communication, UAT coordination.                       |
| ---                     | ---                                                                     |
| QA Engineer (part-time) | Test plans, regression suite, load testing.                             |
| ---                     | ---                                                                     |

# **13\. Risks & Mitigations**

| **Risk**                                 | **Likelihood** | **Mitigation**                                                                                   |
| ---------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------ |
| Internet outage during peak service      | Medium         | Full offline mode. Local sync queue. No business interruption.                                   |
| ---                                      | ---            | ---                                                                                              |
| Terminal hardware failure                | Low-Medium     | Spare terminal per venue. Fast re-registration process (< 15 min).                               |
| ---                                      | ---            | ---                                                                                              |
| Printer connectivity loss                | Medium         | Fallback to PDF receipt on screen. Kitchen can continue from KDS.                                |
| ---                                      | ---            | ---                                                                                              |
| Unauthorized software bypass attempt     | Low            | Kiosk mode + watchdog + network firewall. BIOS locked. Audit log captures anomalies.             |
| ---                                      | ---            | ---                                                                                              |
| Database corruption (server)             | Very Low       | Daily backups + WAL archiving. Point-in-time recovery. RTO < 2 hours.                            |
| ---                                      | ---            | ---                                                                                              |
| Cross-venue billing deadlock             | Low            | Server-side lock with 30-second timeout. Stale locks auto-released.                              |
| ---                                      | ---            | ---                                                                                              |
| Menu version mismatch (offline terminal) | Low            | Version hash check on reconnect. Mandatory menu sync before accepting new orders post-reconnect. |
| ---                                      | ---            | ---                                                                                              |
| Staff PIN sharing or theft               | Medium         | PIN change enforcement (90-day policy). RFID card option. Audit log per cashier.                 |
| ---                                      | ---            | ---                                                                                              |

# **14\. Device Performance & Terminal Setup Requirements**

## **14.1 Lightweight Application Design**

Given that venue computers may be low-to-mid spec machines - common in F&B environments - the entire terminal software stack is designed to be as lightweight as possible. This is a hard constraint that shapes technology choices and architectural decisions throughout the system.

**Core Lightweight Principles**

• The POS app must launch in under 10 seconds on minimum-spec hardware.

• RAM usage of the POS app + Local Agent must stay under 300 MB combined at all times.

• No background processes beyond the Local Agent watchdog. Nothing else runs on the machine.

• All heavy computation (analytics, report generation, PDF rendering) happens on the server, never on the terminal.

• Menu and config data is cached locally so startup does not require a server round-trip.

• UI is intentionally simple: large touch-friendly buttons, no animations, no heavy graphics.

## **14.2 Why Electron - and How We Keep It Light**

Electron bundles a Chromium renderer, which can be heavy if misused. The following constraints are enforced during development to keep the POS app lean:

- Only one BrowserWindow is used - the main POS screen. No hidden windows, no preload windows.
- Node integration is limited to the Local Agent process. The renderer uses IPC (inter-process communication) to request data, not direct DB access.
- No heavy npm packages in the renderer. No moment.js, no lodash, no full icon libraries - only what is strictly needed.
- Images (menu item photos) are served from the server and lazy-loaded. They are not bundled into the app.
- Auto-updater delivers delta updates only - not a full re-download of the app on every release.
- Electron builder produces a compressed installer under 120 MB (NSIS on Windows, AppImage on Linux).

## **14.3 Minimum Hardware Specification**

The following are the minimum specs required to run the POS terminal software. Machines at or above this spec will run the system smoothly.

| **Component**      | **Minimum Requirement**                                                                      |
| ------------------ | -------------------------------------------------------------------------------------------- |
| CPU                | Intel Core i3 (6th gen or later) or AMD equivalent - dual core, 1.6 GHz+                     |
| ---                | ---                                                                                          |
| RAM                | 4 GB DDR3 or better                                                                          |
| ---                | ---                                                                                          |
| Storage            | 64 GB SSD (HDD not recommended - slow boot degrades experience)                              |
| ---                | ---                                                                                          |
| OS                 | Windows 10 LTSC / Windows 11 or Ubuntu 22.04 LTS                                             |
| ---                | ---                                                                                          |
| Display            | 1280 x 800 minimum. Touchscreen recommended for order entry.                                 |
| ---                | ---                                                                                          |
| Network            | Wired Ethernet strongly preferred. Wi-Fi supported but not recommended for kitchen printers. |
| ---                | ---                                                                                          |
| USB                | Minimum 2 ports (receipt printer + optional card reader or barcode scanner)                  |
| ---                | ---                                                                                          |
| Printer connection | USB or Ethernet for ESC/POS receipt and kitchen printers                                     |
| ---                | ---                                                                                          |

Recommended spec for comfortable headroom:

| **Component** | **Recommended**                         |
| ------------- | --------------------------------------- |
| CPU           | Intel Core i5 (8th gen+) or AMD Ryzen 5 |
| ---           | ---                                     |
| RAM           | 8 GB DDR4                               |
| ---           | ---                                     |
| Storage       | 128 GB SSD                              |
| ---           | ---                                     |
| Display       | 15-inch touchscreen, 1920 x 1080        |
| ---           | ---                                     |
| Network       | Gigabit Ethernet                        |
| ---           | ---                                     |

## **14.4 Easy Terminal Setup - One-Command Installer**

A core requirement is that setting up a new terminal must be fast, repeatable, and require no technical expertise from venue staff. The setup process is designed around a single installer package prepared by the IT team.

### **Setup Flow for a New Terminal**

- IT team prepares a pre-configured installer package (one time, per hub). The package contains: the POS Electron app, the Local Agent service, the terminal's pre-assigned terminal_id, and the server endpoint URL.
- On the venue computer, the IT person runs a single installer file. No manual configuration steps beyond this.
- The installer automatically: installs the app, installs the Local Agent as a Windows Service or systemd unit, sets the app to auto-launch on boot, applies the kiosk shell replacement, and disables unnecessary OS startup programs.
- The installer prompts for two inputs only: the venue (selected from a dropdown) and a manager PIN to authorize terminal registration.
- On first launch, the app contacts the server, registers the terminal, downloads the latest menu, and enters normal operating mode. Total time from installer run to ready: under 5 minutes.

**Replacement Terminal Procedure**

If a terminal fails and needs to be replaced:

1\. Run the same installer on the new machine.

2\. Select the same venue. The server deactivates the old terminal_id automatically.

3\. The new terminal pulls all menus and config. No data re-entry needed.

Total time to operational: under 10 minutes.

## **14.5 Network Requirements**

| **Requirement**    | **Detail**                                                                                               |
| ------------------ | -------------------------------------------------------------------------------------------------------- |
| Local network      | All terminals on the same LAN. Wired switch recommended over hub.                                        |
| ---                | ---                                                                                                      |
| Internet bandwidth | Minimum 5 Mbps upload/download per venue. Low-bandwidth mode degrades gracefully to sync-on-reconnect.   |
| ---                | ---                                                                                                      |
| Static IPs         | Printers and KDS screens should have DHCP reservations to prevent re-configuration after router reboots. |
| ---                | ---                                                                                                      |
| Firewall           | Terminals allowed outbound to server IP:443 only. Enforced at router level.                              |
| ---                | ---                                                                                                      |
| Wi-Fi (if used)    | WPA2/WPA3, dedicated SSID for POS devices, separate from guest Wi-Fi.                                    |
| ---                | ---                                                                                                      |

# **15\. White-Label Product Architecture**

## **15.1 Product Positioning**

The Unified Hub POS system is architected from the ground up as a white-label SaaS product owned and operated by the development company. It can be licensed to any food & beverage hub, mall, or multi-venue complex under the client's own brand. The underlying codebase is a single product; branding and configuration are layered on top per client.

**White-Label Model Summary**

• One codebase - maintained and versioned by your company.

• One client = one dedicated server - fully isolated deployment, independent DB, independent domain.

• Branding per client - logo and brand colors configured at deployment time, no code changes needed.

• Feature flags - optional or custom features toggled per client without forking the codebase.

• Your control plane - a master ops dashboard lets you deploy, monitor, and update all client servers from one place.

## **15.2 Single-Tenant Architecture (Per Client)**

Each client receives a fully dedicated deployment stack. There is no shared database or shared application server between clients. This model is chosen deliberately over multi-tenancy for the following reasons:

| **Reason**                | **Detail**                                                                                                                           |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Custom features           | A client can request a feature unique to their hub. It can be built and deployed to their server without affecting any other client. |
| ---                       | ---                                                                                                                                  |
| Full data isolation       | Client data never shares a database with another client. Zero risk of cross-client data exposure.                                    |
| ---                       | ---                                                                                                                                  |
| Independent scaling       | A high-volume client can upgrade their server spec without impacting others.                                                         |
| ---                       | ---                                                                                                                                  |
| Independent update cycles | You control when each client receives a new version. A client on a custom build is not forced to take a core update.                 |
| ---                       | ---                                                                                                                                  |
| Enterprise compliance     | Many hospitality operators require their data on a dedicated server. Single-tenant satisfies this out of the box.                    |
| ---                       | ---                                                                                                                                  |
| Clear cost attribution    | Each client's infrastructure cost is directly tied to their server. Straightforward for billing.                                     |
| ---                       | ---                                                                                                                                  |

## **15.3 Deployment Architecture**

Your company operates a Control Plane - a private master dashboard used internally to manage all client deployments. Each client gets their own isolated stack on a separate VM or cloud instance.

┌─────────────────────────────────────────────────────────┐

│ YOUR CORPORATE CONTROL PLANE │

│ Provision · Monitor · Update · Billing · Feature Flags │

└──────────────────────┬──────────────────────────────────┘

│

┌───────────────┼────────────────┐

│ │ │

┌──────┴──────┐ ┌──────┴──────┐ ┌──────┴──────┐

│ CLIENT A │ │ CLIENT B │ │ CLIENT C │

│ Dedicated │ │ Dedicated │ │ Dedicated │

│ VM + DB │ │ VM + DB │ │ VM + DB │

│ hub-a.com │ │ hub-b.com │ │ hub-c.com │

└─────────────┘ └─────────────┘ └─────────────┘

## **15.4 Your Corporate Control Plane**

The Control Plane is an internal web application used exclusively by your company's ops and engineering team. It is never exposed to clients.

| **Control Plane Module** | **Capability**                                                                                                                                                               |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Client Registry          | List of all deployed clients: name, domain, server IP, plan tier, deployment version, status.                                                                                |
| ---                      | ---                                                                                                                                                                          |
| Provisioning Wizard      | Spin up a new client server: select cloud provider region, set domain, upload logo, set brand colors, choose feature flags. One-click deploy via Terraform + Docker Compose. |
| ---                      | ---                                                                                                                                                                          |
| Version Management       | See which version each client is on. Push an update to one client, a group, or all at once. Schedule updates for off-peak hours.                                             |
| ---                      | ---                                                                                                                                                                          |
| Feature Flags            | Toggle optional features per client (e.g., integrated card payment, reservation module, loyalty system) without code deployment.                                             |
| ---                      | ---                                                                                                                                                                          |
| Health Monitor           | Live status of all client servers: uptime, CPU/RAM usage, DB size, last backup timestamp, terminal heartbeat counts.                                                         |
| ---                      | ---                                                                                                                                                                          |
| Billing Tracker          | Track active venues per client, terminal count, and usage metrics for subscription billing.                                                                                  |
| ---                      | ---                                                                                                                                                                          |
| Audit & Logs             | Centralized log aggregation across all client deployments for debugging and compliance.                                                                                      |
| ---                      | ---                                                                                                                                                                          |

## **15.5 Branding & White-Label Customization**

Branding is applied at provisioning time via a configuration file. No code changes are required to white-label the product for a new client.

| **Branding Element**         | **How It Works**                                                                                                                                                            |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Client Logo                  | SVG/PNG uploaded via Control Plane. Stored in client's server file storage. Displayed in POS header, receipt header, dashboard header, and login screen.                    |
| ---                          | ---                                                                                                                                                                         |
| Primary Brand Color          | Hex color set in client config. Applied via CSS custom properties (variables) throughout the POS app and dashboard. One value cascades to buttons, accents, and highlights. |
| ---                          | ---                                                                                                                                                                         |
| Secondary / Background Color | Optional second color for backgrounds, sidebar, and nav.                                                                                                                    |
| ---                          | ---                                                                                                                                                                         |
| App Name                     | The product name shown in the POS title bar and dashboard browser tab is set per client (e.g., 'City Walk POS', 'Mall of Cairo Hub').                                       |
| ---                          | ---                                                                                                                                                                         |
| Receipt Header               | Client name, address, tax registration number, and logo on all printed and digital receipts.                                                                                |
| ---                          | ---                                                                                                                                                                         |
| Dashboard Domain             | Each client accesses their admin dashboard at their own subdomain: dashboard.clientname.com or a custom domain they own.                                                    |
| ---                          | ---                                                                                                                                                                         |
| Email Sender                 | Digital receipts and system alerts sent from a client-branded email address (configurable via SMTP settings per client).                                                    |
| ---                          | ---                                                                                                                                                                         |

**What Cannot Be Customized Per Client (Phase 1)**

• App layout and UI structure - consistent across all clients.

• Core feature set - all clients run the same base feature set (minus optional feature flags).

• Font family - system font stack used for performance; not customizable per client.

These constraints may be relaxed in a future premium tier.

## **15.6 Feature Flags System**

Optional or experimental features are controlled by a per-client feature flag configuration stored on the Control Plane. Flags are pushed to the client server at boot and on demand. The POS app and dashboard read the flag config and show or hide features accordingly.

| **Feature Flag**        | **Default** | **Description**                                               |
| ----------------------- | ----------- | ------------------------------------------------------------- |
| integrated_card_payment | OFF         | Enables integrated PDQ terminal SDK. Requires hardware setup. |
| ---                     | ---         | ---                                                           |
| reservation_module      | OFF         | Basic table reservation and blocking on floor plan.           |
| ---                     | ---         | ---                                                           |
| loyalty_program         | OFF         | Points accumulation and redemption at checkout.               |
| ---                     | ---         | ---                                                           |
| inventory_management    | ON          | Stock tracking, par levels, low-stock alerts.                 |
| ---                     | ---         | ---                                                           |
| digital_receipts        | ON          | WhatsApp / email receipt dispatch.                            |
| ---                     | ---         | ---                                                           |
| kds_enabled             | ON          | Kitchen Display System support.                               |
| ---                     | ---         | ---                                                           |
| cross_venue_billing     | ON          | Anchor venue cross-cheque feature.                            |
| ---                     | ---         | ---                                                           |
| multi_language          | ON          | Arabic / English toggle (see Section 16).                     |
| ---                     | ---         | ---                                                           |

## **15.7 Client Onboarding Process**

- Sales agreement signed. Client provides: logo file, brand colors, hub name, number of venues, number of terminals.
- Ops team opens Control Plane → New Client wizard. Enters client details, uploads branding assets, selects feature flags, chooses server region.
- Control Plane runs Terraform to provision a VM, installs Docker, deploys the client's stack (API + DB + Nginx + dashboard). Estimated time: 15-20 minutes automated.
- DNS is pointed to the new server. TLS certificate auto-issued via Let's Encrypt.
- Ops team runs the venue setup: creates venues, manager accounts, and generates terminal installer packages pre-configured for this client.
- Installer packages are handed to the client's IT person (or your field engineer). Terminal setup takes under 5 minutes per machine.
- Client manager logs into their branded dashboard, creates staff accounts, configures menus, and goes live.

Total time from signed agreement to live system: 1-2 business days for standard deployments.

# **16\. Bilingual Support - Arabic & English**

## **16.1 Language Toggle Behaviour**

The system supports Arabic and English throughout - in the POS terminal app, the KDS, and the admin web dashboard. Language is not locked to a venue or a user role; any user can switch language at any time from any screen. The toggle is always visible in the top navigation bar.

**Language Toggle Rules**

• Toggle is available on every screen: POS order entry, payment, shift management, and all dashboard pages.

• Language preference is saved per user account (cashier or manager). It persists across sessions and devices.

• Switching language takes effect instantly - no page reload required.

• Kitchen printer tickets use the venue's default language (set by manager), not the cashier's preference.

• Digital receipts are generated in the customer's requested language, or the venue default if not specified.

• The admin dashboard language toggle is independent of the POS app toggle.

## **16.2 RTL / LTR Layout**

Arabic requires a full right-to-left (RTL) layout - not just translated text. The entire UI must mirror when Arabic is active. This is handled at the framework level, not with per-element overrides.

- The HTML root element receives dir='rtl' when Arabic is active. All flex and grid layouts reverse automatically.
- TailwindCSS is configured with RTL variant support. Margins, paddings, text alignment, and icon positions are defined with logical properties (start/end) not physical ones (left/right).
- The Electron POS app uses the same React renderer as the dashboard - RTL support is consistent across both.
- All icons that imply direction (arrows, back buttons, sliders) are mirrored in RTL mode via CSS transform.
- Number formatting: Arabic-Indic numerals (٠١٢٣...) are available as a user preference. Default is Western numerals (0123...) for consistency in financial contexts.
- Currency formatting respects locale: Arabic locale places the currency symbol on the right (e.g., 150.00 ج.م).

## **16.3 Internationalisation (i18n) Implementation**

| **Component**     | **Implementation**                                                                                                                                               |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| i18n Library      | react-i18next - industry standard, supports RTL, lazy loading of language files, interpolation, pluralisation.                                                   |
| ---               | ---                                                                                                                                                              |
| Translation Files | JSON files: en.json and ar.json. One key per UI string. Stored in the app bundle and also overridable per client via the Control Plane (for custom terminology). |
| ---               | ---                                                                                                                                                              |
| String Coverage   | 100% of user-facing strings must be in translation files. Hardcoded strings are a build error (enforced by ESLint i18n plugin).                                  |
| ---               | ---                                                                                                                                                              |
| Date & Time       | Formatted using Intl.DateTimeFormat with the active locale. Hijri calendar available as an optional toggle for Arabic users.                                     |
| ---               | ---                                                                                                                                                              |
| Keyboard Input    | Arabic keyboard input supported natively by the OS. The POS search field (menu item search) supports Arabic text input.                                          |
| ---               | ---                                                                                                                                                              |
| Receipt Printing  | ESC/POS printers require Arabic font support. The receipt renderer uses a UTF-8 compatible ESC/POS library. Font availability is validated during printer setup. |
| ---               | ---                                                                                                                                                              |
| Menu Item Names   | Each menu item has both an Arabic name and an English name field. The POS and dashboard display the name matching the active language.                           |
| ---               | ---                                                                                                                                                              |
| Error Messages    | All system errors, validation messages, and alerts are translated. No English-only fallback shown to end users.                                                  |
| ---               | ---                                                                                                                                                              |

## **16.4 Database Schema for Bilingual Content**

All user-facing content fields in the database are stored as bilingual pairs. This avoids a separate translation table and keeps queries simple.

| **Table**            | **Bilingual Fields**                             |
| -------------------- | ------------------------------------------------ |
| menu_items           | name_en, name_ar, description_en, description_ar |
| ---                  | ---                                              |
| categories           | name_en, name_ar                                 |
| ---                  | ---                                              |
| modifiers            | name_en, name_ar, option_en, option_ar           |
| ---                  | ---                                              |
| venues               | name_en, name_ar, address_en, address_ar         |
| ---                  | ---                                              |
| receipt_templates    | header_en, header_ar, footer_en, footer_ar       |
| ---                  | ---                                              |
| system_notifications | message_en, message_ar                           |
| ---                  | ---                                              |

The API returns both language fields in all responses. The client app picks the correct field based on the active locale. This means language switching requires no additional API calls - both values are already in memory.

## **16.5 Manager Tooling for Translations**

- In the Menu Manager (admin dashboard), each item form has side-by-side Arabic and English input fields with clear labelling.
- A 'missing translation' indicator flags any item where the Arabic or English field is empty, so managers can identify gaps before publishing.
- Bulk translation export: managers can export all menu items to a CSV with en/ar columns, fill in translations offline, and re-import. Useful for large menus at onboarding.
- Auto-translate shortcut: a one-click button uses a translation API (e.g., Google Translate or DeepL) to pre-fill the missing language field. The manager reviews and confirms before saving. This is a convenience tool - human review is always required.

# **17\. Glossary**

| **Term**           | **Definition**                                                                                                               |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| POS                | Point of Sale - the system where orders are taken and payments processed.                                                    |
| ---                | ---                                                                                                                          |
| KDS                | Kitchen Display System - screen in the kitchen showing live order tickets.                                                   |
| ---                | ---                                                                                                                          |
| ESC/POS            | Escape/POS - standard command protocol for receipt and kitchen printers.                                                     |
| ---                | ---                                                                                                                          |
| JWT                | JSON Web Token - a signed token used for stateless authentication.                                                           |
| ---                | ---                                                                                                                          |
| WebSocket          | A full-duplex communication protocol over a single TCP connection, used for real-time events.                                |
| ---                | ---                                                                                                                          |
| Electron           | A framework for building cross-platform desktop apps using web technologies.                                                 |
| ---                | ---                                                                                                                          |
| SQLite             | A lightweight embedded relational database, used here for local offline caching.                                             |
| ---                | ---                                                                                                                          |
| Sync Queue         | A local FIFO queue of write operations that failed to reach the server, replayed on reconnect.                               |
| ---                | ---                                                                                                                          |
| Anchor Venue       | A venue (e.g., Cafe) designated as able to issue cross-venue cheques.                                                        |
| ---                | ---                                                                                                                          |
| Cross-Venue Cheque | A single bill combining items ordered at multiple venues within the hub.                                                     |
| ---                | ---                                                                                                                          |
| Kiosk Mode         | Operating mode where the POS computer is locked to the POS application only.                                                 |
| ---                | ---                                                                                                                          |
| idempotent         | An operation that produces the same result regardless of how many times it is applied. Used in sync to safely replay events. |
| ---                | ---                                                                                                                          |
| White-Label        | A product built by one company and rebranded and resold by another under their own name.                                     |
| ---                | ---                                                                                                                          |
| Single-Tenant      | A deployment model where each client has their own dedicated server and database, fully isolated from other clients.         |
| ---                | ---                                                                                                                          |
| Control Plane      | The internal ops dashboard used by the product company to provision, monitor, and update all client deployments.             |
| ---                | ---                                                                                                                          |
| Feature Flag       | A configuration switch that enables or disables a feature for a specific client without changing the codebase.               |
| ---                | ---                                                                                                                          |
| i18n               | Internationalisation - the engineering practice of building software to support multiple languages and locales.              |
| ---                | ---                                                                                                                          |
| RTL                | Right-to-Left - the text and layout direction used by Arabic, Hebrew, and other languages.                                   |
| ---                | ---                                                                                                                          |
| Terraform          | An infrastructure-as-code tool used to provision cloud servers automatically and repeatably.                                 |
| ---                | ---                                                                                                                          |

_End of Technical Proposal - Version 1.0_

_This document is confidential and intended for the named recipient only.ki_