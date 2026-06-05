# Technical Specification
# Unified Hub POS & Management System
# Version 1.0 | 6 June 2026

> **Note:** Architecture and repo layout → [DEVELOPMENT.md](DEVELOPMENT.md). Database schema → [apps/api/prisma/schema.prisma](../apps/api/prisma/schema.prisma). Product stories → [PRD.md](PRD.md). This file covers env config, conventions, WebSocket contracts, security, and deployment.

---

## 6. Environment Variables

### 6.1 Server API (.env)

```env
# Server
NODE_ENV=production
PORT=3000
HOST=0.0.0.0
API_BASE_URL=https://api.hub.local
DASHBOARD_URL=https://dashboard.hub.local

# Database
DATABASE_URL=postgresql://user:pass@postgres:5432/hub_pos
DB_POOL_MIN=2
DB_POOL_MAX=20
REDIS_URL=redis://:password@redis:6379

# JWT
JWT_PRIVATE_KEY_PATH=/secrets/jwt-private.pem
JWT_PUBLIC_KEY_PATH=/secrets/jwt-public.pem
JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_EXPIRY=30d
JWT_ISSUER=hub-pos-system
JWT_AUDIENCE=hub-pos-clients

# Terminal Auth
TERMINAL_SECRET_SALT=random_salt_value_32_chars

# WebSocket
WS_CORS_ORIGIN=https://dashboard.hub.local
WS_HEARTBEAT_INTERVAL=30000
WS_RECONNECT_BACKOFF_MAX=30000

# Security
BCRYPT_ROUNDS=12
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=100
CORS_ALLOWED_ORIGINS=https://dashboard.hub.local,https://pos.hub.local

# File Storage
UPLOAD_DIR=/data/uploads
MAX_UPLOAD_SIZE=5242880

# Backup
BACKUP_ENABLED=true
BACKUP_SCHEDULE=0 2 * * *
BACKUP_RETENTION_DAYS=30
BACKUP_ENCRYPTION_KEY_PATH=/secrets/backup-key.pem
BACKUP_S3_ENDPOINT=https://s3.provider.com
BACKUP_S3_BUCKET=hub-pos-backups
BACKUP_S3_ACCESS_KEY=AKIA...
BACKUP_S3_SECRET_KEY=secret

# Email (Digital Receipts)
SMTP_HOST=smtp.provider.com
SMTP_PORT=587
SMTP_USER=noreply@hub.local
SMTP_PASS=secret
SMTP_FROM_NAME="Hub POS"
SMTP_FROM_EMAIL=noreply@hub.local

# Printer
PRINTER_DEFAULT_TIMEOUT=5000
PRINTER_RETRY_ATTEMPTS=3

# Logging
LOG_LEVEL=info
LOG_FORMAT=json
LOG_FILE_PATH=/var/log/hub-pos/app.log

# Feature Flags (Server-side defaults)
FEATURE_INTEGRATED_CARD_PAYMENT=false
FEATURE_RESERVATION_MODULE=false
FEATURE_LOYALTY_PROGRAM=false
FEATURE_INVENTORY_MANAGEMENT=true
FEATURE_DIGITAL_RECEIPTS=true
FEATURE_KDS_ENABLED=true
FEATURE_CROSS_VENUE_BILLING=true
FEATURE_MULTI_LANGUAGE=true

# White-Label
CLIENT_NAME="Default Hub"
CLIENT_LOGO_PATH=/data/branding/logo.svg
CLIENT_PRIMARY_COLOR=#3B82F6
CLIENT_SECONDARY_COLOR=#1E40AF
CLIENT_DOMAIN=hub.local

# Monitoring
HEALTH_CHECK_INTERVAL=30000
ALERT_EMAIL=ops@company.com
ALERT_WEBHOOK_URL=https://hooks.slack.com/...
```

### 6.2 POS App (.env)

