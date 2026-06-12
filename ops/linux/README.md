# Ubuntu till deployment (USB per till)

Deploy Venue POS: copy the Linux-built bundle from CI, run **one command**, reboot, complete the setup wizard.

**Important:** Use the bundle built on **Linux** (GitHub Actions `build-till-bundle` or `npm run build:till-bundle` on Ubuntu). Windows-built bundles skip native compile and AppImage.

## Till requirements

- Ubuntu 22.04 or 24.04 LTS (64-bit)
- 2 GB+ RAM
- Outbound HTTPS to your cloud hub API
- USB ESC/POS receipt printer (optional at install)

## One-click install

```bash
tar -xzf venue-pos-till-*.tar.gz
cd venue-pos-till-*
sudo bash setup.sh
sudo reboot
```

On first boot:

- GDM auto-logs in as **`venuepos`** into a minimal **openbox** session
- **venue-pos-kiosk-display** (system) + openbox autostart launch POS (AppImage)
- **Setup wizard** opens (not PIN) until hub + terminal are configured

### Optional CLI provision (skip wizard)

```bash
sudo bash setup.sh \
  --api-url https://your-hub.onrender.com \
  --terminal-id <uuid> \
  --terminal-secret <secret> \
  --venue-id <uuid>
sudo reboot
```

Create the terminal in the **dev ops dashboard** first: login as `devops` → **Dev ops console** → **Till provisioning** → **Add terminal**. Copy the hub API URL, terminal ID, secret, and venue ID into the till setup wizard (or pass them to `setup.sh` flags below).

## Setup wizard

1. Hub API URL
2. Terminal ID + secret
3. Kitchen printer IP (optional)
4. LAN / coordinator
5. **Test connection** → must pass → **Finish**

If you land on PIN by mistake, tap **Till setup (Manager PIN required)** or press **Ctrl+Shift+S** and enter the Manager PIN (default `0000` on new tills).

### Semi-kiosk — leave POS temporarily

| Action | Shortcut | Code |
|--------|----------|------|
| Minimize POS / use Ubuntu desktop | `Ctrl+Shift+X` | Exit code **`7894`** (hardcoded) |
| Open till setup | `Ctrl+Shift+S` | Manager PIN (default `0000`) |
| IT override (setup/manager PIN gates only) | — | `1547` |

POS runs in **fullscreen** (not OS kiosk mode) so the Ubuntu desktop/taskbar remains accessible once minimized. Maximize or click the POS window from the taskbar to return; POS will snap back to fullscreen automatically.

The exit code `7894` is hardcoded in the Electron main process and is NOT stored in the database or configurable from the hub dashboard.

## Services

| Action | Command |
|--------|---------|
| Agent | `sudo systemctl status venue-pos-agent` |
| Agent logs | `journalctl -u venue-pos-agent -f` |
| Kiosk logs | `tail -f /home/venuepos/.local/share/venue-pos/kiosk.log` |
| Kiosk display service | `sudo systemctl status venue-pos-kiosk-display` |
| Kiosk display logs | `journalctl -u venue-pos-kiosk-display -f` |
| Kiosk user service | `sudo -u venuepos systemctl --user status venue-pos-kiosk` |
| Receipt printer | `sudo bash /opt/venue-pos/ops/linux/setup-receipt-printer.sh` |

## POS does not start after reboot

Usually GDM autologin was not applied or no desktop session was installed. On the till:

```bash
sudo bash /opt/venue-pos/ops/linux/fix-kiosk-boot.sh
sudo reboot
```

If that script is missing (older bundle), copy updated `ops/linux/` from a fresh build, then run it.

Quick checks:

```bash
systemctl get-default                    # graphical.target
grep AutomaticLogin /etc/gdm3/custom.conf
systemctl is-active venue-pos-agent
systemctl is-active venue-pos-kiosk-display
journalctl -u venue-pos-kiosk-display -n 40
```

## Build bundle (dev)

**On Ubuntu / CI (recommended):**

```bash
npm run build:till-bundle
# artifact: dist/venue-pos-till-<version>.tar.gz (includes AppImage)

# Slim USB copy (no node_modules — you run npm i on the till):
SKIP_BUNDLE_NODE_MODULES=1 SKIP_BUNDLE_ZIP=1 npm run build:till-bundle
```

After `sudo bash setup.sh` on a slim bundle:

```bash
cd /opt/venue-pos
npm i
cd local-agent && npm rebuild bcrypt better-sqlite3
sudo systemctl restart venue-pos-agent
sudo reboot
```

**On Windows (dev only — not for production tills):**

```bash
SKIP_BUNDLE_CI=1 SKIP_BUNDLE_ZIP=1 npm run build:till-bundle
# Copy dist/venue-pos-till-* folder to USB; install.sh rebuilds natives on till
```

## Verify checklist

1. `sudo bash setup.sh` exits 0
2. After reboot: `systemctl is-active venue-pos-agent`
3. POS shows **wizard** (not PIN)
4. Wizard test → save → cashier PIN works
5. Drawer + pay-cash (receipt printer)

## Uninstall

```bash
sudo bash /opt/venue-pos/ops/linux/uninstall.sh
```
