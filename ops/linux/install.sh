#!/usr/bin/env bash
# Venue POS till — resilient one-click Ubuntu installer.
# Run from USB bundle root as root: sudo bash setup.sh
# Usage: sudo bash setup.sh [--api-url URL --terminal-id UUID --terminal-secret SECRET [--venue-id UUID]]
#
# Self-healing design:
#   - Every step detects its own failure and tries at least one alternate approach.
#   - set -e is intentionally NOT used globally — failures are caught per-section.
#   - A WARNINGS array collects non-fatal issues; shown in the summary.
#   - A hard FATAL function stops only when there is truly no path forward.
# ---------------------------------------------------------------------------
set -uo pipefail

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

WARNINGS=()

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
log()  { printf '\033[0;34m==>\033[0m %s\n' "$*"; }
ok()   { printf '    \033[0;32mOK\033[0m  %s\n' "$*"; }
warn() { printf '    \033[0;33mWARN\033[0m %s\n' "$*"; WARNINGS+=("$*"); }
fatal(){ printf '\033[0;31mFATAL\033[0m %s\n' "$*" >&2; exit 1; }

try_cmd() {
  # try_cmd "description" cmd [args...]
  local desc="$1"; shift
  if "$@" 2>/tmp/venue-pos-last-error; then
    ok "${desc}"
    return 0
  else
    warn "${desc} failed ($(cat /tmp/venue-pos-last-error | tail -1))"
    return 1
  fi
}

# ---------------------------------------------------------------------------
# Args
# ---------------------------------------------------------------------------
while [[ $# -gt 0 ]]; do
  case "$1" in
    --api-url)        CLI_API_URL="${2:-}";        shift 2 ;;
    --terminal-id)    CLI_TERMINAL_ID="${2:-}";    shift 2 ;;
    --terminal-secret)CLI_TERMINAL_SECRET="${2:-}";shift 2 ;;
    --venue-id)       CLI_VENUE_ID="${2:-}";       shift 2 ;;
    --minimal-kiosk)  MINIMAL_KIOSK=true;          shift   ;;
    -h|--help)
      echo "Usage: sudo bash setup.sh [--api-url URL --terminal-id UUID --terminal-secret SECRET [--venue-id UUID]]"
      exit 0 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

[[ "${EUID}" -ne 0 ]] && fatal "Run as root: sudo bash setup.sh"

if [[ ! -d "${BUNDLE_ROOT}/local-agent" || ! -d "${BUNDLE_ROOT}/pos" ]]; then
  fatal "Bundle layout invalid — expected local-agent/ and pos/ at ${BUNDLE_ROOT}"
fi

if [[ -n "${CLI_API_URL}" || -n "${CLI_TERMINAL_ID}" || -n "${CLI_TERMINAL_SECRET}" ]]; then
  if [[ -z "${CLI_API_URL}" || -z "${CLI_TERMINAL_ID}" || -z "${CLI_TERMINAL_SECRET}" ]]; then
    fatal "CLI provision requires --api-url, --terminal-id, and --terminal-secret together"
  fi
fi

# ---------------------------------------------------------------------------
# 1. Detect package manager
# ---------------------------------------------------------------------------
detect_pkg_manager() {
  if command -v apt-get &>/dev/null; then echo "apt"
  elif command -v dnf &>/dev/null;     then echo "dnf"
  elif command -v yum &>/dev/null;     then echo "yum"
  elif command -v zypper &>/dev/null;  then echo "zypper"
  else echo "unknown"
  fi
}
PKG_MGR="$(detect_pkg_manager)"
log "Package manager: ${PKG_MGR}"

pkg_install() {
  # pkg_install pkg1 pkg2 ...  — install via detected manager, skip unknowns
  case "${PKG_MGR}" in
    apt)    DEBIAN_FRONTEND=noninteractive apt-get install -y "$@" 2>/dev/null || \
            DEBIAN_FRONTEND=noninteractive apt-get install -y --fix-broken "$@" 2>/dev/null || true ;;
    dnf)    dnf install -y "$@" 2>/dev/null || true ;;
    yum)    yum install -y "$@" 2>/dev/null || true ;;
    zypper) zypper install -y "$@" 2>/dev/null || true ;;
    *)      warn "Unknown package manager — skipping install of: $*" ;;
  esac
}

