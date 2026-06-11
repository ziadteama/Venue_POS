#!/usr/bin/env bash
set -euo pipefail
export ELECTRON_IS_KIOSK=true
export VENUE_POS_AGENT_ROOT=/opt/venue-pos/local-agent
cd /opt/venue-pos/pos

APPIMAGE=""
if compgen -G "/opt/venue-pos/pos/release/*.AppImage" > /dev/null; then
  APPIMAGE="$(ls -1 /opt/venue-pos/pos/release/*.AppImage | head -1)"
fi

if [[ -n "${APPIMAGE}" && -x "${APPIMAGE}" ]]; then
  exec "${APPIMAGE}" --no-sandbox
fi

exec ./node_modules/.bin/electron electron/main.cjs
