# Team Development Log

Chronological record of what we built, why, and how to verify. **Every developer adds an entry when merging feature work.**

Format for new entries → see [DEVELOPMENT.md](DEVELOPMENT.md#team-process).

---

## Phase 0 — Project foundation (June 2026)

### 2026-06-06 — Documentation & AI setup
**Phase:** 0 (pre-code)  
**Who:** Initial planning  
**What:** Created product and engineering docs for the team and Cursor agents.

**Files:**
- `docs/PRD.md` — user stories (US-1.1 through US-13.x), acceptance criteria
- `docs/Technical_Proposal.md` — architecture, hub-and-spoke, phased delivery
- `docs/TechSpec.md` — naming, WebSocket contracts, security, Docker, CI
- `AGENTS.md` — agent/developer entry point
- `apps/api/prisma/schema.prisma` — DB source of truth
- `.cursor/skills/` — venue-pos, implement-user-story, database-schema, offline-sync, websocket-events

**Verify:** Read `docs/README.md` index.

---

### 2026-06-06 — Monorepo scaffold (apps + packages)
**Phase:** 0.1  
**What:** npm workspaces monorepo with clear separation: deployable apps vs shared packages.

**Structure:**
```
apps/     → api, dashboard, pos, kds, local-agent
packages/ → shared, i18n
```

**Files:**
- Root `package.json` — workspace scripts (`dev:api`, `migrate`, etc.)
- `eslint.config.js`, `.prettierrc`, `.gitignore`
- `packages/shared` — `ROLES`, `ERROR_CODES`, `API_BASE`
- `packages/i18n` — `en.json`, `ar.json`, `getDirection()`

**Verify:**
```bash
npm install
npm run lint:i18n   # → "23 keys in sync"
```

---

### 2026-06-06 — API server foundation (Fastify + Prisma)
**Phase:** 0.2  
**Story:** Foundation for US-1.x auth  
**What:** Node API with Fastify, Prisma ORM, PostgreSQL, structured errors.

**Files:**
- `apps/api/prisma/schema.prisma` — `Venue`, `User`, `Terminal` models
- `apps/api/prisma/migrations/20260606120000_init/` — initial migration
- `apps/api/src/db/prisma.js` — PrismaClient singleton
- `apps/api/src/app.js`, `src/index.js` — Fastify bootstrap
- `apps/api/src/plugins/error-handler.js` — standard error JSON
- `apps/api/src/routes/health.js` — `GET /health`, `GET /health/ready`
- `apps/api/src/config.js` — env loading

**Removed:** Raw `pg` pool + manual SQL migrations (replaced by Prisma).

**Verify:**
```bash
docker compose up -d postgres
npm run migrate
curl http://localhost:3000/health
```

---

### 2026-06-06 — Auth skeleton (JWT RS256)
**Phase:** 0.3  
**Stories:** US-1.1 (manager login), US-1.2 (cashier PIN), US-1.3 (terminal headers)  
**What:** Manager login and cashier PIN auth with terminal validation.

**Endpoints:**
| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/v1/auth/login` | Manager username/password → JWT |
| POST | `/api/v1/auth/pin` | Cashier PIN + `X-Terminal-ID` + `X-Terminal-Secret` |
| POST | `/api/v1/auth/logout` | 204 no content |

**Files:**
- `apps/api/src/routes/auth.js`
- `apps/api/src/services/auth-service.js`
- `apps/api/src/middleware/auth.js` — `authenticate`, `requireRoles`
- `apps/api/src/utils/jwt.js` — RS256 sign/verify
- `scripts/generate-jwt-keys.mjs` → `ops/secrets/*.pem`
- `apps/api/src/auth.test.js` — health + login tests

**Verify:**
```bash
npm run generate:jwt-keys
npm run seed
npm run dev:api
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'
```

---

### 2026-06-06 — Database seed (dev data)
**Phase:** 0.2  
**What:** Repeatable dev seed for venue, manager, cashier, terminal.

**Files:** `apps/api/src/db/seed.js`

**Seed data:**
| Entity | Value |
|--------|-------|
| Venue | Demo Cafe (anchor) |
| Manager | `admin` / `admin123` |
| Cashier | PIN `1234` (user `cashier1`) |
| Terminal ID | `00000000-0000-4000-8000-000000000001` |
| Terminal secret | `dev-terminal-secret` |

**Verify:** `npm run seed` then login via dashboard or curl.

---

### 2026-06-06 — Admin dashboard shell
**Phase:** 0.6  
**Stories:** US-11.1, US-11.2 (foundation)  
**What:** React + Vite + Tailwind admin with login, protected routes, EN/AR toggle, RTL.

**Files:**
- `apps/dashboard/src/pages/LoginPage.jsx`
- `apps/dashboard/src/pages/DashboardHome.jsx`
- `apps/dashboard/src/components/Layout.jsx`, `LanguageToggle.jsx`
- `apps/dashboard/src/hooks/useAuth.js`

**Verify:**
```bash
npm run dev:dashboard
# Open http://localhost:5173 — login admin/admin123 — toggle EN/ع
```

---

### 2026-06-06 — POS Electron shell
**Phase:** 0.7  
**What:** Electron + Vite POS with kiosk config, preload IPC bridge to local agent.

**Files:**
- `apps/pos/electron/main.cjs` — BrowserWindow, kiosk flag
- `apps/pos/electron/preload.cjs` — `window.venuePos.getAgentHealth()`
- `apps/pos/src/App.jsx` — agent status display

**Verify:**
```bash
npm run dev:agent
npm run dev:pos
# Or: npm run electron:dev -w @venue-pos/pos
```

---

### 2026-06-06 — KDS shell
**Phase:** 0.8  
**What:** Kitchen display Electron + Vite app with i18n.

**Files:** `apps/kds/src/App.jsx`, `electron/main.cjs`

**Verify:** `npm run dev:kds` → http://localhost:5175

---

### 2026-06-06 — Local agent shell
**Phase:** 0.8  
**Stories:** Foundation for US-7.x offline  
**What:** Fastify on :3456, SQLite WAL, sync_queue table stub, health endpoint.

**Files:**
- `apps/local-agent/src/db/sqlite.js`
- `apps/local-agent/src/server.js`
- `apps/local-agent/src/index.js`

**Verify:**
```bash
npm run dev:agent
curl http://127.0.0.1:3456/health
```

---

### 2026-06-06 — Docker & CI
**Phase:** 0.4, 0.5  
**What:** Local Postgres/Redis compose; API Dockerfile with Prisma migrate; GitHub Actions CI.

**Files:**
- `docker-compose.yml`, `docker-compose.dev.yml`
- `docker/Dockerfile.api`
- `ops/nginx/nginx.conf`
- `.github/workflows/ci.yml` — lint → api test (postgres service) → build frontends

**Verify:**
```bash
docker compose up -d postgres redis
npm run migrate && npm run test -w @venue-pos/api
npm run build:dashboard && npm run build:pos && npm run build:kds
```

---

### 2026-06-06 — Cursor rules & team docs (this entry)
**Phase:** 0  
**What:** Expanded Cursor rules for each tech layer; team documentation for onboarding.

**Files:**
- `.cursor/rules/` — core, team-workflow, monorepo, prisma, api-server, i18n-rtl, shared-packages, docker-ci, react-ui, electron-terminal
- `docs/README.md`, `docs/DEVELOPMENT.md`, `docs/TEAM_LOG.md`

**Verify:** New teammate follows `docs/DEVELOPMENT.md` from zero to running apps.

---

### 2026-06-06 — Documentation cleanup
**Phase:** 0  
**What:** Removed redundant spec files; consolidated docs and Cursor rules for a lean set.

**Removed:**
- `.cursor/PROJECT_SPEC.md` (duplicated TechSpec + Prisma schema)
- `.cursor/IMPLEMENTATION_PLAN.md` (duplicated TEAM_LOG + Technical_Proposal)
- `docs/REPO_STRUCTURE.md` (merged into DEVELOPMENT.md)
- `.cursor/skills/*/reference.md` (duplicated TechSpec §8 + outdated SQL)
- `.cursor/rules/README.md`, `fastify-api.mdc`, `database.mdc` (merged into api-server + prisma rules)

**Source of truth now:**
- DB → `apps/api/prisma/schema.prisma`
- WebSocket payloads → `docs/TechSpec.md` §8
- Roadmap → `docs/TEAM_LOG.md` + `docs/Technical_Proposal.md` §12
- Setup → `docs/DEVELOPMENT.md`

---

### 2026-06-06 — Phase 1 core slice: menu + POS order flow
**Phase:** 1  
**Stories:** US-2.1–2.3 (foundation), US-2.5 (publish), US-3.1–3.2 (foundation)  
**What:** Menu templates with categories/items, manager write + terminal read APIs, local-agent menu cache, POS menu grid with draft order creation.

**Schema:** `MenuTemplate`, `MenuTemplateVenue`, `Category`, `MenuItem`, `Order`, `OrderItem`  
**Migration:** `20260606130000_phase1_menu_orders`

**API endpoints:**
| Method | Path | Purpose |
|--------|------|---------|
| GET/POST | `/api/v1/menu-templates` | List / create templates |
| GET/PATCH | `/api/v1/menu-templates/:id` | Read / update template |
| POST | `/api/v1/menu-templates/:id/categories` | Add category |
| POST | `/api/v1/categories/:id/items` | Add menu item |
| POST | `/api/v1/menu-templates/:id/publish` | Publish menu + version hash |
| GET | `/api/v1/venues/:venueId/menu` | Terminal: published menu |
| POST | `/api/v1/orders` | Terminal: create draft order |
| POST | `/api/v1/orders/:id/items` | Terminal: add item to order |

**Local agent:** `GET /v1/menu`, `POST /v1/menu/sync`, `POST /v1/orders`, `POST /v1/orders/:id/items`  
**POS:** Category tabs, item grid, cart sidebar, new-order flow via IPC  
**Seed:** Demo Lunch Menu (published) for Demo Cafe

**Verify:**
```bash
nvm use 20.20.2
docker compose up -d postgres redis
npm run migrate && npm run seed
npm run test -w @venue-pos/api
npm run dev:api & npm run dev:agent & npm run dev:pos
# POS: New order → tap items → see cart total
```

**Dev IDs (after seed):**
| Entity | ID |
|--------|-----|
| Venue | `00000000-0000-4000-8000-000000000010` |
| Cashier | use `cashier1` row id from DB (see seed output) |

---

### 2026-06-06 — Phase 1 complete: modifiers, kitchen send, dashboard menu manager
**Phase:** 1  
**Stories:** US-2.4, US-2.5, US-3.2–3.3 (foundation), US-1.2 (PIN on POS)  
**What:** Modifier groups with order-time snapshots, Socket.IO `menu:updated` + `order:created`, full order lifecycle (qty, remove, send, receipt), dashboard menu manager, POS PIN login + modifier modal, local-agent sync replay + WS menu listener.

**Migration:** `20260606140000_phase1_modifiers_kitchen` (ModifierGroup, ModifierOption, MenuItemModifier, Order.sentAt, OrderItem.modifiersSnapshot)

**Additional API endpoints:**
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/v1/venues` | List venues (dashboard) |
| PUT | `/api/v1/menu-templates/:id/categories/reorder` | Reorder categories |
| POST | `/api/v1/menu-templates/:id/modifier-groups` | Create modifier group |
| PATCH | `/api/v1/menu-items/:itemId` | Update item / 86 toggle |
| PATCH | `/api/v1/orders/:id/items/:itemId` | Update item quantity |
| DELETE | `/api/v1/orders/:id/items/:itemId` | Remove draft item |
| POST | `/api/v1/orders/:id/send` | Send order to kitchen |
| GET | `/api/v1/orders/:id/receipt` | Basic receipt text |

**Local agent:** `POST /v1/sync/replay`, `PATCH/DELETE /v1/orders/:id/items/:itemId`, `POST /v1/orders/:id/send`, `GET /v1/orders/:id/receipt`  
**Dashboard:** `MenuManagerPage` — templates, categories, items, publish, 86 toggle  
**POS:** PIN login, modifier modal, cart qty +/-, send kitchen, receipt display  
**Tests:** `phase1.test.js` (12 API tests total) + `scripts/phase1-scenarios.mjs` (integration smoke)

**Verify:**
```bash
nvm use 20.20.2
docker compose up -d postgres redis
npm run migrate && npm run seed
npm run lint && npm run lint:i18n && npm run test -w @venue-pos/api
npm run dev:api & npm run dev:agent & npm run dev:dashboard & npm run dev:pos
node scripts/phase1-scenarios.mjs   # with API + agent running
```

**Dev credentials (after seed):**
| Entity | Value |
|--------|-------|
| Manager | `admin` / `admin123` |
| Cashier PIN | `1234` |
| Cashier ID | `00000000-0000-4000-8000-000000000011` |
| Venue ID | `00000000-0000-4000-8000-000000000010` |
| Terminal ID | `00000000-0000-4000-8000-000000000001` |
| Terminal secret | `dev-terminal-secret` |

**Deferred to Phase 2+:** KDS `order:created` UI, kitchen printer, category drag-and-drop UI, full offline conflict resolution (Phase 6).

---

### 2026-06-06 — Docs: KDS optional at onboarding + cleanup
**Phase:** 1 (docs)  
**What:** Documented `kds_enabled` / `FEATURE_KDS_ENABLED` — KDS is a provider onboarding toggle, not required for every hub (printer-only OK). Cleaned stale roadmap/audit/Electron references across `DEVELOPMENT.md`, `README.md`, `AGENTS.md`, `PRD.md`, `TEAM_LOG.md`.

**Verify:** Read `docs/DEVELOPMENT.md` § Optional features (provider onboarding).

---

### 2026-06-06 — CI fix: Prisma generate without DB + Electron Node 20
**Phase:** 1 (tooling)  
**What:** CI `npm ci` failed — `prisma.config.ts` required `DATABASE_URL` at install time; `electron@42` requires Node ≥22 while CI/dev use Node 20.

**Fix:** Removed `datasource` from `prisma.config.ts`; dummy `DATABASE_URL` in `prisma-generate.mjs` for generate-only; Electron `^40.10.2` (Node 20 + audit clean).

**Verify:** `DATABASE_URL= npm ci` on lint job path; `npm audit` → 0 vulnerabilities.

---

### 2026-06-06 — Install/audit/Prisma team docs
**Phase:** 1 (tooling)  
**What:** Clarified npm audit highs (Electron + tar, not Prisma), migrated to `prisma.config.ts`, pinned `tar` override, upgraded Electron, made `prisma-generate` retry-only on failure.

**Files:** `apps/api/prisma.config.ts`, `scripts/prisma-generate.mjs`, root `package.json` overrides, `apps/pos/package.json`, `docs/DEVELOPMENT.md`

**Also:** `bcrypt@6` (drops vulnerable `tar` chain), Electron `^40.10.2` in POS + KDS (Node 20).

**Verify:** `npm install` → `found 0 vulnerabilities`; no `package.json#prisma` warn; `npm run db:generate` quiet unless EPERM retry on Z:.

---

### 2026-06-06 — PR #1 review fixes (Phase 1 hardening)
**Phase:** 1 (bugfix)  
**What:** Addressed valid Copilot review comments from PR #1 — Socket.IO decoration, sync queue enqueue-on-failure only, qty replay, smoke script guards, POS `lang` on load.

**Files:**
- `apps/api/src/app.js` — `app.decorate('io', null)` so encapsulated routes see `request.server.io`
- `apps/local-agent/src/services/orders.js` — removed eager `enqueueSync` from local writes
- `apps/local-agent/src/server.js` — enqueue only when immediate API sync fails; `order.patch_item` on qty failure
- `apps/local-agent/src/services/sync-processor.js` — replay handler for `order.patch_item`
- `apps/pos/src/i18n.js` — set `<html lang>` on initial load
- `scripts/phase1-scenarios.mjs` — skip order scenarios when menu/order prerequisites missing

**Verify:**
```bash
npm run lint && npm run test -w @venue-pos/api && npm run test -w @venue-pos/local-agent
npm run dev:api & npm run dev:agent
node scripts/phase1-scenarios.mjs
```

---

### 2026-06-06 — Fix local-agent sync queue false success
**Phase:** 1 (bugfix)  
**What:** `fetch()` does not throw on HTTP 4xx/5xx. Sync replay was marking queue jobs `done` even when the API rejected them, so failed orders could disappear from the retry queue.

**Files:**
- `apps/local-agent/src/services/api-fetch.js` — shared helper with `res.ok` check
- `apps/local-agent/src/services/sync-processor.js` — uses `apiFetch`; only marks `done` on success
- `apps/local-agent/src/services/orders.js` — imports shared `apiFetch`
- `apps/local-agent/src/server.js` — add-item inline fetch uses `apiFetch`
- `apps/local-agent/src/services/sync-processor.test.js` — failure keeps `pending` + increments `retry_count`

**Verify:**
```bash
npm run test -w @venue-pos/local-agent
npm run dev:agent   # stop API, create order on POS, confirm sync_queue stays pending
```

---

## Phase 2 — In progress (`phase-2` branch)

Kitchen output — **KDS is optional per client** (`kds_enabled` at provider onboarding). Printer-only sites skip `apps/kds`; still deliver send-to-kitchen, printer, and status APIs.

### 2026-06-06 — US-6.1 KDS order display (started)

**What:** `GET /api/v1/kitchen/orders`, KDS socket joins `venue:{id}:kitchen` via `clientType: 'kds'`, live `order:created` tickets in `apps/kds` with age color coding. Gated by `FEATURE_KDS_ENABLED` / `VITE_FEATURE_KDS_ENABLED`.

**Files:** `apps/api/src/routes/kitchen.js`, `apps/api/src/services/order-service.js`, `apps/api/src/plugins/socket.js`, `apps/kds/src/App.jsx`, `packages/i18n/locales/*.json`

**Verify:**
```bash
npm run dev -- --kds
# POS: checkout an order → ticket appears on http://localhost:5175
npm run test -w @venue-pos/api
```

### 2026-06-06 — US-6.2 / US-3.4 kitchen item status (started)

**What:** `OrderItem.kitchenStatus` enum, `PATCH /api/v1/kitchen/orders/:id/items/:itemId/status`, auto order status (`sent` → `partially_ready` → `ready` → `served`), `order:item_status` WebSocket to POS + KDS. KDS Start/Ready/Bump buttons; POS kitchen progress bar after checkout.

**Migration:** `20260606150000_phase2_item_kitchen_status`

**Verify:**
```bash
npm run migrate -w @venue-pos/api
npm run dev -- --kds
# POS checkout → KDS Start/Ready/Bump → POS footer updates live
```

### 2026-06-06 — POS Clear (start over) — US-3.5 void removed from cashier UI

**What:** Draft cart **Clear** abandons the order (`POST /api/v1/orders/:id/abandon`) — no manager PIN. Removes orphan drafts locally + on server. Matches real F&B: fix mistakes with **−** or start over with **Clear** while building the tab.

**Removed from POS:** Void button/modal (did not match open-cheque workflow). Backend `void` API + audit schema kept for Phase 3 cheque management.

**Verify:**
```bash
npm run test -w @venue-pos/api
# POS: add items → Clear → empty cart, fresh order
```

### 2026-06-06 — US-6.3 kitchen printer

**What:** Local agent prints ESC/POS text ticket on send when `KITCHEN_PRINTER_HOST` is set (TCP port 9100, 3 retries). `/health` exposes `printer` status; POS footer shows printer connected/offline from agent health.

**Env:** `apps/local-agent/.env` — `KITCHEN_PRINTER_HOST`, `KITCHEN_PRINTER_PORT` (see `.env.example`)

**Verify:**
```bash
# Without printer host: health shows not_configured, POS shows connected
# With host: send order → ticket prints; failed host → printer offline in POS
```

**Remaining Phase 2 (nice-to-have):**
- SLA alerts, station grouping, KDS undo
- Venue-level printer config in dashboard

### Deferred — Phase 3 open cheque / tab management (real F&B model)

Reference: Toast, Square, Lightspeed, Oracle Simphony — **open check** per table/guest.

| Today (Phase 1–2) | Target (Phase 3+) |
|-------------------|-------------------|
| Checkout sends to kitchen then **starts a new order** | **Fire** new items to kitchen; **same cheque stays open** |
| One-shot order session | Guest stays hours; add rounds whenever |
| No cheque entity in POS | `cheques` table: open → paid / voided |
| Void on draft cart | **Clear** only on draft; manager void/comp on **running or paid cheques** |

**Phase 3 scope (documented, not started):**
- Open cheque per table — list open cheques, resume, add items across rounds
- Fire/send kitchen tickets per round without closing the cheque
- Cheque explorer: running totals, item history, split (US-3.6)
- Void/comp/transfer line items on open cheques (manager PIN + audit) — uses existing `order_void_audits` / `void` API patterns
- Pay cheque → `billed` / `closed` (Phase 3 payments epic)

**Current workaround:** Each **Fire to kitchen** sends one kitchen ticket; table label is cosmetic until cheque model ships.

### 2026-06-06 — POS label: Checkout → Fire to kitchen

**What:** POS primary action uses `pos.sendKitchen` (“Fire to kitchen” / “إرسال للمطبخ”) instead of “Checkout” — avoids implying payment; real checkout comes with Phase 3 cheques.

---

## Quick reference — Phase 0 deliverables

| Deliverable | Status |
|-------------|--------|
| Monorepo (apps + packages) | ✅ |
| Prisma + Postgres | ✅ |
| Auth (login + PIN) | ✅ |
| Dashboard shell + i18n | ✅ |
| POS + KDS shell (optional app) + local-agent | ✅ |
| Docker Compose | ✅ |
| CI pipeline | ✅ |
| Team documentation | ✅ |