pkg_update() {
  case "${PKG_MGR}" in
    apt)    apt-get update -qq 2>/dev/null || warn "apt-get update failed (continuing)" ;;
    dnf)    dnf makecache -q  2>/dev/null || true ;;
    yum)    yum makecache -q  2>/dev/null || true ;;
    zypper) zypper refresh    2>/dev/null || true ;;
  esac
}

# ---------------------------------------------------------------------------
# 2. Node.js 20+
# ---------------------------------------------------------------------------
install_node20() {
  log "Checking Node.js"

  if command -v node &>/dev/null; then
    local major
    major="$(node -p "process.versions.node.split('.')[0]" 2>/dev/null || echo 0)"
    if [[ "${major}" -ge 20 ]]; then
      ok "Node $(node -v) already installed"
      return 0
    fi
    warn "Node $(node -v) too old — need 20+"
  fi

  log "Installing Node.js 20 LTS"
  pkg_update

  # Strategy 1: NodeSource script (most reliable on Debian/Ubuntu)
  if command -v curl &>/dev/null || pkg_install curl; then
    if curl -fsSL https://deb.nodesource.com/setup_20.x | bash - 2>/dev/null; then
      pkg_install nodejs
      if command -v node &>/dev/null; then
        ok "Node $(node -v) via NodeSource"
        return 0
      fi
    fi
  fi

  # Strategy 2: snap
  if command -v snap &>/dev/null; then
    snap install node --channel=20/stable --classic 2>/dev/null && \
      ok "Node $(node -v) via snap" && return 0
  fi

  # Strategy 3: nvm
  if command -v curl &>/dev/null; then
    export NVM_DIR="/root/.nvm"
    curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash 2>/dev/null || true
    # shellcheck disable=SC1091
    [[ -s "${NVM_DIR}/nvm.sh" ]] && source "${NVM_DIR}/nvm.sh"
    if command -v nvm &>/dev/null; then
      nvm install 20 2>/dev/null && nvm use 20 2>/dev/null && \
        ok "Node $(node -v) via nvm" && return 0
    fi
  fi

  # Strategy 4: distro package (may be older, but better than nothing)
  pkg_install nodejs npm 2>/dev/null || true
  if command -v node &>/dev/null; then
    local mv
    mv="$(node -p "process.versions.node.split('.')[0]" 2>/dev/null || echo 0)"
    if [[ "${mv}" -ge 18 ]]; then
      warn "Node $(node -v) installed (18+ accepted as fallback — 20+ preferred)"
      return 0
    fi
  fi

  fatal "Could not install Node.js 20+. Install manually then re-run setup.sh"
}

# ---------------------------------------------------------------------------
# 3. System packages
# ---------------------------------------------------------------------------
install_packages() {
  log "System packages"
  pkg_update

  # Core always-needed
  pkg_install build-essential python3 rsync curl ca-certificates gnupg

  # Printing
  pkg_install cups cups-client || warn "CUPS install failed — receipt printing may not work"

  # GUI / display stack
  local gui_pkgs
  if [[ "${MINIMAL_KIOSK}" == true ]]; then
    gui_pkgs="lightdm openbox lxpanel xorg xinit x11-utils dbus-x11"
  else
    gui_pkgs="gdm3 xorg openbox lxpanel x11-utils dbus-x11"
  fi
  # Try new Ubuntu lib names first, fall back to old names
  pkg_install ${gui_pkgs} \
    libnss3 libnspr4 libatk1.0-0t64 libatk-bridge2.0-0t64 libcups2t64 libdrm2 \
    libgtk-3-0t64 libgbm1 libasound2t64 libxcomposite1 libxdamage1 libxfixes3 \
    libxrandr2 libxkbcommon0 libpango-1.0-0 libcairo2 libx11-xcb1 libxcb1 \
    libxext6 libxshmfence1 || \
  pkg_install ${gui_pkgs} \
    libnss3 libnspr4 libgtk-3-0 libgbm1 libasound2 libxcomposite1 libxdamage1 \
    libxfixes3 libxrandr2 libxkbcommon0 || \
  warn "Some GUI/Electron libs could not be installed — POS may have display issues"

  # python3-distutils needed by node-gyp on some Ubuntu versions
  pkg_install python3-distutils python3-dev 2>/dev/null || \
  pkg_install python3-setuptools            2>/dev/null || true
}

