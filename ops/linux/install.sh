#!/usr/bin/env bash
# Venue POS till — one-click Ubuntu installer. Run from USB bundle root as root.
# Usage: sudo bash setup.sh
#    or: sudo bash ops/linux/install.sh
set -euo pipefail

INSTALL_ROOT="/opt/venue-pos"
USER_NAME="venuepos"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUNDLE_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run as root: sudo bash setup.sh"
  exit 1
fi

if [[ ! -d "${BUNDLE_ROOT}/local-agent" || ! -d "${BUNDLE_ROOT}/pos" ]]; then
  echo "Bundle layout invalid. Expected local-agent/ and pos/ at bundle root (${BUNDLE_ROOT})"
  exit 1
fi

install_node20() {
  if command -v node &>/dev/null; then
    local major
    major="$(node -p "process.versions.node.split('.')[0]")"
    if [[ "${major}" -ge 20 ]]; then
      echo "==> Node $(node -v) OK"
      return 0
    fi
    echo "==> Node $(node -v) found but 20+ required — installing Node 20 LTS"
  else
    echo "==> Installing Node.js 20 LTS"
  fi
  if ! command -v apt-get &>/dev/null; then
    echo "Install Node 20 manually — see ops/linux/README.md"
    exit 1
  fi
  apt-get update -qq
  apt-get install -y ca-certificates curl gnupg
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
  echo "    Node $(node -v)"
}

install_packages() {
  if ! command -v apt-get &>/dev/null; then
    return 0
  fi
  echo "==> System packages (CUPS, Openbox, kiosk GUI)"
  DEBIAN_FRONTEND=noninteractive apt-get install -y \
    build-essential python3 rsync cups cups-client \
    lightdm openbox xorg xinit x11-xserver-utils dbus-x11 \
    libnss3 libnspr4 libatk1.0-0t64 libatk-bridge2.0-0t64 libcups2t64 libdrm2 \
    libgtk-3-0t64 libgbm1 libasound2t64 libxcomposite1 libxdamage1 libxfixes3 \
    libxrandr2 libxkbcommon0 libpango-1.0-0 libcairo2 libx11-xcb1 libxcb1 \
    libxext6 libxshmfence1 2>/dev/null \
    || DEBIAN_FRONTEND=noninteractive apt-get install -y \
      build-essential python3 rsync cups cups-client \
      lightdm openbox xorg xinit x11-xserver-utils dbus-x11 \
      libnss3 libnspr4 libgtk-3-0 libgbm1 libasound2
}

configure_display_autologin() {
  echo "==> Kiosk autologin (${USER_NAME} → Openbox → POS)"
  mkdir -p "/home/${USER_NAME}/.config/openbox"
  cat > "/home/${USER_NAME}/.xsession" <<'XSESS'
#!/bin/sh
exec openbox-session
XSESS
  chmod +x "/home/${USER_NAME}/.xsession"

  mkdir -p "/home/${USER_NAME}/.config/openbox"
  if ! grep -q start-kiosk.sh "/home/${USER_NAME}/.config/openbox/autostart" 2>/dev/null; then
    echo '/opt/venue-pos/pos/start-kiosk.sh &' >> "/home/${USER_NAME}/.config/openbox/autostart"
  fi

  if [[ -d /etc/lightdm/lightdm.conf.d ]]; then
    cat > /etc/lightdm/lightdm.conf.d/50-venue-pos-kiosk.conf <<EOF
[Seat:*]
autologin-user=${USER_NAME}
autologin-user-timeout=0
user-session=openbox
greeter-session=lightdm-gtk-greeter
EOF
  fi

  if [[ -f /etc/gdm3/custom.conf ]]; then
    if ! grep -q "^AutomaticLogin=${USER_NAME}" /etc/gdm3/custom.conf 2>/dev/null; then
      sed -i '/^\[daemon\]/a AutomaticLogin='"${USER_NAME}"'\nAutomaticLoginEnable=true' /etc/gdm3/custom.conf 2>/dev/null || true
    fi
  fi
}

install_node20
install_packages

echo "==> Creating user ${USER_NAME}"
if ! id "${USER_NAME}" &>/dev/null; then
  useradd --create-home --home-dir "/home/${USER_NAME}" --shell /bin/bash "${USER_NAME}"
else
  usermod -s /bin/bash "${USER_NAME}" 2>/dev/null || true
fi
usermod -aG lp,plugdev "${USER_NAME}" 2>/dev/null || true

