#!/bin/bash
set -e
ROOT="$(cd "$(dirname "$0")" && pwd)"

cd "$ROOT/frontend"
npm install
npm run build
echo "Frontend rebuilt — restart start.sh to pick up changes."