# ---------------------------------------------------------------------------
# 4. Create venuepos user
# ---------------------------------------------------------------------------
setup_user() {
  log "Creating user ${USER_NAME}"
  if ! id "${USER_NAME}" &>/dev/null; then
    useradd --create-home --home-dir "/home/${USER_NAME}" --shell /bin/bash "${USER_NAME}" || \
      fatal "Could not create user ${USER_NAME}"
  else
    usermod -s /bin/bash "${USER_NAME}" 2>/dev/null || true
    ok "User ${USER_NAME} already exists"
  fi
  usermod -aG lp,plugdev "${USER_NAME}" 2>/dev/null || true
  # Ensure home dir exists with correct ownership
  mkdir -p "/home/${USER_NAME}"
  chown "${USER_NAME}:${USER_NAME}" "/home/${USER_NAME}"
}

# ---------------------------------------------------------------------------
# 5. Fresh-install hygiene
# ---------------------------------------------------------------------------
fresh_install_hygiene() {
  log "Fresh-install hygiene (clear stale POS config)"
  mkdir -p "${STATE_DIR}"
  touch "${STATE_DIR}/needs-wizard"
  find "/home/${USER_NAME}/.config" -name 'pos-config.json' -delete 2>/dev/null || true
}

# ---------------------------------------------------------------------------
# 6. Copy bundle to /opt/venue-pos
# ---------------------------------------------------------------------------
install_files() {
  log "Installing to ${INSTALL_ROOT}"
  mkdir -p "${INSTALL_ROOT}"

  rsync_or_cp() {
    local src="$1" dst="$2"
    if command -v rsync &>/dev/null; then
      rsync -a --delete "${src}" "${dst}" 2>/dev/null || cp -a "${src}" "${dst}"
    else
      rm -rf "${dst}"
      cp -a "${src}" "${dst}"
    fi
  }

  rsync_or_cp "${BUNDLE_ROOT}/local-agent/" "${INSTALL_ROOT}/local-agent/"
  rsync_or_cp "${BUNDLE_ROOT}/pos/"         "${INSTALL_ROOT}/pos/"
  rsync_or_cp "${BUNDLE_ROOT}/ops/"         "${INSTALL_ROOT}/ops/"
  [[ -d "${BUNDLE_ROOT}/watchdog"  ]] && rsync_or_cp "${BUNDLE_ROOT}/watchdog/"  "${INSTALL_ROOT}/watchdog/"  || true
  [[ -d "${BUNDLE_ROOT}/node_modules" ]] && rsync_or_cp "${BUNDLE_ROOT}/node_modules/" "${INSTALL_ROOT}/node_modules/" || true
  [[ -d "${BUNDLE_ROOT}/packages"  ]] && rsync_or_cp "${BUNDLE_ROOT}/packages/"  "${INSTALL_ROOT}/packages/"  || true
  [[ -f "${BUNDLE_ROOT}/package.json" ]] && cp -f "${BUNDLE_ROOT}/package.json" "${INSTALL_ROOT}/package.json" || true
  if [[ -f "${BUNDLE_ROOT}/setup.sh" ]]; then
    cp -f "${BUNDLE_ROOT}/setup.sh" "${INSTALL_ROOT}/setup.sh"
    chmod +x "${INSTALL_ROOT}/setup.sh"
  fi

  chmod +x "${INSTALL_ROOT}/ops/linux/"*.sh 2>/dev/null || true
  cp -f "${SCRIPT_DIR}/start-kiosk.sh" "${INSTALL_ROOT}/pos/start-kiosk.sh"
  chmod +x "${INSTALL_ROOT}/pos/start-kiosk.sh"
  compgen -G "${INSTALL_ROOT}/pos/release/*.AppImage" > /dev/null && \
    chmod +x "${INSTALL_ROOT}/pos/release/"*.AppImage 2>/dev/null || true

  chown -R "${USER_NAME}:${USER_NAME}" "${INSTALL_ROOT}"
  chown -R "${USER_NAME}:${USER_NAME}" "/home/${USER_NAME}"
}