```env
# Electron
ELECTRON_IS_KIOSK=true
ELECTRON_DISABLE_DEV_TOOLS=true
ELECTRON_SINGLE_INSTANCE=true

# Local Agent Connection
LOCAL_AGENT_HOST=127.0.0.1
LOCAL_AGENT_PORT=3456
LOCAL_AGENT_SECRET=terminal_specific_secret

# Terminal Identity
TERMINAL_ID=uuid
VENUE_ID=uuid

# Server
SERVER_API_URL=https://api.hub.local
SERVER_WS_URL=wss://api.hub.local

# UI
DEFAULT_LANGUAGE=en
ENABLE_ANIMATIONS=false
TOUCH_TARGET_SIZE=48px

# Printer
RECEIPT_PRINTER_TYPE=usb|network
RECEIPT_PRINTER_ADDRESS=192.168.1.100
RECEIPT_PRINTER_PORT=9100
KITCHEN_PRINTER_TYPE=network
KITCHEN_PRINTER_ADDRESS=192.168.1.101
KITCHEN_PRINTER_PORT=9100

# Sync
SYNC_INTERVAL_MS=5000
SYNC_MAX_RETRIES=5
SYNC_RETRY_BACKOFF_MS=1000
OFFLINE_BANNER_TIMEOUT_MS=3000
```

### 6.3 Local Agent (.env)

```env
# Terminal Identity
TERMINAL_ID=uuid
TERMINAL_SECRET=pre_shared_secret
VENUE_ID=uuid

# Server
SERVER_API_URL=https://api.hub.local
SERVER_WS_URL=wss://api.hub.local

# Local Database
SQLITE_PATH=/data/local.db
SQLITE_WAL_MODE=true
SQLITE_BUSY_TIMEOUT=5000

# Sync
SYNC_POLL_INTERVAL_MS=5000
SYNC_BATCH_SIZE=50
SYNC_TIMEOUT_MS=30000
CONFLICT_RESOLUTION=server_wins

# Network
NETWORK_HEALTH_CHECK_INTERVAL_MS=10000
NETWORK_TIMEOUT_MS=10000
MAX_OFFLINE_DURATION_HOURS=72

# Watchdog
WATCHDOG_ENABLED=true
WATCHDOG_CHECK_INTERVAL_MS=5000
WATCHDOG_MAX_RESTARTS=3
WATCHDOG_RESTART_WINDOW_MS=600000

# Printer
ESC_POS_ENCODING=UTF-8
PRINTER_CONNECTION_TIMEOUT=5000
PRINTER_RETRY_COUNT=3

# Logging
LOG_LEVEL=info
LOG_PATH=/var/log/local-agent/agent.log
LOG_MAX_SIZE=10485760
LOG_MAX_FILES=5
```

---

## 7. Naming Conventions

### 7.1 Database
- **Tables:** snake_case, plural (e.g., `menu_items`, `order_items`)
- **Columns:** snake_case (e.g., `created_at`, `venue_id`)
- **Primary Keys:** `id` (UUID, `gen_random_uuid()`)
- **Foreign Keys:** `{table}_id` (e.g., `venue_id`, `cashier_id`)
- **Timestamps:** `created_at`, `updated_at`, `deleted_at` (soft delete)
- **Booleans:** Prefix with `is_` (e.g., `is_active`, `is_available`)
- **JSON Columns:** Suffix with `_json` or `_snapshot` (e.g., `modifiers_snapshot`)
- **Indexes:** `idx_{table}_{column}` (e.g., `idx_orders_venue`)
- **Constraints:** `chk_{table}_{rule}` (e.g., `chk_orders_status`)

### 7.2 API
- **Endpoints:** kebab-case (e.g., `/api/v1/menu-templates`, `/cross-venue`)
- **HTTP Methods:** RESTful (POST create, GET read, PATCH update, DELETE remove)
- **Query Parameters:** camelCase (e.g., `venueId`, `dateFrom`)
- **Response Keys:** camelCase (e.g., `orderNumber`, `totalPages`)
- **Error Codes:** SCREAMING_SNAKE_CASE (e.g., `INVALID_CREDENTIALS`, `RATE_LIMIT_EXCEEDED`)
- **Sync IDs:** Client-generated UUID, field name `syncId` (request) / `sync_id` (DB)

