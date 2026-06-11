# Ubuntu till deployment (USB bundle)

Deploy Venue POS to an Ubuntu LTS till without DevOps knowledge: copy the USB bundle, run one installer, complete the on-screen wizard.

## Bundle contents

```
venue-pos-till-<version>/
├── local-agent/     # SQLite + offline sync (:3456)
├── pos/             # Electron POS + setup wizard
├── node/            # Bundled Node 20 (linux x64)
└── ops/linux/       # install.sh, systemd, kiosk autostart
```

## Till requirements

- Ubuntu 22.04 or 24.04 LTS (64-bit)
- Node.js **20 LTS** (`curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt install -y nodejs`)
- 2 GB+ RAM
- Static LAN IP (set in router DHCP reservation)
- Outbound HTTPS to your cloud hub API
- Openbox session for `venuepos` user (minimal desktop)

## Install (from USB)

```bash
# Copy bundle from USB to /tmp
cd /tmp/venue-pos-till-*
sudo bash ops/linux/install.sh
sudo reboot
```

On first boot the POS opens the **setup wizard**:

1. Hub API URL (`https://your-hub.onrender.com`)
2. Terminal ID + secret (from dashboard → Settings → Terminals)
3. Printer IP (optional)
4. This till's LAN IP + coordinator toggle
5. Kiosk mode

The wizard writes `pos-config.json` and regenerates `/opt/venue-pos/local-agent/.env`, then restarts the agent.

## Services

| Service | Command |
|---------|---------|
| Agent status | `sudo systemctl status venue-pos-agent` |
| Agent logs | `journalctl -u venue-pos-agent -f` |
| Restart agent | `sudo systemctl restart venue-pos-agent` |

Kiosk POS autostarts via Openbox `~venuepos/.config/autostart/`.

## Firewall

`install.sh` opens:

- Outbound **443** (hub API)
- **3456/tcp** (LAN agent gossip)
- Outbound **9100** (printers)

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
- **Default feed:** [GitHub Releases](https://github.com/ziadteama/Venue_POS/releases) (`ziadteama/Venue_POS`) — tag releases with `v*` and attach `latest-linux.yml` + AppImage (CI/`electron-builder --publish`).
- **Private repo:** set the GitHub PAT in the **setup wizard** (Hub step → GitHub update token), or manually in **`/opt/venue-pos/pos/.env.updater`**:
  ```bash
  sudo nano /opt/venue-pos/pos/.env.updater
  # GH_TOKEN=github_pat_your_fine_grained_token
  sudo chown venuepos:venuepos /opt/venue-pos/pos/.env.updater
  sudo chmod 600 /opt/venue-pos/pos/.env.updater
  sudo reboot
  ```
  Create the token: GitHub → Settings → Developer settings → Fine-grained tokens → **Contents: Read-only** on `Venue_POS`.
- **CI publish:** GitHub Actions → repo **Settings → Secrets → Actions** → `GH_TOKEN` (same PAT or `GITHUB_TOKEN` for workflow releases).
- Override feed: `POS_UPDATE_FEED_URL` (public CDN) or `updateFeedUrl` in `pos-config.json`.
- Till firewall must allow outbound **443** to `github.com` and `api.github.com` (and your Render API).
- Checks after shift close + ~60s after startup; download/install prompts in POS UI.

## Fresh VM smoke checklist

Use a clean Ubuntu 22.04/24.04 VM (2 GB RAM) before rolling out to hardware.

1. **Install** — `sudo bash ops/linux/install.sh` → reboot; `venue-pos-agent` is `active (running)`.
2. **Setup wizard** — hub URL, terminal creds, printer (optional), LAN IP, kiosk; save succeeds and agent restarts.
3. **PIN login** — cashier PIN (`1234` in dev seed) opens menu; terminal header shows configured ID.
4. **Online order** — add item → pay cash → receipt prints or shows success.
5. **Offline** — block outbound HTTPS (or stop cloud API); order still saves locally; queue drains after reconnect.
6. **Feature toggles** — dashboard → Settings → Features: flip a flag (e.g. discounts off); POS reflects change after refresh/reconnect.
7. **Reconfigure** — **Ctrl+Shift+S** → floor manager PIN → setup wizard reopens.

## Related

- [ops/windows/README.md](../windows/README.md) — Windows kiosk (legacy)
- [docs/DEVELOPMENT.md](../../docs/DEVELOPMENT.md) — local dev