# ---------------------------------------------------------------------------
# 7. Native module rebuild  (the most fragile step — heavily self-healing)
# ---------------------------------------------------------------------------

# Fix all executable bits lost when a Windows bundle is extracted on Linux.
fix_bin_permissions() {
  log "Fixing .bin executable permissions (Windows→Linux)"
  find "${INSTALL_ROOT}" -path '*/node_modules/.bin/*' -exec chmod +x {} + 2>/dev/null || true
  find "${INSTALL_ROOT}" -name 'node-pre-gyp'   -exec chmod +x {} + 2>/dev/null || true
  find "${INSTALL_ROOT}" -name 'node-pre-gyp.cmd' -delete 2>/dev/null || true
  find "${INSTALL_ROOT}" -name 'node-gyp'       -exec chmod +x {} + 2>/dev/null || true
  find "${INSTALL_ROOT}" -name 'node-gyp-build' -exec chmod +x {} + 2>/dev/null || true
  find "${INSTALL_ROOT}" -name '*.node' -exec chmod +x {} + 2>/dev/null || true
  ok "Permissions fixed"
}

# Attempt npm rebuild for a single package, trying several strategies.
rebuild_native_pkg() {
  local pkg="$1"          # e.g. bcrypt
  local workdir="$2"      # directory that owns the package
  local extra_path="$3"   # extra PATH prefix

  log "  Rebuilding ${pkg} in ${workdir}"

  # Determine all candidate .bin paths to add to PATH
  local bin_paths="${extra_path}"
  bin_paths+=":/usr/local/lib/node_modules/.bin"
  bin_paths+=":/usr/lib/node_modules/.bin"
  bin_paths+=":/usr/local/bin"
  for nm in \
    "${workdir}/node_modules/.bin" \
    "${INSTALL_ROOT}/local-agent/node_modules/.bin" \
    "${INSTALL_ROOT}/node_modules/.bin"; do
    [[ -d "${nm}" ]] && bin_paths="${nm}:${bin_paths}"
  done

  local base_env="PATH=${bin_paths}:\$PATH npm_config_build_from_source=true"

  # Strategy 1: npm rebuild (standard)
  if sudo -u "${USER_NAME}" bash -lc "
      export ${base_env}
      cd '${workdir}'
      npm rebuild ${pkg} 2>&1
    " 2>/dev/null; then
    ok "  ${pkg} rebuilt (npm rebuild)"
    return 0
  fi

  # Strategy 2: npm rebuild --build-from-source
  if sudo -u "${USER_NAME}" bash -lc "
      export ${base_env}
      cd '${workdir}'
      npm rebuild ${pkg} --build-from-source 2>&1
    " 2>/dev/null; then
    ok "  ${pkg} rebuilt (--build-from-source)"
    return 0
  fi

  # Strategy 3: run node-pre-gyp directly inside the package dir
  local pkg_dir="${workdir}/node_modules/${pkg}"
  if [[ -d "${pkg_dir}" ]]; then
    local pre_gyp_bin
    pre_gyp_bin="$(find "${INSTALL_ROOT}" -name 'node-pre-gyp' -type f | head -1)"
    if [[ -n "${pre_gyp_bin}" && -x "${pre_gyp_bin}" ]]; then
      if sudo -u "${USER_NAME}" bash -lc "
          export PATH='${bin_paths}:\$PATH'
          cd '${pkg_dir}'
          '${pre_gyp_bin}' install --fallback-to-build 2>&1
        " 2>/dev/null; then
        ok "  ${pkg} rebuilt (node-pre-gyp direct)"
        return 0
      fi
    fi

    # Strategy 4: node-gyp rebuild directly
    if sudo -u "${USER_NAME}" bash -lc "
        export PATH='${bin_paths}:\$PATH'
        cd '${pkg_dir}'
        node-gyp rebuild 2>&1
      " 2>/dev/null; then
      ok "  ${pkg} rebuilt (node-gyp rebuild)"
      return 0
    fi

    # Strategy 5: npx node-pre-gyp
    if sudo -u "${USER_NAME}" bash -lc "
        export PATH='${bin_paths}:\$PATH'
        cd '${pkg_dir}'
        npx --yes @mapbox/node-pre-gyp install --fallback-to-build 2>&1
      " 2>/dev/null; then
      ok "  ${pkg} rebuilt (npx @mapbox/node-pre-gyp)"
      return 0
    fi
  fi

  # Strategy 6: install node-gyp globally and retry
  npm install -g node-gyp node-pre-gyp @mapbox/node-pre-gyp 2>/dev/null || true
  find /usr/local/lib/node_modules -name 'node-pre-gyp' -exec chmod +x {} + 2>/dev/null || true
  if sudo -u "${USER_NAME}" bash -lc "
      export PATH='/usr/local/lib/node_modules/.bin:/usr/local/bin:${bin_paths}:\$PATH'
      cd '${workdir}'
      npm rebuild ${pkg} --build-from-source 2>&1
    " 2>/dev/null; then
    ok "  ${pkg} rebuilt (after global node-gyp install)"
    return 0
  fi

  warn "  Could not rebuild ${pkg} — agent may fail to start; run 'npm rebuild ${pkg}' manually in ${workdir}"
  return 1
}

