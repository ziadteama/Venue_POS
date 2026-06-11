# Windows POS deployment (Epic 9)

Scripts for kiosk lockdown, watchdog, and network hardening on **Windows** tills.

## Order of operations

1. Install Node 20 LTS and clone the repo on the till.
2. `npm ci` from repo root; `npm run setup:node20` if needed.
3. Configure `apps/pos/.env` and `apps/local-agent/.env` (terminal ID, secrets).
4. **Kiosk user + shell** — `setup-kiosk-user.ps1` (auto-login, Explorer replaced by watchdog).
5. **Watchdog service (optional)** — `install-watchdog.ps1` if not using shell replacement, or for coordinator-only hosts.
6. **Firewall** — `firewall-lockdown.ps1` with hub server IP.
7. **BIOS / hardware** — see [Hardware security (US-9.3)](#hardware-security-us-93) below.
8. Reboot and verify POS launches fullscreen with no desktop access.

## Rollback

```powershell
.\rollback-kiosk.ps1
nssm stop VenuePosWatchdog
nssm remove VenuePosWatchdog confirm
```

Restore `Winlogon\Shell` to `explorer.exe` if setup script was not rolled back.

## Scripts

| Script | Story | Purpose |
|--------|-------|---------|
| `setup-kiosk-user.ps1` | US-9.1 | Restricted user, auto-login, shell → watchdog, Task Manager / Run blocked |
| `install-watchdog.ps1` | US-9.2 | NSSM Windows Service (auto-start on boot) |
| `firewall-lockdown.ps1` | US-9.3 | Outbound allow-list: hub HTTPS + LAN agent + printers |
| `rollback-kiosk.ps1` | — | Restore Explorer shell and policy keys |

### Dev (no kiosk shell)

```powershell
cd Z:\Plegmo\Venue_POS
$env:WATCHDOG_POS_COMMAND="npm run electron:dev -w @venue-pos/pos"
$env:ELECTRON_IS_KIOSK="true"
npm run start -w @venue-pos/watchdog
```

### Production kiosk (shell replacement)

```powershell
.\setup-kiosk-user.ps1 -Password "YourSecurePassword"
# Reboot — kiosk user auto-logs in, watchdog spawns POS
```

### NSSM service (alternative boot path)

```powershell
.\install-watchdog.ps1 -RepoRoot "C:\Venue_POS" -KioskUser ".\VenuePosKiosk" -KioskPassword "YourSecurePassword"
```

GUI POS **must** run in the kiosk user session. Set `-KioskUser` when using NSSM for Electron.

## Group Policy (domain-joined tills)

| Registry / policy | GP path | Effect |
|-------------------|---------|--------|
| `DisableTaskMgr` | User Config → Admin Templates → System → Ctrl+Alt+Del Options | Block Task Manager |
| `NoRun` | User Config → Admin Templates → Start Menu and Taskbar | Block Run dialog |
| `Shell` | Custom logon script or `UserInitMprLogonScript` | Launch watchdog instead of Explorer |
| USB storage deny | Computer Config → Admin Templates → System → Removable Storage Access | Block USB disks |

Use `setup-kiosk-user.ps1` on standalone tills; mirror the same keys via GPO in Active Directory.

## Hardware security (US-9.3)

Manual steps per till (document in site runbook):

### BIOS

- Set a **supervisor/BIOS password**.
- Lock **boot order**: internal disk first; disable USB/CD boot or set boot password.
- Disable **network boot** unless required for imaging only.

### USB

- Disable **autorun/autoplay** (Windows: Settings → Devices → AutoPlay off; GPO `Turn off Autoplay`).
- Block external storage: GPO **Removable Disks: Deny read/write** or registry `Deny_All` under `HKLM\SOFTWARE\Policies\Microsoft\Windows\RemovableStorageDevices`.

### Receipt printer + cash drawer (USB)

1. Connect **USB Type B** from the till to the ESC/POS receipt printer.
2. Connect the **RJ11** cash drawer cable to the printer kick/DK port.
3. In Windows **Settings → Printers**, confirm the USB printer appears (Generic / Text Only or vendor ESC/POS driver).
4. Optional override: set `RECEIPT_PRINTER_NAME` in `apps/local-agent/.env`.
5. Wizard writes `RECEIPT_PRINTER_MODE=windows` and `FEATURE_CASH_DRAWER=true` into agent `.env`.

**Verify after install:**

- Open shift — drawer must **not** auto-open.
- Tap **Drawer** in the POS header (shift open) — drawer opens with no PIN.
- **Pay (cash)** — receipt prints and drawer opens.
- **Pay (card only)** — receipt prints; drawer stays closed.

Kitchen printer remains **LAN IP** (`KITCHEN_PRINTER_HOST`); receipt USB does not need a firewall rule.

### Network

- Run `firewall-lockdown.ps1 -HubServerIp <api-ip> -PrinterIps "192.168.1.50"` (kitchen printer IPs only).
- Hub API: **HTTPS only** (port 443) to server IP.
- LAN: allow TCP **3456** for local-agent / coordinator gossip.
- No general outbound HTTP/HTTPS to the internet.

### DHCP

- Reserve static leases for: each POS till, kitchen printer, receipt printer, KDS screens.
- Document MAC → IP in hub IT inventory.

## Watchdog env vars

See `apps/watchdog/.env.example` and `docs/TechSpec.md` § Watchdog.

| Variable | Default | Purpose |
|----------|---------|---------|
| `WATCHDOG_ENABLED` | true | Master switch |
| `WATCHDOG_CHECK_INTERVAL_MS` | 5000 | Poll interval |
| `WATCHDOG_MAX_RESTARTS` | 3 | Alert threshold in window |
| `WATCHDOG_RESTART_WINDOW_MS` | 600000 | 10-minute sliding window |
| `WATCHDOG_LOG_FILE` | `logs/watchdog.log` | Append-only event log |
| `WATCHDOG_POS_COMMAND` | npm electron:dev | Command to spawn POS |

## Related docs

- [docs/DEVELOPMENT.md](../../docs/DEVELOPMENT.md) — NSSM for coordinator `local-agent`
- [docs/PRD.md](../../docs/PRD.md) — Epic 9 acceptance criteria
- [apps/pos/electron/main.cjs](../../apps/pos/electron/main.cjs) — Electron kiosk hardening
