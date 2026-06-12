# Venue POS — Local Agent (standalone microservice)

Offline-first till backend: SQLite cache, sync queue, LAN cluster, printer hooks.  
Runs on **`http://127.0.0.1:3456`**. POS terminals talk to this service only — not directly to the hub API.

This folder is **independent of the Venue_POS monorepo**. Push it to its own GitHub repo and clone on production tills.

---

## Quick start (Windows production till)

### 1. Clone

```powershell
git clone https://github.com/YOUR_ORG/venue-pos-local-agent.git C:\venue-pos-local-agent
cd C:\venue-pos-local-agent
```

### 2. Configure

```powershell
copy .env.example .env
# Edit .env — or use provision.env for the installer:

copy provision.env.example provision.env
# Fill API_URL, TERMINAL_ID, TERMINAL_SECRET, VENUE_ID
```

Creds come from hub dashboard → **Till provisioning → Add terminal**.

### 3. Install (Admin)

**Right-click → Run as administrator:**

```batch
install.bat
```

Or PowerShell (Admin):

```powershell
.\scripts\install.ps1
```

This will:

1. `npm install` + rebuild native modules (bcrypt, better-sqlite3)
2. Install **PM2** + **pm2-windows-startup** globally (if missing)
3. Start `venue-pos-agent` under PM2
4. Register **Windows boot startup** (`pm2 resurrect` on login)

### 4. Verify

```powershell
pm2 status venue-pos-agent
pm2 logs venue-pos-agent
curl http://127.0.0.1:3456/health
```

Reboot the till and confirm the agent comes back: `pm2 status`.

---

## Requirements

| Item | Version |
|------|---------|
| Node.js | **20.x LTS** |
| OS | Windows 10/11 (till) |
| Admin | Required for PM2 startup registration |

---

## Manual run (no PM2)

```bash
npm install
npm run rebuild:native
copy .env.example .env   # edit creds
npm start
```

Dev with auto-reload: `npm run dev`

---

## Layout

```
venue-pos-local-agent/
├── src/                 # Agent source
├── packages/shared/     # Vendored @venue-pos/shared (sync constants)
├── scripts/
│   ├── install.ps1      # PM2 + boot setup
│   ├── uninstall.ps1
│   ├── rebuild-native.mjs
│   ├── health-check.mjs
│   └── purge-local-cache.mjs
├── data/                # SQLite (gitignored)
├── pm2/                 # PM2 state (gitignored, created at install)
├── install.bat          # One-click Windows install
├── .env.example
└── provision.env.example
```

---

## Environment variables

See `.env.example`. Minimum for production:

| Variable | Purpose |
|----------|---------|
| `SERVER_API_URL` | Hub API base URL |
| `TERMINAL_ID` | Till UUID from provisioning |
| `TERMINAL_SECRET` | Till secret (shown once at create) |
| `VENUE_ID` | Venue UUID |
| `SQLITE_PATH` | Local DB path (default `./data/local.db`) |

---

## PM2 commands

```powershell
pm2 status venue-pos-agent
pm2 logs venue-pos-agent
pm2 restart venue-pos-agent
pm2 resurrect
```

Uninstall PM2 registration (keeps files):

```powershell
.\scripts\uninstall.ps1
```

---

## Purge local cache (dev / support)

Clears orders, cheques, sync queue — keeps menu cache:

```bash
npm run purge-cache
```

---

## Sync from Venue_POS monorepo (maintainers)

When the main repo changes `apps/local-agent` or `packages/shared`:

```bash
cd Venue_POS
node scripts/sync-standalone-local-agent.mjs
```

Then commit and push the standalone repo.

---

## POS integration

Point the till POS at this agent:

```
VITE_LOCAL_AGENT_URL=http://127.0.0.1:3456
```

Terminal headers must match `.env` (`TERMINAL_ID`, `TERMINAL_SECRET`).

---

## License

Same as Venue POS monorepo (private / your org terms).
