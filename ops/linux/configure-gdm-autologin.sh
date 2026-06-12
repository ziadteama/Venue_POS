#!/usr/bin/env bash
# Patch GDM custom.conf for venuepos autologin + X11 (Electron). Run as root.
set -euo pipefail

USER_NAME="${1:-venuepos}"
GDM_CONF="/etc/gdm3/custom.conf"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run as root"
  exit 1
fi

if [[ ! -f "${GDM_CONF}" ]]; then
  echo "GDM not installed (${GDM_CONF} missing) — skip GDM autologin"
  exit 0
fi

echo "==> GDM autologin (${USER_NAME}) + X11 for Electron"

# GDM reads custom.conf only — custom.conf.d is ignored on Ubuntu.
cp -a "${GDM_CONF}" "${GDM_CONF}.venue-pos.bak" 2>/dev/null || true

python3 - "${GDM_CONF}" "${USER_NAME}" <<'PY'
import re
import sys

path, user = sys.argv[1], sys.argv[2]
text = open(path, encoding="utf-8").read()

settings = {
    "WaylandEnable": "false",
    "AutomaticLoginEnable": "true",
    "AutomaticLogin": user,
}

if "[daemon]" not in text:
    text = text.rstrip() + "\n\n[daemon]\n"

for key, value in settings.items():
    pattern = rf"^#?\s*{re.escape(key)}=.*$"
    replacement = f"{key}={value}"
    if re.search(pattern, text, flags=re.MULTILINE):
        text = re.sub(pattern, replacement, text, count=1, flags=re.MULTILINE)
    else:
        text = re.sub(
            r"(\[daemon\]\s*\n)",
            rf"\1{replacement}\n",
            text,
            count=1,
        )

open(path, "w", encoding="utf-8").write(text)
PY

systemctl enable gdm3 2>/dev/null || systemctl enable gdm 2>/dev/null || true
systemctl set-default graphical.target 2>/dev/null || true
