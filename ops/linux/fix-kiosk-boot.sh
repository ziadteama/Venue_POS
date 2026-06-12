#!/usr/bin/env bash
# Repair kiosk autostart on an already-installed till. Run as root after setup.sh.
# Usage: sudo bash /opt/venue-pos/ops/linux/fix-kiosk-boot.sh
set -euo pipefail

INSTALL_ROOT="/opt/venue-pos"
USER_NAME="venuepos"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run as root: sudo bash fix-kiosk-boot.sh"
  exit 1
fi

echo "==> Venue POS kiosk boot repair"

if ! id "${USER_NAME}" &>/dev/null; then
  echo "User ${USER_NAME} not found — run setup.sh first"
  exit 1
fi

echo "==> Installing missing GUI packages (openbox, x11-utils)"
if command -v apt-get &>/dev/null; then
  DEBIAN_FRONTEND=noninteractive apt-get install -y \
    openbox x11-utils dbus-x11 gdm3 xorg lxpanel 2>/dev/null || \
  DEBIAN_FRONTEND=noninteractive apt-get install -y openbox x11-utils dbus-x11 lxpanel
fi

chmod +x "${SCRIPT_DIR}/"*.sh 2>/dev/null || true

bash "${SCRIPT_DIR}/configure-gdm-autologin.sh" "${USER_NAME}"
bash "${SCRIPT_DIR}/configure-openbox-session.sh" "${USER_NAME}" "${INSTALL_ROOT}"
bash "${SCRIPT_DIR}/venue-pos-kiosk-enable.sh" "${USER_NAME}" "${INSTALL_ROOT}"

cp -f "${SCRIPT_DIR}/venue-pos-kiosk-display.service" /etc/systemd/system/
systemctl daemon-reload
systemctl enable venue-pos-kiosk-display.service
systemctl restart venue-pos-kiosk-display.service 2>/dev/null || true

systemctl enable venue-pos-agent 2>/dev/null || true
systemctl restart venue-pos-agent 2>/dev/null || true

cat <<EOF

Kiosk boot repair complete.

Verify:
  systemctl is-active venue-pos-agent
  systemctl is-active venue-pos-kiosk-display
  systemctl get-default   # should be graphical.target
  grep -E 'AutomaticLogin|WaylandEnable' /etc/gdm3/custom.conf

Then reboot:
  sudo reboot

After reboot the till should auto-login as venuepos and open POS.
Logs:
  journalctl -u venue-pos-kiosk-display -f
  tail -f /home/${USER_NAME}/.local/share/venue-pos/kiosk.log

EOF
