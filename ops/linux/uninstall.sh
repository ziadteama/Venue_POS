#!/usr/bin/env bash
set -euo pipefail
INSTALL_ROOT="/opt/venue-pos"
USER_NAME="venuepos"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run as root: sudo bash uninstall.sh"
  exit 1
fi

systemctl stop venue-pos-agent 2>/dev/null || true
systemctl disable venue-pos-agent 2>/dev/null || true
rm -f /etc/systemd/system/venue-pos-agent.service
systemctl daemon-reload

rm -rf "${INSTALL_ROOT}"
rm -f "/home/${USER_NAME}/.config/autostart/venue-pos-kiosk.desktop"

echo "Venue POS till removed. User ${USER_NAME} was not deleted (preserves home data)."
