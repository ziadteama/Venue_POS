# Venue POS — Till bundle

Linux till package: POS (Electron AppImage) + local-agent + kiosk scripts.

## Primary install — Till Installer AppImage (recommended)

One file installs everything to `/opt/venue-pos` (agent, systemd, kiosk, inner POS AppImage).

**Download:** GitHub Actions artifact `venue-pos-till-linux`, or GitHub Release asset `VenuePOS-Till-Installer-*-x86_64.AppImage`.

```bash
chmod +x VenuePOS-Till-Installer-*.AppImage
./VenuePOS-Till-Installer-*.AppImage
sudo reboot
```

**Headless / SSH:**

```bash
sudo ./VenuePOS-Till-Installer-*.AppImage --no-gui
sudo reboot
```

**Skip wizard (Dev ops terminal credentials):**

```bash
sudo ./VenuePOS-Till-Installer-*.AppImage --no-gui \
  --api-url https://your-hub.onrender.com \
  --terminal-id <uuid> \
  --terminal-secret <secret> \
  --venue-id <uuid>
sudo reboot
```

**Reinstall / upgrade:** `./VenuePOS-Till-Installer-*.AppImage --reinstall`

**Fresh Ubuntu note:** If the AppImage fails to mount, install FUSE first: `sudo apt-get install -y libfuse2`, then re-run the installer.

---

## Build (CI / Ubuntu dev machine)

```bash
npm ci --include-workspace-root
npm run build:till-installer
# Output: dist/VenuePOS-Till-Installer-<version>-x86_64.AppImage
# Also: dist/venue-pos-till-<version>.tar.gz (fallback)
```

**Legacy bundle only:**

```bash
npm run build:till-bundle
# Output: dist/venue-pos-till-<version>.tar.gz
```

**Slim bundle (no node_modules — run npm on till after install):**

```bash
SKIP_BUNDLE_NODE_MODULES=1 npm run build:till-bundle
```

**GitHub Actions:** workflow `Build till bundle (Linux)` → artifact `venue-pos-till-linux` (installer + tar.gz).

**GitHub Releases:** tag `v*` publishes Till Installer (new tills) + inner POS AppImage (electron-updater feed).

---

## Fallback install — tar.gz bundle

```bash
tar -xzf venue-pos-till-*.tar.gz
cd venue-pos-till-*
sudo bash setup.sh
sudo reboot
```

Create the terminal first: hub **Dev ops** → **Till provisioning** → **Add terminal**.

**Slim bundle only — after `setup.sh`:**

```bash
cd /opt/venue-pos
npm i
cd local-agent && npm rebuild bcrypt better-sqlite3
sudo systemctl restart venue-pos-agent
sudo reboot
```

---

## Hub API migration (before tills sync Manager PIN)

On the server / Render deploy:

```bash
npm run migrate
```

---

## First boot — setup wizard

1. Hub API URL  
2. Terminal ID + secret  
3. Kitchen printer (optional)  
4. LAN / coordinator + **Manager PIN** (default `0000`)  
5. **Test connection** → **Finish**

---

## Kiosk — Manager PIN

| Action | Shortcut | PIN |
|--------|----------|-----|
| Minimize POS / use Ubuntu | `Ctrl+Shift+X` | Manager PIN (default `0000`) |
| Open till setup | `Ctrl+Shift+S` | Manager PIN |
| IT override (any privileged PIN) | — | `1547` |

- **Manager PIN** is set per till in hub **Settings → Terminals → Change PIN**.
- After minimize: use **taskbar (lxpanel)** or Alt+Tab, then **maximize POS** to return to fullscreen kiosk.
- No bypass in kiosk mode without a valid PIN.

---

## Service commands

```bash
# Agent
sudo systemctl status venue-pos-agent
journalctl -u venue-pos-agent -f

# Kiosk / POS
sudo systemctl status venue-pos-kiosk-display
journalctl -u venue-pos-kiosk-display -f
tail -f /home/venuepos/.local/share/venue-pos/kiosk.log
sudo -u venuepos systemctl --user status venue-pos-kiosk

# Receipt printer (USB ESC/POS)
sudo bash /opt/venue-pos/ops/linux/setup-receipt-printer.sh
```

---

## POS not starting after reboot

```bash
sudo bash /opt/venue-pos/ops/linux/fix-kiosk-boot.sh
sudo reboot
```

Quick checks:

```bash
systemctl get-default
grep AutomaticLogin /etc/gdm3/custom.conf
systemctl is-active venue-pos-agent
systemctl is-active venue-pos-kiosk-display
journalctl -u venue-pos-kiosk-display -n 40
```

---

## Verify checklist

1. Installer or `setup.sh` exits 0  
2. After reboot: `systemctl is-active venue-pos-agent`  
3. Setup wizard opens (not PIN login)  
4. Wizard test → save → cashier PIN login works  
5. `Ctrl+Shift+X` + Manager PIN `0000` → POS minimizes, Ubuntu usable  
6. Maximize POS → fullscreen kiosk returns  
7. Hub **Settings → Terminals** → change Manager PIN → till picks up after online sync  

---

## Uninstall

```bash
sudo bash /opt/venue-pos/ops/linux/uninstall.sh
```

More detail: `ops/linux/README.md` after install at `/opt/venue-pos/ops/linux/README.md`.
