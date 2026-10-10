#!/usr/bin/env bash
# Increment the application patch version and rebuild frontend assets.
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VERSION_FILE="$PROJECT_DIR/VERSION"

fail() { printf 'Error: %s\n' "$*" >&2; exit 1; }

command -v npm >/dev/null 2>&1 || fail "npm is required to build the frontend."
[[ -f "$VERSION_FILE" ]] || fail "Version file not found: $VERSION_FILE"

version="$(tr -d '[:space:]' < "$VERSION_FILE")"
if [[ ! "$version" =~ ^([0-9]+)\.([0-9]+)\.([0-9]+)$ ]]; then
  fail "VERSION must use X.Y.Z format; found: $version"
fi

next_version="${BASH_REMATCH[1]}.${BASH_REMATCH[2]}.$((10#${BASH_REMATCH[3]} + 1))"

FRONTEND_DIR="$PROJECT_DIR/frontend"
LOCK_FILE="$FRONTEND_DIR/package-lock.json"
INSTALLED_LOCK="$FRONTEND_DIR/node_modules/.package-lock.json"

# 仅在依赖缺失或锁文件比已安装的更新时才重装，日常重新构建不需要 npm ci。
if [[ ! -d "$FRONTEND_DIR/node_modules" || ! -f "$INSTALLED_LOCK" || "$LOCK_FILE" -nt "$INSTALLED_LOCK" ]]; then
  printf 'Installing frontend dependencies (npm ci)...\n'
  (cd "$FRONTEND_DIR" && npm ci)
fi

printf 'Version: %s -> %s\n' "$version" "$next_version"
printf 'Building frontend assets...\n'
(cd "$FRONTEND_DIR" && npm run build)
printf '%s\n' "$next_version" > "$VERSION_FILE"
printf 'Frontend build completed.\n'
