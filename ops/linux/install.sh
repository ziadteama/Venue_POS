#!/usr/bin/env bash
# Venue POS till — one-click Ubuntu installer. Run from USB bundle root as root.
# Usage: sudo bash setup.sh [--api-url URL --terminal-id UUID --terminal-secret SECRET [--venue-id UUID]]
set -euo pipefail

INSTALL_ROOT="/opt/venue-pos"
USER_NAME="venuepos"
STATE_DIR="/var/lib/venue-pos"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUNDLE_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

CLI_API_URL=""
CLI_TERMINAL_ID=""
CLI_TERMINAL_SECRET=""
CLI_VENUE_ID=""
MINIMAL_KIOSK=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --api-url) CLI_API_URL="${2:-}"; shift 2 ;;
    --terminal-id) CLI_TERMINAL_ID="${2:-}"; shift 2 ;;
    --terminal-secret) CLI_TERMINAL_SECRET="${2:-}"; shift 2 ;;
    --venue-id) CLI_VENUE_ID="${2:-}"; shift 2 ;;
    --minimal-kiosk) MINIMAL_KIOSK=true; shift ;;
    -h|--help)
      echo "Usage: sudo bash setup.sh [--api-url URL --terminal-id UUID --terminal-secret SECRET [--venue-id UUID]]"
      exit 0
      ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run as root: sudo bash setup.sh"
  exit 1
fi

if [[ ! -d "${BUNDLE_ROOT}/local-agent" || ! -d "${BUNDLE_ROOT}/pos" ]]; then
  echo "Bundle layout invalid. Expected local-agent/ and pos/ at bundle root (${BUNDLE_ROOT})"
  exit 1
fi

if [[ -n "${CLI_API_URL}" || -n "${CLI_TERMINAL_ID}" || -n "${CLI_TERMINAL_SECRET}" ]]; then
  if [[ -z "${CLI_API_URL}" || -z "${CLI_TERMINAL_ID}" || -z "${CLI_TERMINAL_SECRET}" ]]; then
    echo "CLI provision requires --api-url, --terminal-id, and --terminal-secret together"
    exit 1
  fi
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
  echo "==> System packages (CUPS, GDM, Xorg, openbox kiosk session)"
  local gui_pkgs="gdm3 xorg openbox lxpanel x11-utils dbus-x11"
  if [[ "${MINIMAL_KIOSK}" == true ]]; then
    gui_pkgs="lightdm openbox lxpanel xorg xinit x11-utils dbus-x11"
  fi
  DEBIAN_FRONTEND=noninteractive apt-get install -y \
    build-essential python3 rsync cups cups-client curl \
    ${gui_pkgs} \
    libnss3 libnspr4 libatk1.0-0t64 libatk-bridge2.0-0t64 libcups2t64 libdrm2 \
    libgtk-3-0t64 libgbm1 libasound2t64 libxcomposite1 libxdamage1 libxfixes3 \
    libxrandr2 libxkbcommon0 libpango-1.0-0 libcairo2 libx11-xcb1 libxcb1 \
    libxext6 libxshmfence1 2>/dev/null \
    || DEBIAN_FRONTEND=noninteractive apt-get install -y \
      build-essential python3 rsync cups cups-client curl \
      ${gui_pkgs} \
      libnss3 libnspr4 libgtk-3-0 libgbm1 libasound2
}

fresh_install_hygiene() {
  echo "==> Fresh-install hygiene (clear stale POS config)"
  mkdir -p "${STATE_DIR}"
  touch "${STATE_DIR}/needs-wizard"
  rm -f /home/${USER_NAME}/.config/Venue\ POS/pos-config.json
  rm -f /home/${USER_NAME}/.config/venue-pos/pos-config.json
  rm -f /home/${USER_NAME}/.config/Electron/pos-config.json
  find /home/${USER_NAME}/.config -name 'pos-config.json' -delete 2>/dev/null || true
}

