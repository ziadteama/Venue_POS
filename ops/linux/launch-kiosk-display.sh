#!/usr/bin/env bash
# System-level kiosk launcher — waits for X display :0, then runs POS as venuepos.
set -euo pipefail

USER_NAME="venuepos"
INSTALL_ROOT="/opt/venue-pos"
DISPLAY_NUM=":0"
WAIT_SEC=180
LOG_FILE="/var/log/venue-pos-kiosk-display.log"

log() {
  printf '%s %s\n' "$(date -Iseconds)" "$*" | tee -a "${LOG_FILE}"
}

if ! id "${USER_NAME}" &>/dev/null; then
  log "ERROR: user ${USER_NAME} does not exist"
  exit 1
fi

uid="$(id -u "${USER_NAME}")"
export DISPLAY="${DISPLAY_NUM}"

log "Waiting for X display ${DISPLAY_NUM} (up to ${WAIT_SEC}s)"
ready=false
for _ in $(seq 1 $((WAIT_SEC / 2))); do
  if sudo -u "${USER_NAME}" DISPLAY="${DISPLAY_NUM}" xdpyinfo >/dev/null 2>&1; then
    ready=true
    break
  fi
  sleep 2
done

if [[ "${ready}" != true ]]; then
  log "ERROR: no X display on ${DISPLAY_NUM} — is GDM running and venuepos logged in?"
  exit 1
fi

if pgrep -u "${USER_NAME}" -f 'Venue POS|venue-pos|electron.*kiosk|start-kiosk' >/dev/null 2>&1; then
  log "Kiosk already running — exit"
  exit 0
fi

xauth=""
for candidate in \
  "/home/${USER_NAME}/.Xauthority" \
  "/run/user/${uid}/gdm/Xauthority" \
  "/run/user/${uid}/.mutter-XwaylandAuth.*"; do
  # shellcheck disable=SC2086
  for path in ${candidate}; do
    if [[ -f "${path}" ]]; then
      xauth="${path}"
      break 2
    fi
  done
done

log "Starting kiosk as ${USER_NAME} (DISPLAY=${DISPLAY_NUM})"

exec sudo -u "${USER_NAME}" \
  DISPLAY="${DISPLAY_NUM}" \
  ${xauth:+XAUTHORITY="${xauth}"} \
  XDG_RUNTIME_DIR="/run/user/${uid}" \
  DBUS_SESSION_BUS_ADDRESS="unix:path=/run/user/${uid}/bus" \
  ELECTRON_IS_KIOSK=true \
  VENUE_POS_AGENT_ROOT="${INSTALL_ROOT}/local-agent" \
  VENUE_POS_FORCE_SETUP=1 \
  "${INSTALL_ROOT}/pos/start-kiosk.sh"
