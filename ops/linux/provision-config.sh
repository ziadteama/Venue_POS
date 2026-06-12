#!/usr/bin/env bash
# Write POS config + agent .env from CLI flags (optional zero-wizard deploy).
set -euo pipefail

INSTALL_ROOT="${1:-/opt/venue-pos}"
USER_NAME="${2:-venuepos}"
API_URL="${3:-}"
TERMINAL_ID="${4:-}"
TERMINAL_SECRET="${5:-}"
VENUE_ID="${6:-}"

if [[ -z "${API_URL}" || -z "${TERMINAL_ID}" || -z "${TERMINAL_SECRET}" ]]; then
  echo "provision-config: missing required args"
  exit 1
fi

API_URL="${API_URL%/}"
CONFIG_DIR="/home/${USER_NAME}/.config/Venue POS"
CONFIG_FILE="${CONFIG_DIR}/pos-config.json"
ENV_FILE="${INSTALL_ROOT}/local-agent/.env"
LAN_HOST="$(hostname -I 2>/dev/null | awk '{print $1}' || echo '127.0.0.1')"
NOW="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

mkdir -p "${CONFIG_DIR}"
cat > "${CONFIG_FILE}" <<EOF
{
  "apiUrl": "${API_URL}",
  "agentUrl": "http://127.0.0.1:3456",
  "terminalId": "${TERMINAL_ID}",
  "terminalSecret": "${TERMINAL_SECRET}",
  "venueId": "${VENUE_ID}",
  "kitchenPrinterHost": "",
  "kitchenPrinterPort": 9100,
  "receiptPrinterName": "VenueReceipt",
  "agentLanHost": "${LAN_HOST}",
  "agentLanPort": 3456,
  "isCoordinator": false,
  "coordinatorFallbackEnabled": false,
  "kioskMode": true,
  "setupComplete": true,
  "setupValidatedAt": "${NOW}",
  "configVersion": 1
}
EOF

cat > "${ENV_FILE}" <<EOF
PORT=3456
HOST=0.0.0.0
SQLITE_PATH=./data/local.db
SQLITE_WAL_MODE=true
TERMINAL_ID=${TERMINAL_ID}
TERMINAL_SECRET=${TERMINAL_SECRET}
VENUE_ID=${VENUE_ID}
SERVER_API_URL=${API_URL}
CLOUD_HEALTH_URL=${API_URL}/health
AGENT_LAN_PORT=3456
AGENT_LAN_HOST=${LAN_HOST}
AGENT_LAN_SECRET=
AGENT_PEERS=
AGENT_PRIORITY=50
AGENT_DEVICE_LABEL=
KITCHEN_PRINTER_HOST=
KITCHEN_PRINTER_PORT=9100
RECEIPT_PRINTER_MODE=cups
RECEIPT_PRINTER_NAME=VenueReceipt
FEATURE_CASH_DRAWER=true
COORDINATOR_TERMINAL_ID=
COORDINATOR_LAN_HOST=
COORDINATOR_FALLBACK_ENABLED=false
IS_COORDINATOR=false
CORS_ALLOWED_ORIGINS=http://localhost:5174,http://127.0.0.1:5174
EOF

mkdir -p "${INSTALL_ROOT}/local-agent/data"
chown -R "${USER_NAME}:${USER_NAME}" "${CONFIG_DIR}"
chown "${USER_NAME}:${USER_NAME}" "${ENV_FILE}"
chmod 600 "${ENV_FILE}"

rm -f /var/lib/venue-pos/needs-wizard
# Clear force-setup in user kiosk unit after CLI provision
if [[ -f "/home/${USER_NAME}/.config/systemd/user/venue-pos-kiosk.service" ]]; then
  sed -i '/VENUE_POS_FORCE_SETUP/d' "/home/${USER_NAME}/.config/systemd/user/venue-pos-kiosk.service" || true
fi

echo "Provisioned till config for terminal ${TERMINAL_ID}"