smoke_test() {
  echo "==> Post-install smoke test"
  local ok=true
  if ! systemctl is-active --quiet venue-pos-agent; then
    echo "    FAIL: venue-pos-agent not active"
    ok=false
  else
    echo "    OK: venue-pos-agent active"
  fi
  if compgen -G "${INSTALL_ROOT}/pos/release/*.AppImage" > /dev/null; then
    local img
    img="$(ls -1 "${INSTALL_ROOT}/pos/release/"*.AppImage | head -1)"
    if [[ -x "${img}" ]]; then
      echo "    OK: AppImage present (${img})"
    else
      echo "    WARN: AppImage not executable — chmod +x on till"
    fi
  else
    echo "    WARN: No AppImage — build bundle on Linux for production auto-update"
  fi
  if curl -sf --max-time 5 http://127.0.0.1:3456/health >/dev/null 2>&1; then
    echo "    OK: agent /health"
  else
    echo "    WARN: agent /health not reachable yet (may need terminal .env)"
  fi
  if [[ "${ok}" != true ]]; then
    echo "Smoke test reported failures — check journalctl -u venue-pos-agent"
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

fresh_install_hygiene

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
if compgen -G "${INSTALL_ROOT}/pos/release/*.AppImage" > /dev/null; then
  chmod +x "${INSTALL_ROOT}/pos/release/"*.AppImage 2>/dev/null || true
fi

chown -R "${USER_NAME}:${USER_NAME}" "${INSTALL_ROOT}"
chown -R "${USER_NAME}:${USER_NAME}" "/home/${USER_NAME}"

SLIM_BUNDLE=false
if [[ ! -d "${INSTALL_ROOT}/local-agent/node_modules" ]]; then
  SLIM_BUNDLE=true
  echo "==> Slim bundle (no node_modules) — run npm i on till before reboot (see end of install)"
else
  echo "==> Rebuilding native modules for Linux (bcrypt, better-sqlite3)"

  # Fix executable bits on everything under node_modules/.bin and known native build tools.
  # Windows-built bundles lose +x on Linux — must do this before any npm rebuild call.
  find "${INSTALL_ROOT}" -path '*/node_modules/.bin/*' -exec chmod +x {} + 2>/dev/null || true
  find "${INSTALL_ROOT}" -name 'node-pre-gyp'    -exec chmod +x {} + 2>/dev/null || true
  find "${INSTALL_ROOT}" -name 'node-gyp'        -exec chmod +x {} + 2>/dev/null || true
  find "${INSTALL_ROOT}" -name 'node-gyp-build'  -exec chmod +x {} + 2>/dev/null || true

  # Rebuild bcrypt inside local-agent using its own node_modules/.bin on PATH.
  # Do NOT run npm install/ci here — the bundle ships node_modules and @venue-pos/shared
  # is a local workspace package not published to the npm registry.
  sudo -u "${USER_NAME}" bash -lc "
    set -e
    AGENT='${INSTALL_ROOT}/local-agent'
    export PATH=\"\${AGENT}/node_modules/.bin:\$PATH\"
    cd \"\${AGENT}\"
    echo '  rebuilding bcrypt'
    npm rebuild bcrypt        2>&1 || true
    echo '  rebuilding better-sqlite3'
    npm rebuild better-sqlite3 2>&1 || true
  "

  # Root-level monorepo rebuild — best-effort, not all bundles ship this layout.
  if [[ -f "${INSTALL_ROOT}/package.json" && -d "${INSTALL_ROOT}/node_modules" ]]; then
    sudo -u "${USER_NAME}" bash -lc "
      export PATH='${INSTALL_ROOT}/node_modules/.bin:\$PATH'
      cd '${INSTALL_ROOT}'
      npm rebuild bcrypt better-sqlite3 2>&1 || true
    " 2>/dev/null || true
  fi

  if [[ -f "${INSTALL_ROOT}/pos/node_modules/electron/install.js" ]]; then
    echo "==> Downloading Linux Electron binary for POS kiosk"
    sudo -u "${USER_NAME}" bash -lc "cd '${INSTALL_ROOT}/pos/node_modules/electron' && node install.js" || true
  fi
  find "${INSTALL_ROOT}/pos/node_modules/.bin" -type f -exec chmod +x {} + 2>/dev/null || true
  chown -R "${USER_NAME}:${USER_NAME}" "${INSTALL_ROOT}"
fi


echo "==> USB receipt printer (CUPS)"
bash "${INSTALL_ROOT}/ops/linux/setup-receipt-printer.sh" "${INSTALL_ROOT}" || true

echo "==> Updater token (private GitHub releases)"
UPDATER_ENV="${INSTALL_ROOT}/pos/.env.updater"
if [[ -f "${BUNDLE_ROOT}/pos/.env.updater" ]]; then
  cp -f "${BUNDLE_ROOT}/pos/.env.updater" "${UPDATER_ENV}"
elif [[ -f "${SCRIPT_DIR}/.env.updater" ]]; then
  cp -f "${SCRIPT_DIR}/.env.updater" "${UPDATER_ENV}"
elif [[ ! -f "${UPDATER_ENV}" && -f "${SCRIPT_DIR}/.env.updater.example" ]]; then
  cp -f "${SCRIPT_DIR}/.env.updater.example" "${UPDATER_ENV}"
fi
if [[ -f "${UPDATER_ENV}" ]]; then
  chown "${USER_NAME}:${USER_NAME}" "${UPDATER_ENV}"
  chmod 600 "${UPDATER_ENV}"
fi

if [[ -n "${CLI_API_URL}" ]]; then
  echo "==> CLI provision (skip wizard)"
  bash "${INSTALL_ROOT}/ops/linux/provision-config.sh" \
    "${INSTALL_ROOT}" "${USER_NAME}" \
    "${CLI_API_URL}" "${CLI_TERMINAL_ID}" "${CLI_TERMINAL_SECRET}" "${CLI_VENUE_ID}"
fi

echo "==> Registering systemd service (agent)"
cp -f "${SCRIPT_DIR}/venue-pos-agent.service" /etc/systemd/system/venue-pos-agent.service
systemctl daemon-reload
systemctl enable venue-pos-agent
if [[ "${SLIM_BUNDLE}" == true ]]; then
  echo "    (agent start deferred — run npm i first)"
else
  systemctl restart venue-pos-agent
fi

echo "==> Kiosk autologin + user systemd service"
bash "${SCRIPT_DIR}/venue-pos-kiosk-enable.sh" "${USER_NAME}" "${INSTALL_ROOT}"

echo "==> Firewall (ufw) — allow hub HTTPS, LAN agent, printers"
if command -v ufw &>/dev/null; then
  ufw allow out 443/tcp comment 'Venue POS hub HTTPS' || true
  ufw allow 3456/tcp comment 'Venue POS LAN agent' || true
  ufw allow out 9100/tcp comment 'ESC/POS printers' || true
fi

smoke_test

PROVISION_NOTE=""
if [[ -n "${CLI_API_URL}" ]]; then
  PROVISION_NOTE="CLI provisioned — wizard skipped. Reboot and use cashier PIN."
else
  PROVISION_NOTE="Reboot → setup wizard opens automatically (hub URL + terminal creds)."
fi

NPM_NOTE=""
if [[ "${SLIM_BUNDLE}" == true ]]; then
  NPM_NOTE="
Slim bundle — install deps on till first:
  cd ${INSTALL_ROOT}
  npm i
  cd local-agent && npm rebuild bcrypt better-sqlite3
  sudo systemctl restart venue-pos-agent

Then:"
fi

cat <<EOF

╔══════════════════════════════════════════════════════════════╗
║  Venue POS install complete                                  ║
╚══════════════════════════════════════════════════════════════╝
${NPM_NOTE}
Next:  sudo reboot
${PROVISION_NOTE}

Useful:
  sudo systemctl status venue-pos-agent
  sudo systemctl status venue-pos-kiosk-display
  journalctl -u venue-pos-agent -f
  journalctl -u venue-pos-kiosk-display -f
  tail -f /home/${USER_NAME}/.local/share/venue-pos/kiosk.log

If POS does not start after reboot:
  sudo bash ${INSTALL_ROOT}/ops/linux/fix-kiosk-boot.sh
  sudo reboot

EOF
