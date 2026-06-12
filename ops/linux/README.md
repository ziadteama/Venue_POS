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

- GDM auto-logs in as **`venuepos`**
- **systemd user service** starts POS (AppImage)
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

Create the terminal in dashboard → **Settings → Terminals** first.

## Setup wizard

1. Hub API URL
2. Terminal ID + secret
3. Kitchen printer IP (optional)
4. LAN / coordinator
5. **Test connection** → must pass → **Finish**

If you land on PIN by mistake, tap **Till setup** or press **Ctrl+Shift+S** → **Open till setup (no PIN)** when no manager roster is cached.

## Services

| Action | Command |
|--------|---------|
| Agent | `sudo systemctl status venue-pos-agent` |
| Agent logs | `journalctl -u venue-pos-agent -f` |
| Kiosk logs | `tail -f /home/venuepos/.local/share/venue-pos/kiosk.log` |
| Kiosk service | `sudo -u venuepos systemctl --user status venue-pos-kiosk` |
| Receipt printer | `sudo bash /opt/venue-pos/ops/linux/setup-receipt-printer.sh` |

## Build bundle (dev)

**On Ubuntu / CI (recommended):**

```bash
npm run build:till-bundle
# artifact: dist/venue-pos-till-<version>.tar.gz (includes AppImage)
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