echo "==> Installing to ${INSTALL_ROOT}"
mkdir -p "${INSTALL_ROOT}"
rsync -a --delete "${BUNDLE_ROOT}/local-agent/" "${INSTALL_ROOT}/local-agent/"
rsync -a --delete "${BUNDLE_ROOT}/pos/" "${INSTALL_ROOT}/pos/"
rsync -a --delete "${BUNDLE_ROOT}/watchdog/" "${INSTALL_ROOT}/watchdog/" 2>/dev/null || true
rsync -a --delete "${BUNDLE_ROOT}/ops/" "${INSTALL_ROOT}/ops/"
if [[ -d "${BUNDLE_ROOT}/node_modules" ]]; then
  rsync -a --delete "${BUNDLE_ROOT}/node_modules/" "${INSTALL_ROOT}/node_modules/"
fi
if [[ -d "${BUNDLE_ROOT}/packages" ]]; then
  rsync -a --delete "${BUNDLE_ROOT}/packages/" "${INSTALL_ROOT}/packages/"
fi
if [[ -f "${BUNDLE_ROOT}/package.json" ]]; then
  cp -f "${BUNDLE_ROOT}/package.json" "${INSTALL_ROOT}/package.json"
fi
if [[ -f "${BUNDLE_ROOT}/setup.sh" ]]; then
  cp -f "${BUNDLE_ROOT}/setup.sh" "${INSTALL_ROOT}/setup.sh"
  chmod +x "${INSTALL_ROOT}/setup.sh"
fi

chmod +x "${INSTALL_ROOT}/ops/linux/"*.sh 2>/dev/null || true
cp -f "${SCRIPT_DIR}/start-kiosk.sh" "${INSTALL_ROOT}/pos/start-kiosk.sh"
chmod +x "${INSTALL_ROOT}/pos/start-kiosk.sh"

chown -R "${USER_NAME}:${USER_NAME}" "${INSTALL_ROOT}"
chown -R "${USER_NAME}:${USER_NAME}" "/home/${USER_NAME}"

echo "==> Rebuilding native modules for Linux (bcrypt, better-sqlite3)"
find "${INSTALL_ROOT}/node_modules" "${INSTALL_ROOT}/local-agent/node_modules" \
  -type f \( -path '*/.bin/*' -o -name 'node-pre-gyp' -o -name 'node-gyp-build' \) \
  -exec chmod +x {} + 2>/dev/null || true
sudo -u "${USER_NAME}" bash -lc "cd '${INSTALL_ROOT}/local-agent' && npm rebuild bcrypt better-sqlite3" || true
sudo -u "${USER_NAME}" bash -lc "cd '${INSTALL_ROOT}' && npm rebuild bcrypt better-sqlite3" 2>/dev/null || true
if [[ -f "${INSTALL_ROOT}/pos/node_modules/electron/install.js" ]]; then
  echo "==> Downloading Linux Electron binary for POS kiosk"
  sudo -u "${USER_NAME}" bash -lc "cd '${INSTALL_ROOT}/pos/node_modules/electron' && node install.js" || true
fi
find "${INSTALL_ROOT}/pos/node_modules/.bin" -type f -exec chmod +x {} + 2>/dev/null || true
chown -R "${USER_NAME}:${USER_NAME}" "${INSTALL_ROOT}"

echo "==> USB receipt printer (CUPS)"
bash "${INSTALL_ROOT}/ops/linux/setup-receipt-printer.sh" "${INSTALL_ROOT}"

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

echo "==> Kiosk autostart"
mkdir -p "/home/${USER_NAME}/.config/autostart"
cp -f "${SCRIPT_DIR}/venue-pos-kiosk.desktop" "/home/${USER_NAME}/.config/autostart/venue-pos-kiosk.desktop"
configure_display_autologin
chown -R "${USER_NAME}:${USER_NAME}" "/home/${USER_NAME}/.config"
chown "${USER_NAME}:${USER_NAME}" "/home/${USER_NAME}/.xsession" 2>/dev/null || true

echo "==> Firewall (ufw) — allow hub HTTPS, LAN agent, printers"
if command -v ufw &>/dev/null; then
  ufw allow out 443/tcp comment 'Venue POS hub HTTPS' || true
  ufw allow 3456/tcp comment 'Venue POS LAN agent' || true
  ufw allow out 9100/tcp comment 'ESC/POS printers' || true
fi

cat <<EOF

╔══════════════════════════════════════════════════════════════╗
║  Venue POS install complete                                  ║
╚══════════════════════════════════════════════════════════════╝

Next:
  1. Plug in USB receipt printer (if not already) — then optionally:
       sudo bash ${INSTALL_ROOT}/ops/linux/setup-receipt-printer.sh
  2. Reboot:  sudo reboot
  3. POS opens automatically — complete the on-screen setup wizard
     (hub URL, terminal ID + secret from dashboard → Settings → Terminals)
  4. Cashier PIN login

Agent:  sudo systemctl status venue-pos-agent
Logs:   journalctl -u venue-pos-agent -f

EOF