### 7.3 Code
- **JavaScript/Node.js:**
  - Variables/functions: camelCase (`getUserById`, `processPayment`)
  - Classes: PascalCase (`OrderService`, `MenuManager`)
  - Constants: SCREAMING_SNAKE_CASE (`MAX_RETRY_COUNT`, `DEFAULT_TAX_RATE`)
  - Files: kebab-case (`auth-service.js`, `order-validator.js`)
  - React Components: PascalCase (`OrderScreen.jsx`, `MenuGrid.jsx`)
  - CSS Classes: kebab-case (`order-grid`, `payment-pad`)
  - Custom Hooks: camelCase with `use` prefix (`useLocalAgent`, `useSyncStatus`)

- **Database Migrations:**
  - Format: `###_action_description.sql` (e.g., `001_create_users.sql`, `007_create_orders.sql`)
  - Sequential numbering, zero-padded to 3 digits
  - Never modify existing migrations; create new ones for schema changes

### 7.4 Git Branches
- `main` — Production-ready, protected
- `develop` — Integration branch
- `feature/{ticket-id}-{description}` — Feature work (e.g., `feature/US-3.2-modifier-selection`)
- `bugfix/{ticket-id}-{description}` — Bug fixes
- `hotfix/{description}` — Production hotfixes
- `release/{version}` — Release preparation

### 7.5 Commits
- Format: `type(scope): description`
- Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`
- Example: `feat(orders): add modifier selection modal`
- Example: `fix(sync): resolve duplicate payment detection`

---

## 8. WebSocket Event Contracts

### 8.1 Server → Client Events

```javascript
// menu:updated — Menu published
{
  event: "menu:updated",
  payload: {
    templateId: "uuid",
    venueIds: ["uuid"],
    versionHash: "string",
    publishedAt: "ISO8601"
  },
  room: "venue:{venueId}"
}

// order:created — New order sent to kitchen
{
  event: "order:created",
  payload: {
    orderId: "uuid",
    venueId: "uuid",
    tableId: "string",
    items: [...],
    status: "sent",
    sentAt: "ISO8601"
  },
  room: "venue:{venueId}:kitchen"
}

// order:item_status — Kitchen updates item status
{
  event: "order:item_status",
  payload: {
    orderId: "uuid",
    itemId: "uuid",
    status: "in_progress|ready",
    updatedBy: "uuid",
    updatedAt: "ISO8601"
  },
  room: "venue:{venueId}:pos"
}

// order:voided — Order voided
{
  event: "order:voided",
  payload: {
    orderId: "uuid",
    venueId: "uuid",
    reason: "string",
    voidedBy: "uuid",
    voidedAt: "ISO8601"
  },
  room: "venue:{venueId}"
}

// cheque:cross_billed — Cross-venue cheque paid
{
  event: "cheque:cross_billed",
  payload: {
    chequeId: "uuid",
    anchorVenueId: "uuid",
    linkedVenueIds: ["uuid"],
    total: "decimal",
    paidAt: "ISO8601"
  },
  room: "venue:{venueId}"
}

// cheque:lock_acquired — Cross-venue lock
{
  event: "cheque:lock_acquired",
  payload: {
    chequeId: "uuid",
    lockedOrderIds: ["uuid"],
    anchorVenueId: "uuid",
    expiresAt: "ISO8601"
  },
  room: "venue:{venueId}"
}

// terminal:heartbeat — Terminal health
{
  event: "terminal:heartbeat",
  payload: {
    terminalId: "uuid",
    venueId: "uuid",
    timestamp: "ISO8601",
    syncQueueDepth: 0,
    menuVersionHash: "string"
  },
  room: "terminal:{terminalId}"
}

