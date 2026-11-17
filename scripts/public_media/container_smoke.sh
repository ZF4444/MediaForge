#!/usr/bin/env bash
# Only disposable test resources; never use the development project name.
set -euo pipefail
cd "$(dirname "$0")/../.."
smoke_project="mediaforge-media-smoke-$$"
smoke_compose=(docker compose --env-file config/dev/.env -p "$smoke_project" -f config/dev/public-media-smoke.yml)
cleanup() { "${smoke_compose[@]}" down --volumes --remove-orphans >/dev/null 2>&1; }
trap cleanup EXIT
"${smoke_compose[@]}" up -d --wait --wait-timeout 90 media-edge
"${smoke_compose[@]}" run --rm --no-deps verify