rebuild_native_modules() {
  if [[ ! -d "${INSTALL_ROOT}/local-agent/node_modules" ]]; then
    warn "local-agent/node_modules missing — slim bundle; see post-install instructions"
    SLIM_BUNDLE=true
    return 0
  fi

  SLIM_BUNDLE=false
  log "Rebuilding native modules for Linux"

  # Ensure build tools exist
  pkg_install build-essential python3 python3-dev python3-distutils make gcc g++ 2>/dev/null || true

  fix_bin_permissions

  local agent_dir="${INSTALL_ROOT}/local-agent"
  local agent_bin="${agent_dir}/node_modules/.bin"
  local root_bin="${INSTALL_ROOT}/node_modules/.bin"
  local extra="${agent_bin}:${root_bin}"

  # Rebuild in local-agent (primary location)
  rebuild_native_pkg "bcrypt"         "${agent_dir}" "${extra}" || true
  rebuild_native_pkg "better-sqlite3" "${agent_dir}" "${extra}" || true

  # Rebuild in monorepo root if it also has node_modules
  if [[ -f "${INSTALL_ROOT}/package.json" && -d "${INSTALL_ROOT}/node_modules" ]]; then
    rebuild_native_pkg "bcrypt"         "${INSTALL_ROOT}" "${extra}" || true
    rebuild_native_pkg "better-sqlite3" "${INSTALL_ROOT}" "${extra}" || true
  fi

  # Download Linux Electron binary if POS ships unpackaged electron
  if [[ -f "${INSTALL_ROOT}/pos/node_modules/electron/install.js" ]]; then
    log "Downloading Linux Electron binary for POS"
    sudo -u "${USER_NAME}" bash -lc \
      "cd '${INSTALL_ROOT}/pos/node_modules/electron' && node install.js 2>&1" || \
      warn "Electron binary download failed — POS may not launch without AppImage"
  fi

  find "${INSTALL_ROOT}/pos/node_modules/.bin" -type f -exec chmod +x {} + 2>/dev/null || true
  chown -R "${USER_NAME}:${USER_NAME}" "${INSTALL_ROOT}"
}

# ---------------------------------------------------------------------------
# 8. CUPS receipt printer
# ---------------------------------------------------------------------------
setup_printer() {
  log "USB receipt printer (CUPS)"
  if [[ -f "${INSTALL_ROOT}/ops/linux/setup-receipt-printer.sh" ]]; then
    bash "${INSTALL_ROOT}/ops/linux/setup-receipt-printer.sh" "${INSTALL_ROOT}" 2>/dev/null || \
      warn "CUPS printer setup failed — configure manually via http://localhost:631"
  else
    warn "setup-receipt-printer.sh not found — skipping"
  fi
}

