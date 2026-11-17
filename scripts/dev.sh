#!/usr/bin/env bash
# Run from any directory; all dependencies run through Compose.
set -euo pipefail
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_DIR"
if [[ ! -f config/dev/.env ]]; then
  echo 'Create config/dev/.env from config/dev/.env.example and set APP_SECRET_KEY first.' >&2
  exit 1
fi
# Keep media networks/HBA stable, regardless of the runtime feature switch.
compose=(docker compose --env-file config/dev/.env -f config/dev/compose.yml -f config/dev/public-media.yml)
# Read only this literal boolean; never source a credential file as shell code.
# Docker Compose gives exported variables precedence over its --env-file too.
if [[ -v PUBLIC_VIDEO_ENABLED ]]; then
  media_enabled="$PUBLIC_VIDEO_ENABLED"
else
  media_enabled="$(awk '
    /^[[:space:]]*(export[[:space:]]+)?PUBLIC_VIDEO_ENABLED[[:space:]]*=/ {
      sub(/^[^=]*=[[:space:]]*/, ""); value=$0
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", value)
      quote=substr(value,1,1)
      if (quote == "\"" || quote == sprintf("%c",39)) {
        value=substr(value,2); end=index(value,quote)
        if (end) value=substr(value,1,end-1)
      } else { sub(/[[:space:]]+#.*/, "", value) }
      gsub(/[[:space:]]+$/, "", value)
    }
    END { print value }
  ' config/dev/.env)"
fi
media_enabled="${media_enabled:-false}"
case "${media_enabled,,}" in
  true) compose+=(--profile public-media) ;;
  false) ;;
  *) echo 'PUBLIC_VIDEO_ENABLED must be a literal true or false in config/dev/.env or the exported environment.' >&2; exit 1 ;;
esac

if [[ "${media_enabled,,}" != true && "${1:-up}" == up ]]; then
  # Applying a disabled switch must also close previously running download entrypoints.
  "${compose[@]}" --profile public-media --profile media-https stop media-edge media-gateway
fi
case "${1:-up}" in
  up) "${compose[@]}" up -d --build ;;
  down) "${compose[@]}" --profile public-media --profile media-https down ;;
  stop) "${compose[@]}" --profile public-media --profile media-https stop ;;
  logs) "${compose[@]}" logs -f api worker ;;
  frontend) "${compose[@]}" run --rm frontend ;;
  worker) "${compose[@]}" restart worker ;;
  test) shift; "${compose[@]}" exec api python -m pytest "$@" ;;
  init) "${compose[@]}" --profile init run --rm project-init ;;
  media-init)
    "${compose[@]}" up -d postgres minio
    "${compose[@]}" --profile media-tools run --rm --no-deps media-init
    ;;
  media-up)
    "${compose[@]}" --profile public-media up -d --build
    ;;
  media-https)
    "${compose[@]}" --profile public-media --profile media-https up -d --build media-edge
    ;;
  media-recover)
    # Stop entry BEFORE invalidating. Leave it stopped even if recovery fails.
    "${compose[@]}" --profile public-media --profile media-https stop media-edge media-gateway
    "${compose[@]}" --profile media-tools run --rm --no-deps media-recover
    ;;
  media-test)
    shift
    test_compose=(docker compose --env-file config/dev/.env -f config/dev/public-media-test.yml)
    "${test_compose[@]}" build integration
    "${test_compose[@]}" run --rm --no-deps integration "$@"
    ;;
  media-smoke)
    docker compose --env-file config/dev/.env -f config/dev/compose.yml -f config/dev/public-media.yml --profile public-media --profile media-https build media-gateway media-edge
    docker compose --env-file config/dev/.env -f config/dev/public-media-test.yml build integration
    ./scripts/public_media/container_smoke.sh
    ;;
  *) "${compose[@]}" "$@" ;;
esac
