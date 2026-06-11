#!/usr/bin/env bash
set -euo pipefail

echo "=== venue-pos-agent ==="
systemctl is-active venue-pos-agent

echo "=== Agent /health ==="
curl -sf http://127.0.0.1:3456/health | head -c 200
echo "..."

echo "=== Hub API ==="
curl -sf http://192.168.100.221:3000/health
echo

echo "=== Terminal features (HTTP code) ==="
curl -s -o /dev/null -w "%{http_code}\n" \
  -H "x-terminal-id: 00000000-0000-4000-8000-000000000001" \
  -H "x-terminal-secret: dev-terminal-secret" \
  http://192.168.100.221:3000/api/v1/features

echo "=== PIN login via agent ==="
curl -sf -X POST http://127.0.0.1:3456/v1/auth/pin \
  -H "content-type: application/json" \
  -d '{"pin":"1234"}'

echo
echo "=== Electron ==="
/opt/venue-pos/pos/node_modules/electron/dist/electron --version

echo "=== DONE ==="
