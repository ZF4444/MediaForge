#!/usr/bin/env bash
# Stop native services started by scripts/setup-dev.sh.
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MINIO_AGENT="$HOME/Library/LaunchAgents/com.readygo.mediaforge.minio.plist"

if [[ -f "$MINIO_AGENT" ]]; then
  launchctl bootout "gui/$(id -u)" "$MINIO_AGENT" >/dev/null 2>&1 || true
  rm -f "$MINIO_AGENT"
  printf 'Stopped MinIO.\n'
fi

if command -v brew >/dev/null 2>&1; then
  brew services stop postgresql@16 >/dev/null 2>&1 || true
  brew services stop redis >/dev/null 2>&1 || true
  printf 'Stopped PostgreSQL and Redis.\n'
fi
