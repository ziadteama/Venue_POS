# Windows POS deployment (Epic 9)

Scripts for kiosk lockdown, watchdog, and network hardening on **Windows** tills.

## Production POS — single portable `.exe`

`npm run build:pos:win` (or `npm run build:till-bundle:windows` for the full till USB bundle) produces **one file**:

`apps/pos/release/VenuePOS-{version}-portable.exe`

No Node/npm required to **launch** POS — the watchdog still runs under Node. **local-agent** runs under **PM2** + **pm2-windows-startup** (boot). Kiosk shell runs `launch-till.cmd` → PM2 agent + watchdog → portable exe.

## One-click deploy (`deployment/`)

1. Install **Node 20 LTS** on the till.
2. Extract `venue-pos-till-windows-*.zip` to `C:\Venue_POS`.
3. Copy `deployment\provision.env.example` → `deployment\provision.env` and fill creds.
4. Run **`deployment\install-all.bat`** as Administrator.
5. Reboot.

```batch
Expand-Archive .\venue-pos-till-windows-*.zip -DestinationPath C:\Venue_POS
copy C:\Venue_POS\deployment\provision.env.example C:\Venue_POS\deployment\provision.env
C:\Venue_POS\deployment\install-all.bat
```

`install-all.bat` runs: `install-pm2.bat` → `install.bat` → `verify-agent.bat` → `setup-kiosk.bat` → `firewall-lockdown.bat`.

### deployment/*.bat

| Bat | Purpose |
|-----|---------|
| `install-all.bat` | Full till setup (recommended) |
| `install-pm2.bat` | `npm i -g pm2 pm2-windows-startup` |
| `install.bat` | Copy bundle + PM2 agent + `launch-till.cmd` |
| `install-agent.bat` | PM2 agent only (repair / creds) |
| `verify-agent.bat` | `pm2 status` + `/health` check |
| `setup-kiosk.bat` | Kiosk user + shell → `launch-till.cmd` |
| `firewall-lockdown.bat` | Outbound allow-list |
| `rollback-kiosk.bat` | Restore Explorer + remove PM2 agent |

## PowerShell (manual)

```powershell
cd C:\Venue_POS\ops\windows
.\install.ps1 -InstallRoot C:\Venue_POS -ApiUrl "..." -TerminalId "..." -TerminalSecret "..." -VenueId "..."
.\setup-kiosk-user.ps1 -Password "YourSecurePassword" -RepoRoot C:\Venue_POS
.\firewall-lockdown.ps1 -HubServerIp "<api-host-ip>"
```

Verify: `pm2 status venue-pos-agent` · `Invoke-WebRequest http://127.0.0.1:3456/health`

## PM2 details

- **App name:** `venue-pos-agent`
- **PM2_HOME:** `C:\Venue_POS\data\pm2` (machine env)
- **Ecosystem:** `local-agent\ecosystem.config.cjs` (generated at install)
- **Boot:** `pm2-startup install` (pm2-windows-startup)
- **Logs:** `pm2 logs venue-pos-agent`

## Rollback

```batch
deployment\rollback-kiosk.bat
```

Or manually:

```powershell
.\rollback-kiosk.ps1
pm2 delete venue-pos-agent
pm2-startup uninstall
```

## Scripts (ops/windows)

| Script | Purpose |
|--------|---------|
| `install-agent.ps1` | PM2 agent + pm2-windows-startup + `launch-till.cmd` |
| `install.ps1` | Copy USB bundle, native rebuild, calls `install-agent.ps1` |
| `launch-till.cmd` | Boot: PM2 agent → watchdog → portable POS `.exe` |
| `setup-kiosk-user.ps1` | Kiosk user, auto-login, shell → `launch-till.cmd` |
| `install-watchdog.ps1` | NSSM watchdog (optional alternate path) |
| `firewall-lockdown.ps1` | Outbound allow-list |
| `rollback-kiosk.ps1` | Restore Explorer shell |
