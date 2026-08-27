#!/usr/bin/env bash
# Back up PostgreSQL, Redis, and MinIO data used by MediaForge.
set -Eeuo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUTPUT_DIR="${BACKUP_DIR:-${PROJECT_DIR}/backups}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
ONLY="all"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
RUN_DIR=""

usage() {
  cat <<'EOF'
Usage: scripts/backup_services.sh [options]

Options:
  --output-dir DIR       Backup root (default: $BACKUP_DIR or ./backups)
  --retention-days N     Delete completed backup directories older than N days
                         (default: $BACKUP_RETENTION_DAYS or 14)
  --only SERVICE         postgres, redis, minio, or all (default: all)
  --help                 Show this help

Required environment variables:
  PostgreSQL: DATABASE_URL
  Redis:      REDIS_URL
  MinIO:      MINIO_ENDPOINT, MINIO_ACCESS_KEY, MINIO_SECRET_KEY
EOF
}

die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
log() { printf '[%s] %s\n' "$(date -u +%FT%TZ)" "$*"; }

while (($#)); do
  case "$1" in
    --output-dir) (($# >= 2)) || die "--output-dir requires a value"; OUTPUT_DIR="$2"; shift 2 ;;
    --retention-days) (($# >= 2)) || die "--retention-days requires a value"; RETENTION_DAYS="$2"; shift 2 ;;
    --only) (($# >= 2)) || die "--only requires a value"; ONLY="$2"; shift 2 ;;
    --help|-h) usage; exit 0 ;;
    *) die "unknown option: $1" ;;
  esac
done

[[ "$RETENTION_DAYS" =~ ^[0-9]+$ ]] || die "retention days must be a non-negative integer"
case "$ONLY" in postgres|redis|minio|all) ;; *) die "--only must be postgres, redis, minio, or all" ;; esac

need() { command -v "$1" >/dev/null 2>&1 || die "required command not found: $1"; }
selected() { [[ "$ONLY" == all || "$ONLY" == "$1" ]]; }

mkdir -p "$OUTPUT_DIR"
RUN_DIR="${OUTPUT_DIR%/}/.in-progress-${TIMESTAMP}-$$"
mkdir -p "$RUN_DIR"
chmod 700 "$RUN_DIR"
cleanup() { local status=$?; if ((status != 0)); then rm -rf -- "$RUN_DIR"; fi; exit "$status"; }
trap cleanup EXIT INT TERM

manifest="$RUN_DIR/manifest.txt"
{
  printf 'created_at=%s\n' "$TIMESTAMP"
  printf 'hostname=%s\n' "$(hostname 2>/dev/null || printf unknown)"
  printf 'services=%s\n' "$ONLY"
} > "$manifest"

if selected postgres; then
  [[ -n "${DATABASE_URL:-}" ]] || die "DATABASE_URL is required for PostgreSQL backup"
  need pg_dump
  log "Backing up PostgreSQL"
  pg_dump --dbname="$DATABASE_URL" --format=custom --no-owner --no-privileges --file="$RUN_DIR/postgres.dump"
  printf 'postgres_dump_bytes=%s\n' "$(stat -c '%s' "$RUN_DIR/postgres.dump" 2>/dev/null || stat -f '%z' "$RUN_DIR/postgres.dump")" >> "$manifest"
fi

if selected redis; then
  [[ -n "${REDIS_URL:-}" ]] || die "REDIS_URL is required for Redis backup"
  need redis-cli
  log "Backing up Redis (redis-cli --rdb)"
  redis-cli -u "$REDIS_URL" --rdb "$RUN_DIR/redis.rdb"
  printf 'redis_rdb_bytes=%s\n' "$(stat -c '%s' "$RUN_DIR/redis.rdb" 2>/dev/null || stat -f '%z' "$RUN_DIR/redis.rdb")" >> "$manifest"
fi

if selected minio; then
  [[ -n "${MINIO_ENDPOINT:-}" && -n "${MINIO_ACCESS_KEY:-}" && -n "${MINIO_SECRET_KEY:-}" ]] || die "MINIO_ENDPOINT, MINIO_ACCESS_KEY, and MINIO_SECRET_KEY are required for MinIO backup"
  need mc
  protocol=http
  [[ "${MINIO_SECURE:-false}" =~ ^(1|true|yes|on)$ ]] && protocol=https
  mc_alias="mediaforge-backup-${$}"
  minio_host="${MINIO_ENDPOINT#http://}"
  minio_host="${minio_host#https://}"
  mc alias set "$mc_alias" "$protocol://$minio_host" "$MINIO_ACCESS_KEY" "$MINIO_SECRET_KEY" >/dev/null
  minio_dir="$RUN_DIR/minio"
  mkdir -p "$minio_dir"
  minio_buckets=("${MINIO_BUCKET_PRIVATE:-mediaforge-private}" "${MINIO_BUCKET_PUBLIC:-mediaforge-public}" "${MINIO_BUCKET_TEMP:-mediaforge-temp}")
  log "Backing up MinIO buckets"
  for bucket in "${minio_buckets[@]}"; do
    [[ "$bucket" =~ ^[A-Za-z0-9][A-Za-z0-9._-]*$ ]] || die "invalid MinIO bucket name: $bucket"
    mc mirror --preserve "$mc_alias/$bucket" "$minio_dir/$bucket"
    printf 'minio_bucket=%s\n' "$bucket" >> "$manifest"
  done
  mc alias remove "$mc_alias" >/dev/null 2>&1 || true
fi

log "Writing checksums"
(cd "$RUN_DIR" && find . -type f ! -name SHA256SUMS -print0 | sort -z | xargs -0 sha256sum) > "$RUN_DIR/SHA256SUMS"
chmod 600 "$manifest" "$RUN_DIR/SHA256SUMS"

final_dir="${OUTPUT_DIR%/}/$TIMESTAMP"
mv -- "$RUN_DIR" "$final_dir"
RUN_DIR=""
find "$OUTPUT_DIR" -mindepth 1 -maxdepth 1 -type d -name '20*' -mtime "+$RETENTION_DAYS" -print -exec rm -rf -- {} +
log "Backup completed: $final_dir"
