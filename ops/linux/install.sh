#!/usr/bin/env bash
# Venue POS till installer — run from USB bundle root as root.
# Usage: sudo bash install.sh
set -euo pipefail

INSTALL_ROOT="/opt/venue-pos"
USER_NAME="venuepos"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUNDLE_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run as root: sudo bash install.sh"
  exit 1
fi

if ! command -v node &>/dev/null; then
  echo "Node.js is required (20 LTS). Install via NodeSource — see ops/linux/README.md"
  exit 1
fi

NODE_MAJOR="$(node -p "process.versions.node.split('.')[0]")"
if [[ "${NODE_MAJOR}" -lt 20 ]]; then
  echo "Node 20+ required (found $(node -v)). See ops/linux/README.md"
  exit 1
fi

echo "==> Electron / kiosk GUI libraries"
if command -v apt-get &>/dev/null; then
  apt-get install -y \
    libnss3 libnspr4 libatk1.0-0t64 libatk-bridge2.0-0t64 libcups2t64 libdrm2 \
    libgtk-3-0t64 libgbm1 libasound2t64 libxcomposite1 libxdamage1 libxfixes3 \
    libxrandr2 libxkbcommon0 libpango-1.0-0 libcairo2 libx11-xcb1 libxcb1 \
    libxext6 libxshmfence1 2>/dev/null \
    || apt-get install -y libnss3 libnspr4 libgtk-3-0 libgbm1 libasound2
fi

if [[ ! -d "${BUNDLE_ROOT}/local-agent" || ! -d "${BUNDLE_ROOT}/pos" ]]; then
  echo "Bundle layout invalid. Expected local-agent/ and pos/ next to ops/linux/"
  exit 1
fi

echo "==> Creating user ${USER_NAME}"
if ! id "${USER_NAME}" &>/dev/null; then
  useradd --system --create-home --home-dir "/home/${USER_NAME}" --shell /usr/sbin/nologin "${USER_NAME}"
fi

echo "==> Installing to ${INSTALL_ROOT}"
mkdir -p "${INSTALL_ROOT}"
rsync -a --delete "${BUNDLE_ROOT}/local-agent/" "${INSTALL_ROOT}/local-agent/"
rsync -a --delete "${BUNDLE_ROOT}/pos/" "${INSTALL_ROOT}/pos/"
rsync -a --delete "${BUNDLE_ROOT}/ops/" "${INSTALL_ROOT}/ops/"
if [[ -d "${BUNDLE_ROOT}/node_modules" ]]; then
  rsync -a --delete "${BUNDLE_ROOT}/node_modules/" "${INSTALL_ROOT}/node_modules/"
fi
if [[ -d "${BUNDLE_ROOT}/packages" ]]; then
  rsync -a --delete "${BUNDLE_ROOT}/packages/" "${INSTALL_ROOT}/packages/"
fi
chmod +x "${INSTALL_ROOT}/ops/linux/start-kiosk.sh" 2>/dev/null || true
cp -f "${SCRIPT_DIR}/start-kiosk.sh" "${INSTALL_ROOT}/pos/start-kiosk.sh"
chmod +x "${INSTALL_ROOT}/pos/start-kiosk.sh"

chown -R "${USER_NAME}:${USER_NAME}" "${INSTALL_ROOT}"

echo "==> Rebuilding native modules for Linux (bcrypt, better-sqlite3)"
if ! command -v g++ &>/dev/null; then
  echo "    Install build-essential if rebuild fails: apt install -y build-essential python3"
fi
find "${INSTALL_ROOT}/node_modules" "${INSTALL_ROOT}/local-agent/node_modules" \
  -type f \( -path '*/.bin/*' -o -name 'node-pre-gyp' -o -name 'node-gyp-build' \) \
  -exec chmod +x {} + 2>/dev/null || true
sudo -u "${USER_NAME}" bash -lc "cd '${INSTALL_ROOT}/local-agent' && npm rebuild bcrypt better-sqlite3" || true
sudo -u "${USER_NAME}" bash -lc "cd '${INSTALL_ROOT}' && npm rebuild bcrypt better-sqlite3" || true
if [[ -f "${INSTALL_ROOT}/pos/node_modules/electron/install.js" ]]; then
  echo "==> Downloading Linux Electron binary for POS kiosk"
  sudo -u "${USER_NAME}" bash -lc "cd '${INSTALL_ROOT}/pos/node_modules/electron' && node install.js" || true
fi
find "${INSTALL_ROOT}/pos/node_modules/.bin" -type f -exec chmod +x {} + 2>/dev/null || true
chown -R "${USER_NAME}:${USER_NAME}" "${INSTALL_ROOT}"

echo "==> Updater token template (private GitHub releases)"
UPDATER_ENV="${INSTALL_ROOT}/pos/.env.updater"
if [[ ! -f "${UPDATER_ENV}" && -f "${SCRIPT_DIR}/.env.updater.example" ]]; then
  cp -f "${SCRIPT_DIR}/.env.updater.example" "${UPDATER_ENV}"
  chown "${USER_NAME}:${USER_NAME}" "${UPDATER_ENV}"
  chmod 600 "${UPDATER_ENV}"
fi

echo "==> Registering systemd service"
cp -f "${SCRIPT_DIR}/venue-pos-agent.service" /etc/systemd/system/venue-pos-agent.service
systemctl daemon-reload
systemctl enable venue-pos-agent
systemctl restart venue-pos-agent

echo "==> Kiosk autostart (Openbox)"
mkdir -p "/home/${USER_NAME}/.config/autostart"
cp -f "${SCRIPT_DIR}/venue-pos-kiosk.desktop" "/home/${USER_NAME}/.config/autostart/venue-pos-kiosk.desktop"
chown -R "${USER_NAME}:${USER_NAME}" "/home/${USER_NAME}/.config"

echo "==> Firewall (ufw) — allow hub HTTPS, LAN agent, printers"
if command -v ufw &>/dev/null; then
  ufw allow out 443/tcp comment 'Venue POS hub HTTPS' || true
  ufw allow 3456/tcp comment 'Venue POS LAN agent' || true
  ufw allow out 9100/tcp comment 'ESC/POS printers' || true
fi

cat <<'EOF'

Install complete.

Next steps:
1. Reboot (or log in as venuepos with Openbox session)
2. Edit /opt/venue-pos/pos/.env.updater — set GH_TOKEN for private GitHub releases
3. Complete the on-screen setup wizard (hub URL, terminal ID/secret)
4. Verify agent: systemctl status venue-pos-agent

Hub API must be reachable over HTTPS before PIN login works online.

EOF