// dashboard:metrics_tick — Live metrics
{
  event: "dashboard:metrics_tick",
  payload: {
    timestamp: "ISO8601",
    venues: [
      {
        venueId: "uuid",
        revenueToday: "decimal",
        activeOrders: 5,
        ordersPerMinute: 2.3,
        openTables: 8
      }
    ]
  },
  room: "dashboard:hub_manager"
}

// venue:config_updated — Configuration change
{
  event: "venue:config_updated",
  payload: {
    venueId: "uuid",
    changes: ["billing_config", "tax_rate"],
    updatedAt: "ISO8601"
  },
  room: "venue:{venueId}"
}

// alert:stock_low — Low stock warning
{
  event: "alert:stock_low",
  payload: {
    inventoryItemId: "uuid",
    venueId: "uuid",
    itemName: "string",
    currentStock: 2.5,
    threshold: 5.0
  },
  room: "venue:{venueId}:pos"
}
```

### 8.2 Client → Server Events

```javascript
// terminal:heartbeat_ack — Terminal heartbeat response
{
  event: "terminal:heartbeat_ack",
  payload: {
    terminalId: "uuid",
    lastEventId: "uuid",
    timestamp: "ISO8601"
  }
}

// dashboard:subscribe — Dashboard subscription
{
  event: "dashboard:subscribe",
  payload: {
    userId: "uuid",
    role: "hub_manager|venue_manager",
    venueId: "uuid|null"
  }
}

// kitchen:status_update — KDS status change
{
  event: "kitchen:status_update",
  payload: {
    orderId: "uuid",
    itemId: "uuid",
    status: "in_progress|ready",
    stationId: "string",
    updatedAt: "ISO8601"
  }
}
```

### 8.3 Room Naming Convention

```
venue:{venueId}              — All venue clients (POS, KDS)
venue:{venueId}:pos            — POS terminals only
venue:{venueId}:kitchen        — KDS screens only
venue:{venueId}:manager        — Manager dashboard sessions
dashboard:hub_manager          — Hub manager dashboard
dashboard:venue:{venueId}      — Venue manager dashboard
terminal:{terminalId}          — Specific terminal
cheque:{chequeId}              — Cross-venue cheque participants
```

---

## 9. Error Handling & Status Codes

### 9.1 HTTP Status Codes

| Code | Usage |
|------|-------|
| 200 | OK — Standard success |
| 201 | Created — Resource created |
| 204 | No Content — Success, no body (logout) |
| 400 | Bad Request — Validation error |
| 401 | Unauthorized — Invalid/missing token |
| 403 | Forbidden — Valid token, insufficient role |
| 404 | Not Found — Resource doesn't exist |
| 409 | Conflict — Business rule violation (e.g., order already billed) |
| 422 | Unprocessable — Semantic error (e.g., void on paid cheque) |
| 429 | Too Many Requests — Rate limit exceeded |
| 500 | Internal Server Error — Unexpected error |
| 503 | Service Unavailable — Server maintenance |

### 9.2 Error Response Format

```json
{
  "error": {
    "code": "INVALID_CREDENTIALS",
    "message": "The provided username or password is incorrect",
    "details": {
      "field": "password",
      "reason": "mismatch"
    },
    "timestamp": "2026-06-06T10:30:00Z",
    "request_id": "uuid",
    "documentation_url": "https://docs.hub.local/errors/INVALID_CREDENTIALS"
  }
}
```

### 9.3 Common Error Codes

| Code | HTTP | Description |
|------|------|-------------|
| INVALID_CREDENTIALS | 401 | Wrong username/password/PIN |
| TOKEN_EXPIRED | 401 | JWT access token expired |
| TOKEN_INVALID | 401 | JWT malformed or signature invalid |
| INSUFFICIENT_PERMISSIONS | 403 | Role doesn't allow this action |
| RATE_LIMIT_EXCEEDED | 429 | Too many requests |
| RESOURCE_NOT_FOUND | 404 | ID doesn't exist |
| DUPLICATE_SYNC_ID | 409 | Idempotent replay detected |
| ORDER_ALREADY_BILLED | 409 | Order linked to another cheque |
| CHEQUE_LOCK_EXPIRED | 409 | Cross-venue lock timed out |
| VOID_NOT_ALLOWED | 422 | Cannot void paid order |
| INVALID_MENU_VERSION | 422 | Terminal menu stale, sync required |
| SHIFT_REQUIRED | 403 | Cashier must open shift first |
| PRINTER_OFFLINE | 503 | Receipt printer not responding |
| OFFLINE_MODE | 503 | Cross-venue billing unavailable |

---

## 10. Security Specifications

### 10.1 JWT Token Structure

**Access Token (15-minute expiry):**
```json
{
  "header": {
    "alg": "RS256",
    "typ": "JWT",
    "kid": "key-id-2026"
  },
  "payload": {
    "sub": "user-uuid",
    "role": "cashier",
    "venue_id": "venue-uuid",
    "terminal_id": "terminal-uuid",
    "iat": 1717675800,
    "exp": 1717676700,
    "iss": "hub-pos-system",
    "aud": "hub-pos-clients",
    "jti": "unique-token-id"
  }
}
```

**Refresh Token (30-day expiry):**
```json
{
  "payload": {
    "sub": "user-uuid",
    "type": "refresh",
    "iat": 1717675800,
    "exp": 1720267800,
    "jti": "unique-refresh-id"
  }
}
```

### 10.2 Terminal Authentication

```
Every API request from terminal:
  Authorization: Bearer {cashier_jwt}
  X-Terminal-ID: {terminal_uuid}
  X-Terminal-Secret: {pre_shared_secret}

