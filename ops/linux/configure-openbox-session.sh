#!/usr/bin/env bash
# Minimal openbox session + autostart for venuepos kiosk. Run as root.
set -euo pipefail

USER_NAME="${1:-venuepos}"
INSTALL_ROOT="${2:-/opt/venue-pos}"
HOME_DIR="/home/${USER_NAME}"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run as root"
  exit 1
fi

echo "==> Openbox session + kiosk autostart (${USER_NAME})"

install -d -m 755 /var/lib/AccountsService/users
cat > "/var/lib/AccountsService/users/${USER_NAME}" <<EOF
[User]
Session=openbox
SystemAccount=false
EOF

mkdir -p "${HOME_DIR}/.config/openbox"
cat > "${HOME_DIR}/.config/openbox/autostart" <<EOF
#!/bin/bash
# Venue POS — launch kiosk when openbox session starts
export DISPLAY=:0
export ELECTRON_IS_KIOSK=true
export VENUE_POS_AGENT_ROOT=${INSTALL_ROOT}/local-agent
export VENUE_POS_FORCE_SETUP=1
exec ${INSTALL_ROOT}/pos/start-kiosk.sh
EOF
chmod +x "${HOME_DIR}/.config/openbox/autostart"

mkdir -p "${HOME_DIR}/.config/autostart"
cat > "${HOME_DIR}/.config/autostart/venue-pos-kiosk.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=Venue POS Kiosk
Comment=Venue POS till application
Exec=${INSTALL_ROOT}/pos/start-kiosk.sh
Terminal=false
X-GNOME-Autostart-enabled=true
Hidden=false
EOF

cat > "${HOME_DIR}/.xprofile" <<'XPROF'
# Venue POS — start kiosk user service when a graphical session begins
export DISPLAY="${DISPLAY:-:0}"
if command -v systemctl >/dev/null 2>&1; then
  systemctl --user start venue-pos-kiosk.service 2>/dev/null || true
fi
XPROF

chown -R "${USER_NAME}:${USER_NAME}" "${HOME_DIR}/.config" "${HOME_DIR}/.xprofile"