# ---------------------------------------------------------------------------
# 9. Updater token
# ---------------------------------------------------------------------------
setup_updater_token() {
  log "Updater token"
  local UPDATER_ENV="${INSTALL_ROOT}/pos/.env.updater"
  for src in \
    "${BUNDLE_ROOT}/pos/.env.updater" \
    "${SCRIPT_DIR}/.env.updater"; do
    if [[ -f "${src}" ]]; then
      cp -f "${src}" "${UPDATER_ENV}"
      break
    fi
  done
  if [[ ! -f "${UPDATER_ENV}" && -f "${SCRIPT_DIR}/.env.updater.example" ]]; then
    cp -f "${SCRIPT_DIR}/.env.updater.example" "${UPDATER_ENV}"
    warn ".env.updater not found — example copied; fill in GitHub token for auto-updates"
  fi
  if [[ -f "${UPDATER_ENV}" ]]; then
    chown "${USER_NAME}:${USER_NAME}" "${UPDATER_ENV}"
    chmod 600 "${UPDATER_ENV}"
    ok "Updater token in place"
  fi
}

# ---------------------------------------------------------------------------
# 10. Systemd services
# ---------------------------------------------------------------------------
setup_services() {
  log "Registering systemd services"

  # Agent service (system)
  if [[ -f "${SCRIPT_DIR}/venue-pos-agent.service" ]]; then
    cp -f "${SCRIPT_DIR}/venue-pos-agent.service" /etc/systemd/system/venue-pos-agent.service
    systemctl daemon-reload 2>/dev/null || true
    systemctl enable venue-pos-agent 2>/dev/null || \
      warn "Could not enable venue-pos-agent (systemd may not be running yet)"
    if [[ "${SLIM_BUNDLE}" == false ]]; then
      systemctl restart venue-pos-agent 2>/dev/null || \
        warn "Could not start venue-pos-agent — check: journalctl -u venue-pos-agent"
    else
      warn "Agent start deferred — install node_modules first (see post-install)"
    fi
  else
    warn "venue-pos-agent.service not found in bundle — skipping"
  fi

  # Kiosk autologin + display service
  if [[ -f "${SCRIPT_DIR}/venue-pos-kiosk-enable.sh" ]]; then
    bash "${SCRIPT_DIR}/venue-pos-kiosk-enable.sh" "${USER_NAME}" "${INSTALL_ROOT}" 2>/dev/null || \
      warn "Kiosk enable script failed — run fix-kiosk-boot.sh after reboot"
  else
    warn "venue-pos-kiosk-enable.sh not found — kiosk autologin not configured"
  fi
}

# ---------------------------------------------------------------------------
# 11. Firewall
# ---------------------------------------------------------------------------
setup_firewall() {
  log "Firewall"
  if command -v ufw &>/dev/null; then
    ufw allow out 443/tcp  comment 'Venue POS hub HTTPS' 2>/dev/null || true
    ufw allow 3456/tcp     comment 'Venue POS LAN agent'  2>/dev/null || true
    ufw allow out 9100/tcp comment 'ESC/POS printers'     2>/dev/null || true
    ok "ufw rules added"
  elif command -v firewall-cmd &>/dev/null; then
    firewall-cmd --permanent --add-port=3456/tcp 2>/dev/null || true
    firewall-cmd --reload 2>/dev/null || true
    ok "firewalld rules added"
  else
    warn "No firewall tool found (ufw/firewalld) — open port 3456 manually if needed"
  fi
}

# ---------------------------------------------------------------------------
# 12. CLI provision (optional — skip wizard)
# ---------------------------------------------------------------------------
cli_provision() {
  if [[ -z "${CLI_API_URL}" ]]; then return 0; fi
  log "CLI provision (skip setup wizard)"
  if [[ -f "${INSTALL_ROOT}/ops/linux/provision-config.sh" ]]; then
    bash "${INSTALL_ROOT}/ops/linux/provision-config.sh" \
      "${INSTALL_ROOT}" "${USER_NAME}" \
      "${CLI_API_URL}" "${CLI_TERMINAL_ID}" "${CLI_TERMINAL_SECRET}" "${CLI_VENUE_ID}" || \
      warn "CLI provision failed — setup wizard will run on first boot"
  else
    warn "provision-config.sh not found — setup wizard will run on first boot"
  fi
}

