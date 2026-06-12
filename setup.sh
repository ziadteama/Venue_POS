#!/usr/bin/env bash
# One-click Venue POS till setup (Ubuntu). Run from extracted USB bundle as root.
# Usage: sudo bash setup.sh
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec bash "${ROOT}/ops/linux/install.sh" "$@"
