#!/usr/bin/env bash
# Enable venuepos kiosk autologin + systemd user service. Run as root from install.sh.
set -euo pipefail

USER_NAME="${1:-venuepos}"
INSTALL_ROOT="${2:-/opt/venue-pos}"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run as root"
  exit 1
fi

echo "==> GDM autologin (${USER_NAME})"
mkdir -p /etc/gdm3/custom.conf.d
cat > /etc/gdm3/custom.conf.d/venue-pos.conf <<EOF
[daemon]
AutomaticLogin=${USER_NAME}
AutomaticLoginEnable=true
EOF

if [[ -f /etc/gdm3/custom.conf ]]; then
  if grep -q '^AutomaticLoginEnable=' /etc/gdm3/custom.conf 2>/dev/null; then
    sed -i "s/^AutomaticLoginEnable=.*/AutomaticLoginEnable=true/" /etc/gdm3/custom.conf || true
    sed -i "s/^AutomaticLogin=.*/AutomaticLogin=${USER_NAME}/" /etc/gdm3/custom.conf || true
  fi
fi

echo "==> systemd user kiosk service (${USER_NAME})"
mkdir -p "/home/${USER_NAME}/.config/systemd/user"
cp -f "${INSTALL_ROOT}/ops/linux/venue-pos-kiosk.service" \
  "/home/${USER_NAME}/.config/systemd/user/venue-pos-kiosk.service"
chown -R "${USER_NAME}:${USER_NAME}" "/home/${USER_NAME}/.config/systemd"

loginctl enable-linger "${USER_NAME}" 2>/dev/null || true

sudo -u "${USER_NAME}" XDG_RUNTIME_DIR="/run/user/$(id -u "${USER_NAME}")" \
  systemctl --user daemon-reload 2>/dev/null || true
sudo -u "${USER_NAME}" XDG_RUNTIME_DIR="/run/user/$(id -u "${USER_NAME}")" \
  systemctl --user enable venue-pos-kiosk.service 2>/dev/null || true

cat > "/home/${USER_NAME}/.xprofile" <<'XPROF'
# Venue POS — start kiosk user service when graphical session begins
if command -v systemctl >/dev/null 2>&1; then
  systemctl --user start venue-pos-kiosk.service 2>/dev/null || true
fi
XPROF
chown "${USER_NAME}:${USER_NAME}" "/home/${USER_NAME}/.xprofile"
