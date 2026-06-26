#!/bin/bash
set -e
ROOT="$(cd "$(dirname "$0")" && pwd)"

# ── Python venv ──────────────────────────────────────────────────────────────
if [ ! -d "$ROOT/venv" ]; then
  echo "Creating Python virtual environment…"
  python3 -m venv "$ROOT/venv"
fi

echo "Installing/checking Python dependencies…"
"$ROOT/venv/bin/pip" install -q -r "$ROOT/backend/requirements.txt"

# ── Frontend build ────────────────────────────────────────────────────────────
if [ ! -d "$ROOT/frontend/dist" ]; then
  echo "Building frontend…"
  cd "$ROOT/frontend"
  npm install
  npm run build
  cd "$ROOT"
fi

# ── LAN address ───────────────────────────────────────────────────────────────
LAN_IP=$(ipconfig getifaddr en0 2>/dev/null \
      || ipconfig getifaddr en1 2>/dev/null \
      || echo "localhost")

echo ""
echo "Real Estate Tracker"
echo "  Local:   http://localhost:8005"
echo "  Network: http://$LAN_IP:8005"
echo ""
echo "Press Ctrl+C to stop."
echo ""

cd "$ROOT/backend"
"$ROOT/venv/bin/uvicorn" main:app --host 0.0.0.0 --port 8005
