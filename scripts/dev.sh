#!/usr/bin/env bash
# Run from any directory; all dependencies run through Compose.
set -euo pipefail
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_DIR"
compose=(docker compose -f config/dev/compose.yml)
if [[ ! -f config/dev/.env ]]; then
  echo 'Create config/dev/.env from config/dev/.env.example and set APP_SECRET_KEY first.' >&2
  exit 1
fi
case "${1:-up}" in
  up) "${compose[@]}" up -d --build ;;
  down) "${compose[@]}" down ;;
  logs) "${compose[@]}" logs -f api worker ;;
  frontend) "${compose[@]}" run --rm frontend ;;
  worker) "${compose[@]}" restart worker ;;
  test) shift; "${compose[@]}" exec api python -m pytest "$@" ;;
  *) "${compose[@]}" "$@" ;;
esac