Server validates:
  1. JWT signature and expiry
  2. Terminal ID matches JWT terminal_id claim
  3. X-Terminal-Secret hash matches DB record
  4. Terminal is_active = true
```

### 10.3 Rate Limiting Rules

| Endpoint | Limit | Window |
|----------|-------|--------|
| /auth/* | 5 requests | 1 minute |
| /api/v1/* | 100 requests | 1 minute |
| /sync | 60 requests | 1 minute |
| WebSocket connect | 10 connections | 1 minute per IP |

### 10.4 CORS Policy

```javascript
// Server CORS configuration
{
  origin: [
    "https://dashboard.hub.local",
    "https://pos.hub.local",
    "https://kds.hub.local"
  ],
  methods: ["GET", "POST", "PATCH", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Terminal-ID", "X-Terminal-Secret"],
  credentials: true,
  maxAge: 86400
}
```

### 10.5 Data Encryption

| Data | Encryption | Key Location |
|------|-----------|--------------|
| Database backups | AES-256-GCM | /secrets/backup-key.pem |
| JWT signing | RS256 | /secrets/jwt-private.pem (server only) |
| Terminal secrets | bcrypt + salt | PostgreSQL (hashed) |
| PINs | bcrypt (12 rounds) | PostgreSQL (hashed) |
| WebSocket | TLS 1.3 | Let's Encrypt / Certbot |
| API traffic | TLS 1.2+ | Let's Encrypt / Certbot |

---

## 11. Deployment Specifications

### 11.1 Docker Compose (Production)

```yaml
version: '3.8'

services:
  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./ops/nginx/nginx.conf:/etc/nginx/nginx.conf:ro
      - ./ops/nginx/ssl:/etc/nginx/ssl:ro
      - ./server/public:/var/www/static:ro
    depends_on:
      - api
    restart: unless-stopped

  api:
    image: hub-pos/api:${API_VERSION}
    environment:
      - NODE_ENV=production
      - DATABASE_URL=${DATABASE_URL}
      - REDIS_URL=${REDIS_URL}
      - JWT_PRIVATE_KEY_PATH=/secrets/jwt-private.pem
    volumes:
      - ./secrets:/secrets:ro
      - ./data/uploads:/data/uploads
    depends_on:
      - postgres
      - redis
    restart: unless-stopped
    deploy:
      replicas: 2
      resources:
        limits:
          cpus: '2'
          memory: 2G

  postgres:
    image: postgres:16-alpine
    environment:
      - POSTGRES_USER=${DB_USER}
      - POSTGRES_PASSWORD=${DB_PASSWORD}
      - POSTGRES_DB=hub_pos
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./server/migrations:/docker-entrypoint-initdb.d
    restart: unless-stopped
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 2G

  redis:
    image: redis:7-alpine
    command: redis-server --requirepass ${REDIS_PASSWORD}
    volumes:
      - redis_data:/data
    restart: unless-stopped

  pgbackup:
    image: hub-pos/pgbackup:latest
    environment:
      - BACKUP_SCHEDULE=${BACKUP_SCHEDULE}
      - BACKUP_RETENTION_DAYS=${BACKUP_RETENTION_DAYS}
      - S3_ENDPOINT=${BACKUP_S3_ENDPOINT}
      - S3_BUCKET=${BACKUP_S3_BUCKET}
    volumes:
      - ./secrets/backup-key.pem:/secrets/backup-key.pem:ro
    depends_on:
      - postgres
    restart: unless-stopped

volumes:
  postgres_data:
  redis_data:
```

### 11.2 CI/CD Pipeline (GitHub Actions)

```yaml
# .github/workflows/ci.yml
name: CI/CD Pipeline

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
      - run: npm run lint
      - run: npm run lint:i18n  # ESLint i18n plugin check

  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_PASSWORD: test
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
      redis:
        image: redis:7
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 10s
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm ci
      - run: npm run test:unit
      - run: npm run test:integration
      - run: npm run test:e2e

  build:
    needs: [lint, test]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm ci
      - run: npm run build:api
      - run: npm run build:dashboard
      - run: npm run build:pos
      - run: npm run build:agent
      - name: Build Docker images
        run: |
          docker build -t hub-pos/api:${{ github.sha }} -f docker/Dockerfile.api .
          docker build -t hub-pos/dashboard:${{ github.sha }} -f docker/Dockerfile.dashboard .
      - name: Push to registry
        run: |
          echo ${{ secrets.DOCKER_PASSWORD }} | docker login -u ${{ secrets.DOCKER_USERNAME }} --password-stdin
          docker push hub-pos/api:${{ github.sha }}
          docker push hub-pos/dashboard:${{ github.sha }}

  deploy:
    needs: build
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - name: Deploy to production
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.PROD_HOST }}
          username: deploy
          key: ${{ secrets.SSH_KEY }}
          script: |
            cd /opt/hub-pos
            docker-compose pull
            docker-compose up -d --no-deps api
            docker-compose exec api npm run migrate
            docker system prune -f
