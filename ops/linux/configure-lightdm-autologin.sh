#!/usr/bin/env bash
# Patch LightDM for venuepos autologin + openbox (minimal kiosk). Run as root.
set -euo pipefail

USER_NAME="${1:-venuepos}"
LIGHTDM_DROPIN="/etc/lightdm/lightdm.conf.d/50-venue-pos.conf"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run as root"
  exit 1
fi

if ! command -v lightdm &>/dev/null && [[ ! -d /etc/lightdm ]]; then
  echo "LightDM not installed — skip LightDM autologin"
  exit 0
fi

echo "==> LightDM autologin (${USER_NAME}) + openbox session"

mkdir -p /etc/lightdm/lightdm.conf.d
cat > "${LIGHTDM_DROPIN}" <<EOF
[Seat:*]
autologin-user=${USER_NAME}
autologin-user-timeout=0
user-session=openbox
EOF

systemctl disable gdm3 2>/dev/null || systemctl disable gdm 2>/dev/null || true
systemctl enable lightdm 2>/dev/null || true
systemctl set-default graphical.target 2>/dev/null || true
