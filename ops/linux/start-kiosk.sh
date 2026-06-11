#!/usr/bin/env bash
set -euo pipefail
export ELECTRON_IS_KIOSK=true
export VENUE_POS_AGENT_ROOT=/opt/venue-pos/local-agent
cd /opt/venue-pos/pos
exec ./node_modules/.bin/electron electron/main.cjs
