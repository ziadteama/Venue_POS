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

Output: `dist/venue-pos-till-<version>.tar.gz` — copy to USB.

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