```

### 11.3 POS App Auto-Update

```javascript
// Electron auto-updater configuration
const { autoUpdater } = require('electron-updater');

autoUpdater.setFeedURL({
  provider: 'generic',
  url: 'https://api.hub.local/updates',
  headers: {
    'X-Terminal-ID': process.env.TERMINAL_ID,
    'X-Terminal-Secret': process.env.TERMINAL_SECRET
  }
});

autoUpdater.autoDownload = false; // Prompt user first
autoUpdater.allowDowngrade = false;

// Check on shift close
autoUpdater.checkForUpdatesAndNotify();

autoUpdater.on('update-available', () => {
  // Show "Update available" toast in POS
  // Apply on next shift close
});
```

---

## 12. Testing Strategy

### 12.1 Test Pyramid

| Layer | Tool | Coverage Target |
|-------|------|----------------|
| Unit | Jest | 80% business logic |
| Integration | Jest + Supertest | All API endpoints |
| E2E | Playwright | Critical user flows |
| Contract | Pact | API consumer/provider |
| Load | k6 | 10,000 orders/day |
| Security | OWASP ZAP | Penetration testing |

### 12.2 Critical Test Scenarios

1. **Offline Order Flow:**
   - Disconnect network → create order → process cash payment → reconnect → verify sync
   - Assert: Order appears in server, no duplicates, revenue correct

2. **Cross-Venue Billing:**
   - Cafe creates cheque with Restaurant A and B orders
   - Process payment → verify Restaurant A and B orders closed
   - Assert: Revenue attributed correctly, no double-billing possible

3. **Menu Publish Propagation:**
   - Manager publishes menu → verify all connected terminals receive within 2 seconds
   - Verify offline terminal receives update on reconnect
   - Assert: Version hash matches, stale menu rejected

4. **Kiosk Lockdown:**
   - Attempt Alt+F4, Ctrl+Alt+Del, right-click
   - Assert: All blocked, watchdog relaunches app

5. **Shift Reconciliation:**
   - Open shift with 1000 EGP float
   - Process 5 cash payments totaling 500 EGP
   - Close shift with 1500 EGP
   - Assert: Expected = 1500, Over/Short = 0

---

## 13. Monitoring & Observability

### 13.1 Metrics

| Metric | Type | Alert Threshold |
|--------|------|----------------|
| API response time | Histogram | P95 > 500ms |
| Order submission rate | Counter | Drop > 50% |
| WebSocket connections | Gauge | Drop > 20% |
| Terminal offline count | Gauge | > 2 terminals |
| Sync queue depth | Gauge | > 100 events |
| Database connections | Gauge | > 80% pool |
| Server CPU | Gauge | > 80% for 5 min |
| Server memory | Gauge | > 90% for 5 min |
| Backup failure | Counter | Any failure |

### 13.2 Logging Standards

```javascript
// Structured logging with Pino
logger.info({
  event: "order_created",
  orderId: "uuid",
  venueId: "uuid",
  terminalId: "uuid",
  cashierId: "uuid",
  total: 150.00,
  itemCount: 3,
  durationMs: 45,
  requestId: "uuid"
});

