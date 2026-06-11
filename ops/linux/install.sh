#!/usr/bin/env bash
# Venue POS till installer — run from USB bundle root as root.
# Usage: sudo bash install.sh
set -euo pipefail

INSTALL_ROOT="/opt/venue-pos"
USER_NAME="venuepos"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUNDLE_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

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
2. Complete the on-screen setup wizard (hub URL, terminal ID/secret)
3. Verify agent: systemctl status venue-pos-agent

Hub API must be reachable over HTTPS before PIN login works online.

EOF