# ---------------------------------------------------------------------------
# 13. Smoke test
# ---------------------------------------------------------------------------
smoke_test() {
  log "Post-install smoke test"
  local ok_count=0 fail_count=0

  check() {
    local label="$1"; shift
    if "$@" &>/dev/null; then
      ok "${label}"
      ok_count=$((ok_count + 1))
    else
      warn "${label} — FAILED"
      fail_count=$((fail_count + 1))
    fi
  }

  check "venue-pos-agent systemd unit enabled" \
    systemctl is-enabled --quiet venue-pos-agent

  check "venue-pos-agent running" \
    systemctl is-active --quiet venue-pos-agent

  if compgen -G "${INSTALL_ROOT}/pos/release/*.AppImage" > /dev/null 2>&1; then
    local img
    img="$(ls -1 "${INSTALL_ROOT}/pos/release/"*.AppImage 2>/dev/null | head -1)"
    check "AppImage executable" test -x "${img}"
  else
    warn "No AppImage found — build a Linux bundle for production"
    fail_count=$((fail_count + 1))
  fi

  check "local-agent /health reachable" \
    curl -sf --max-time 5 http://127.0.0.1:3456/health

  check "bcrypt .node binary exists" \
    bash -c "find '${INSTALL_ROOT}/local-agent/node_modules/bcrypt' -name '*.node' | grep -q ."

  check "better-sqlite3 .node binary exists" \
    bash -c "find '${INSTALL_ROOT}/local-agent/node_modules/better-sqlite3' -name '*.node' | grep -q ."

  check "GDM autologin configured" \
    grep -q "AutomaticLoginEnable=true" /etc/gdm3/custom.conf 2>/dev/null

  echo ""
  echo "  Smoke test: ${ok_count} passed, ${fail_count} failed"
}

# ---------------------------------------------------------------------------
# MAIN
# ---------------------------------------------------------------------------
SLIM_BUNDLE=false

install_node20
install_packages
setup_user
fresh_install_hygiene
install_files
rebuild_native_modules
setup_printer
setup_updater_token
cli_provision
setup_services
setup_firewall
smoke_test

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
if [[ ${#WARNINGS[@]} -gt 0 ]]; then
  echo ""
  echo "╔══════════════════════════════════════════════════════════════╗"
  echo "║  Warnings (non-fatal — review before going live)            ║"
  echo "╚══════════════════════════════════════════════════════════════╝"
  for w in "${WARNINGS[@]}"; do
    printf '  ⚠  %s\n' "${w}"
  done
fi

PROVISION_NOTE="Reboot → setup wizard opens automatically (hub URL + terminal creds)."
[[ -n "${CLI_API_URL}" ]] && PROVISION_NOTE="CLI provisioned — wizard skipped. Reboot and use cashier PIN."

SLIM_NOTE=""
if [[ "${SLIM_BUNDLE}" == true ]]; then
  SLIM_NOTE="
  Slim bundle — install deps on till before rebooting:
    cd ${INSTALL_ROOT}
    npm i
    cd local-agent && npm rebuild bcrypt better-sqlite3
    sudo systemctl restart venue-pos-agent
"
fi

cat <<EOF

╔══════════════════════════════════════════════════════════════╗
║  Venue POS install complete                                  ║
╚══════════════════════════════════════════════════════════════╝
${SLIM_NOTE}
Next:  sudo reboot
${PROVISION_NOTE}

Useful commands:
  sudo systemctl status venue-pos-agent
  sudo systemctl status venue-pos-kiosk-display
  journalctl -u venue-pos-agent -f
  journalctl -u venue-pos-kiosk-display -f
  tail -f /home/${USER_NAME}/.local/share/venue-pos/kiosk.log

If POS does not start after reboot:
  sudo bash ${INSTALL_ROOT}/ops/linux/fix-kiosk-boot.sh
  sudo reboot

EOF