logger.error({
  event: "sync_failed",
  terminalId: "uuid",
  syncId: "uuid",
  error: "ECONNREFUSED",
  retryCount: 3,
  requestId: "uuid"
});
```

---

## 14. Appendix

### 14.1 Technology Versions

| Component | Version | Rationale |
|-----------|---------|-----------|
| Node.js | 20 LTS | Active LTS, performance |
| PostgreSQL | 16 | JSONB, performance |
| Redis | 7 | Streams, ACLs |
| Electron | 30 | Latest stable |
| React | 18 | Concurrent features |
| Vite | 5 | Fast HMR, build |
| TailwindCSS | 3 | Utility-first |
| Socket.IO | 4 | Rooms, auto-reconnect |
| better-sqlite3 | 9 | Synchronous, fast |
| bcrypt | 5 | Secure hashing |
| Pino | 8 | Structured logging |
| Zod | 3 | Schema validation |

### 14.2 Hardware Specifications

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| CPU | Intel i3 6th gen | Intel i5 8th gen |
| RAM | 4 GB DDR3 | 8 GB DDR4 |
| Storage | 64 GB SSD | 128 GB SSD |
| OS | Windows 10 LTSC / Ubuntu 22.04 | Same |
| Display | 1280x800 | 1920x1080 touchscreen |
| Network | 5 Mbps | Gigabit Ethernet |

### 14.3 Network Requirements

| Requirement | Specification |
|-------------|---------------|
| Local network | Same LAN, wired switch |
| Internet | 5 Mbps up/down per venue |
| Static IPs | Printers and KDS via DHCP reservation |
| Firewall | Terminals → Server IP:443 only |
| Wi-Fi | WPA2/WPA3, dedicated POS SSID |
| Ports | 80 (redirect), 443 (API), 22 (SSH whitelist) |

---

*End of Technical Specification — Version 1.0*
*Confidential — Intended for named recipients only*
