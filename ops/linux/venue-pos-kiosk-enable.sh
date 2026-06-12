#!/usr/bin/env bash
# Enable venuepos kiosk autologin + systemd services. Run as root from install.sh.
set -euo pipefail

USER_NAME="${1:-venuepos}"
INSTALL_ROOT="${2:-/opt/venue-pos}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run as root"
  exit 1
fi

bash "${SCRIPT_DIR}/configure-gdm-autologin.sh" "${USER_NAME}"
bash "${SCRIPT_DIR}/configure-openbox-session.sh" "${USER_NAME}" "${INSTALL_ROOT}"

echo "==> systemd user kiosk service (${USER_NAME})"
mkdir -p "/home/${USER_NAME}/.config/systemd/user"
cp -f "${INSTALL_ROOT}/ops/linux/venue-pos-kiosk.service" \
  "/home/${USER_NAME}/.config/systemd/user/venue-pos-kiosk.service"
chown -R "${USER_NAME}:${USER_NAME}" "/home/${USER_NAME}/.config/systemd"

loginctl enable-linger "${USER_NAME}" 2>/dev/null || true

uid="$(id -u "${USER_NAME}")"
sudo -u "${USER_NAME}" XDG_RUNTIME_DIR="/run/user/${uid}" \
  systemctl --user daemon-reload 2>/dev/null || true
sudo -u "${USER_NAME}" XDG_RUNTIME_DIR="/run/user/${uid}" \
  systemctl --user enable venue-pos-kiosk.service 2>/dev/null || true

echo "==> systemd system kiosk display service"
cp -f "${INSTALL_ROOT}/ops/linux/venue-pos-kiosk-display.service" /etc/systemd/system/
systemctl daemon-reload
systemctl enable venue-pos-kiosk-display.service
