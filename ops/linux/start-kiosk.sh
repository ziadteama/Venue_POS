#!/usr/bin/env bash
# Venue POS kiosk launcher — waits for agent, AppImage-first, auto-restart on crash.
set -uo pipefail

export ELECTRON_IS_KIOSK=true
export VENUE_POS_AGENT_ROOT=/opt/venue-pos/local-agent
export DISPLAY="${DISPLAY:-:0}"

POS_DIR="/opt/venue-pos/pos"
LOCK_FILE="${HOME}/.local/share/venue-pos/kiosk.lock"
LOG_DIR="${HOME}/.local/share/venue-pos"
LOG_FILE="${LOG_DIR}/kiosk.log"
AGENT_HEALTH_URL="http://127.0.0.1:3456/health"
AGENT_WAIT_SEC=120
BACKOFF_SEC=2
MAX_BACKOFF_SEC=60
RESTART_COUNT=0

mkdir -p "${LOG_DIR}"
exec 9>"${LOCK_FILE}"
if ! flock -n 9; then
  echo "kiosk already running (lock ${LOCK_FILE})" >&2
  exit 0
fi

cd "${POS_DIR}"

log() {
  printf '%s %s\n' "$(date -Iseconds)" "$*" | tee -a "${LOG_FILE}"
}

if [[ -f "${POS_DIR}/.env.updater" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "${POS_DIR}/.env.updater"
  set +a
fi

wait_for_agent() {
  local elapsed=0
  while [[ "${elapsed}" -lt "${AGENT_WAIT_SEC}" ]]; do
    if curl -sf --max-time 2 "${AGENT_HEALTH_URL}" >/dev/null 2>&1; then
      log "agent ready (${AGENT_HEALTH_URL})"
      return 0
    fi
    sleep 2
    elapsed=$((elapsed + 2))
  done
  log "WARNING: agent not ready after ${AGENT_WAIT_SEC}s — launching POS anyway"
  return 1
}

resolve_appimage() {
  local img=""
  if compgen -G "${POS_DIR}/release/*.AppImage" > /dev/null; then
    img="$(ls -1 "${POS_DIR}/release/"*.AppImage 2>/dev/null | head -1)"
  fi
  if [[ -n "${img}" && -x "${img}" ]]; then
    echo "${img}"
    return 0
  fi
  return 1
}

launch_pos() {
  local appimage
  if appimage="$(resolve_appimage)"; then
    log "launch AppImage ${appimage}"
    "${appimage}" --no-sandbox
    return $?
  fi
  log "launch unpackaged electron (no AppImage — build bundle on Linux for production)"
  ./node_modules/.bin/electron electron/main.cjs
}

log "kiosk start (pid $$)"
wait_for_agent || true

while true; do
  launch_pos
  EXIT_CODE=$?
  RESTART_COUNT=$((RESTART_COUNT + 1))
  log "POS exited code=${EXIT_CODE} restart=#${RESTART_COUNT} backoff=${BACKOFF_SEC}s"
  sleep "${BACKOFF_SEC}"
  if [[ "${BACKOFF_SEC}" -lt "${MAX_BACKOFF_SEC}" ]]; then
    BACKOFF_SEC=$((BACKOFF_SEC * 2))
    if [[ "${BACKOFF_SEC}" -gt "${MAX_BACKOFF_SEC}" ]]; then
      BACKOFF_SEC="${MAX_BACKOFF_SEC}"
    fi
  fi
done
