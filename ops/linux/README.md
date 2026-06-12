# Ubuntu till deployment (one-click)

Deploy Venue POS to an Ubuntu LTS till: copy the USB bundle, run **one command**, reboot, complete the on-screen wizard.

## Till requirements

- Ubuntu 22.04 or 24.04 LTS (64-bit)
- 2 GB+ RAM
- Static LAN IP (router DHCP reservation recommended)
- Outbound HTTPS to your cloud hub API
- USB ESC/POS receipt printer (e.g. Elgin ELR-160) — plug in before or during install

## One-click install (from USB)

```bash
# 1. Copy/extract bundle to the till (e.g. from USB)
cd /tmp/venue-pos-till-*
# 2. One command — installs Node 20, CUPS, agent service, kiosk autologin
sudo bash setup.sh
# 3. Reboot
sudo reboot
```

On first boot the POS opens automatically. Complete the **setup wizard**:

1. Hub API URL (`https://your-hub.onrender.com`)
2. Terminal ID + secret (dashboard → Settings → Terminals)
3. Kitchen printer IP (optional)
4. Till LAN IP + coordinator toggle
5. Save — agent restarts, cashier PIN login works

### USB receipt printer + cash drawer

`setup.sh` runs `setup-receipt-printer.sh`, which:

- Enables CUPS
- Detects USB/serial ESC/POS printer via `lpinfo`
- Creates raw queue **`VenueReceipt`**
- Writes `RECEIPT_PRINTER_MODE=cups` into `local-agent/.env`

If the printer was plugged in **after** install:

```bash
sudo bash /opt/venue-pos/ops/linux/setup-receipt-printer.sh
sudo systemctl restart venue-pos-agent
```

Cash drawer: RJ11 → printer kick port. Test **Drawer** button and pay-cash on POS.

## Bundle contents

```
venue-pos-till-<version>/
├── setup.sh         # ← run this
├── local-agent/     # SQLite + offline sync (:3456)
├── pos/             # Electron POS + setup wizard
├── watchdog/        # optional process watchdog
└── ops/linux/       # install.sh, systemd, CUPS helper
```

## Services

| Action | Command |
|--------|---------|
| Agent status | `sudo systemctl status venue-pos-agent` |
| Agent logs | `journalctl -u venue-pos-agent -f` |
| Restart agent | `sudo systemctl restart venue-pos-agent` |
| Re-run printer setup | `sudo bash /opt/venue-pos/ops/linux/setup-receipt-printer.sh` |

Kiosk POS autostarts via Openbox (`venuepos` user, lightdm/GDM autologin).

## Firewall

`install.sh` opens (ufw if present):

- Outbound **443** (hub API)
- **3456/tcp** (LAN agent)
- Outbound **9100** (network printers)

## Reconfigure after deploy

Hold **Ctrl+Shift+S** on PIN screen, enter floor manager PIN, or delete config:

```bash
sudo rm /home/venuepos/.config/Electron/pos-config.json
sudo reboot
```

## Uninstall

```bash
sudo bash /opt/venue-pos/ops/linux/uninstall.sh
```

## Build bundle (dev machine)

```bash
npm run build:till-bundle
```

On **Linux** (or `BUILD_POS_APPIMAGE=1`), the bundle also includes a packaged **AppImage** under `pos/release/` for `electron-updater`.

Output: `dist/venue-pos-till-<version>.tar.gz` — copy to USB.

### Remote updates (electron-updater)

- Packaged AppImage only (`app.isPackaged`); dev/USB raw electron skips updater.
- **Default feed:** [GitHub Releases](https://github.com/ziadteama/Venue_POS/releases)
- **Private repo:** GitHub PAT in setup wizard or `/opt/venue-pos/pos/.env.updater` (`GH_TOKEN=…`)

## Verify checklist

1. `sudo systemctl status venue-pos-agent` — active
2. Setup wizard saves (API + terminal test OK)
3. Cashier PIN login
4. Open shift → **Drawer** → pay cash (receipt + drawer)
