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

printf 'Version: %s -> %s\n' "$version" "$next_version"
printf 'Building frontend assets...\n'
(cd "$PROJECT_DIR/frontend" && npm run build)
printf '%s\n' "$next_version" > "$VERSION_FILE"
printf 'Frontend build completed.\n'
