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
# Venue POS — launch kiosk when openbox session starts; keep Openbox + panel alive
export DISPLAY=:0
export ELECTRON_IS_KIOSK=true
export VENUE_POS_AGENT_ROOT=${INSTALL_ROOT}/local-agent
export VENUE_POS_FORCE_SETUP=1
lxpanel &
${INSTALL_ROOT}/pos/start-kiosk.sh &
EOF
chmod +x "${HOME_DIR}/.config/openbox/autostart"

# Openbox rc.xml — semi-kiosk keybinding config:
#   - Alt+Tab / Alt+Shift+Tab / Super+Tab are swallowed (no window switching while POS is active)
#   - The two toggle scripts below replace rc.xml and call `openbox --reconfigure` to
#     enable/disable Alt+Tab dynamically when the worker pauses/resumes the POS.
cat > "${HOME_DIR}/.config/openbox/rc.xml" <<'RCXML'
<?xml version="1.0" encoding="UTF-8"?>
<openbox_config xmlns="http://openbox.org/3.4/rc">
  <keyboard>
    <!-- Semi-kiosk: block Alt+Tab window switching while POS is active. -->
    <!-- The kiosk-alttab-enable.sh / kiosk-alttab-disable.sh scripts swap this -->
    <!-- file and call `openbox --reconfigure` to toggle the block at runtime.   -->
    <keybind key="A-Tab">
      <action name="Execute"><command>true</command></action>
    </keybind>
    <keybind key="A-S-Tab">
      <action name="Execute"><command>true</command></action>
    </keybind>
    <keybind key="W-Tab">
      <action name="Execute"><command>true</command></action>
    </keybind>
  </keyboard>
</openbox_config>
RCXML

# rc.xml variant that RE-ENABLES Alt+Tab (written on kiosk pause).
cat > "${HOME_DIR}/.config/openbox/rc-alttab-enabled.xml" <<'RCENABLED'
<?xml version="1.0" encoding="UTF-8"?>
<openbox_config xmlns="http://openbox.org/3.4/rc">
  <keyboard>
    <!-- Alt+Tab enabled — worker has entered the semi-kiosk exit code. -->
    <keybind key="A-Tab">
      <action name="NextWindow">
        <finalactions>
          <action name="Focus"/>
          <action name="Raise"/>
          <action name="Unshade"/>
        </finalactions>
      </action>
    </keybind>
    <keybind key="A-S-Tab">
      <action name="PreviousWindow">
        <finalactions>
          <action name="Focus"/>
          <action name="Raise"/>
          <action name="Unshade"/>
        </finalactions>
      </action>
    </keybind>
  </keyboard>
</openbox_config>
RCENABLED

# Toggle scripts called by Electron main process via shell exec on pause/resume.
cat > "${HOME_DIR}/.config/openbox/kiosk-alttab-enable.sh" <<'ENABLE'
#!/usr/bin/env bash
# Called by Electron when worker enters exit code — re-enable Alt+Tab.
set -euo pipefail
RC="${HOME}/.config/openbox/rc.xml"
RC_ON="${HOME}/.config/openbox/rc-alttab-enabled.xml"
if [[ -f "${RC_ON}" ]]; then
  cp -f "${RC_ON}" "${RC}"
  DISPLAY="${DISPLAY:-:0}" openbox --reconfigure 2>/dev/null || true
fi
ENABLE
chmod +x "${HOME_DIR}/.config/openbox/kiosk-alttab-enable.sh"

cat > "${HOME_DIR}/.config/openbox/kiosk-alttab-disable.sh" <<'DISABLE'
#!/usr/bin/env bash
# Called by Electron when POS resumes — re-block Alt+Tab.
set -euo pipefail
RC="${HOME}/.config/openbox/rc.xml"
printf '%s\n' \
  '<?xml version="1.0" encoding="UTF-8"?>' \
  '<openbox_config xmlns="http://openbox.org/3.4/rc">' \
  '  <keyboard>' \
  '    <keybind key="A-Tab">' \
  '      <action name="Execute"><command>true</command></action>' \
  '    </keybind>' \
  '    <keybind key="A-S-Tab">' \
  '      <action name="Execute"><command>true</command></action>' \
  '    </keybind>' \
  '    <keybind key="W-Tab">' \
  '      <action name="Execute"><command>true</command></action>' \
  '    </keybind>' \
  '  </keyboard>' \
  '</openbox_config>' > "${RC}"
DISPLAY="${DISPLAY:-:0}" openbox --reconfigure 2>/dev/null || true
DISABLE
chmod +x "${HOME_DIR}/.config/openbox/kiosk-alttab-disable.sh"

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
