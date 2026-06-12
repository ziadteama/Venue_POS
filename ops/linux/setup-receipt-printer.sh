#!/usr/bin/env bash
# Configure CUPS raw queue for USB ESC/POS receipt printer (Elgin, Epson, etc.)
# Usage: sudo bash setup-receipt-printer.sh [install_root]
set -euo pipefail

INSTALL_ROOT="${1:-/opt/venue-pos}"
QUEUE_NAME="${VENUE_RECEIPT_PRINTER_NAME:-VenueReceipt}"
ENV_FILE="${INSTALL_ROOT}/local-agent/.env"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run as root: sudo bash setup-receipt-printer.sh"
  exit 1
fi

echo "==> CUPS receipt printer (${QUEUE_NAME})"
systemctl enable cups 2>/dev/null || true
systemctl start cups 2>/dev/null || true

detect_printer_uri() {
  local uri
  uri="$(lpinfo -v 2>/dev/null | grep -iE 'usb|serial|parallel' | awk '{print $2}' | head -1 || true)"
  if [[ -n "${uri}" && "${uri}" =~ ^(usb|serial|parallel):// ]]; then
    echo "${uri}"
    return 0
  fi

  if [[ -e /dev/usb/lp0 ]]; then
    echo "parallel:/dev/usb/lp0"
    return 0
  fi
  if [[ -e /dev/usb/lp1 ]]; then
    echo "parallel:/dev/usb/lp1"
    return 0
  fi
  local tty
  tty="$(ls -1 /dev/ttyUSB* 2>/dev/null | head -1 || true)"
  if [[ -n "${tty}" ]]; then
    echo "serial:${tty}?baud=115200"
    return 0
  fi
  return 1
}

update_env_var() {
  local key="$1" val="$2" tmp
  mkdir -p "$(dirname "${ENV_FILE}")"
  touch "${ENV_FILE}"
  if grep -q "^${key}=" "${ENV_FILE}" 2>/dev/null; then
    tmp="$(mktemp)"
    grep -v "^${key}=" "${ENV_FILE}" > "${tmp}" || true
    printf '%s=%s\n' "${key}" "${val}" >> "${tmp}"
    mv "${tmp}" "${ENV_FILE}"
  else
    printf '%s=%s\n' "${key}" "${val}" >> "${ENV_FILE}"
  fi
}

uri=""
if uri="$(detect_printer_uri)"; then
  lpadmin -x "${QUEUE_NAME}" 2>/dev/null || true
  if ! lpadmin -p "${QUEUE_NAME}" -E -v "${uri}" -m raw 2>/dev/null; then
    lpadmin -p "${QUEUE_NAME}" -E -v "${uri}" -i /usr/share/cups/model/raw 2>/dev/null \
      || lpadmin -p "${QUEUE_NAME}" -E -v "${uri}" 2>/dev/null
  fi
  cupsenable "${QUEUE_NAME}" 2>/dev/null || true
  cupsaccept "${QUEUE_NAME}" 2>/dev/null || true
  lpoptions -d "${QUEUE_NAME}" 2>/dev/null || true
  echo "    Queue ${QUEUE_NAME} -> ${uri}"
else
  echo "    No USB/serial receipt printer detected."
  echo "    Plug in the printer, then run:"
  echo "      sudo bash ${INSTALL_ROOT}/ops/linux/setup-receipt-printer.sh"
fi

update_env_var RECEIPT_PRINTER_MODE cups
update_env_var FEATURE_CASH_DRAWER true
if [[ -n "${uri}" ]]; then
  update_env_var RECEIPT_PRINTER_NAME "${QUEUE_NAME}"
fi

if id venuepos &>/dev/null; then
  usermod -aG lp venuepos 2>/dev/null || true
  chown venuepos:venuepos "${ENV_FILE}" 2>/dev/null || true
fi
