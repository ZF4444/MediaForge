#!/usr/bin/env bash
# Prepare a reproducible native macOS MediaForge development environment.
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_TEMPLATE="$PROJECT_DIR/API/.env.example"
ENV_FILE="$PROJECT_DIR/API/.env"
INSTALL_SYSTEM_DEPS=true
START_INFRA=true
BUILD_FRONTEND=true
FORCE_ENV=false
ONLY_INFRA=false

usage() {
  cat <<'EOF'
Usage: ./scripts/setup-dev.sh [options]

Sets up a native macOS development environment: Homebrew dependencies,
API/.env, Python/frontend dependencies, PostgreSQL, Redis, and MinIO.

Options:
  --skip-system-deps     Do not install missing system dependencies.
  --skip-infra           Do not configure or start local PostgreSQL, Redis, and MinIO.
  --skip-frontend-build  Install frontend dependencies without building assets.
  --force-env            Replace API/.env with API/.env.example.
  --only-infra           Only configure and start native infrastructure.
  -h, --help             Show this help.
EOF
}

log() { printf '\n==> %s\n' "$*"; }
fail() { printf '\nError: %s\n' "$*" >&2; exit 1; }
has_command() { command -v "$1" >/dev/null 2>&1; }
has_postgres() {
  has_command brew && [[ -x "$(brew --prefix postgresql@16 2>/dev/null)/bin/psql" ]]
}

for argument in "$@"; do
  case "$argument" in
    --skip-system-deps) INSTALL_SYSTEM_DEPS=false ;;
    --skip-infra) START_INFRA=false ;;
    --skip-frontend-build) BUILD_FRONTEND=false ;;
    --force-env) FORCE_ENV=true ;;
    --only-infra) ONLY_INFRA=true ;;
    -h|--help) usage; exit 0 ;;
    *) fail "Unknown option: $argument" ;;
  esac
done

install_system_dependencies() {
  local missing=()
  has_command uv || missing+=(uv)
  has_command node || missing+=(node)
  has_command npm || missing+=(npm)
  has_command ffmpeg || missing+=(ffmpeg)
  has_postgres || missing+=(postgresql@16)
  has_command redis-server || missing+=(redis)
  has_command minio || missing+=(minio)
  ((${#missing[@]} == 0)) && return

  "$INSTALL_SYSTEM_DEPS" || fail "Missing system dependencies: ${missing[*]}. Re-run without --skip-system-deps."
  log "Installing missing system dependencies: ${missing[*]}"
  [[ "$(uname -s)" == Darwin ]] || fail "This native installer currently supports macOS."
  has_command brew || fail "Homebrew is required to install ${missing[*]}. Install it from https://brew.sh, then re-run this script."
  brew install uv node ffmpeg postgresql@16 redis minio/stable/minio
}

check_required_commands() {
  has_command uv || fail "uv is unavailable after installation. Open a new shell or add its install directory to PATH."
  has_command node || fail "Node.js 18 or newer is required."
  has_command npm || fail "npm is required."
  has_command ffmpeg || fail "FFmpeg is required."
  has_postgres || fail "PostgreSQL 16 is required."
  has_command redis-server || fail "Redis is required."
  has_command minio || fail "MinIO is required."
  local node_major
  node_major="$(node --version | sed -E 's/^v([0-9]+).*/\1/')"
  [[ "$node_major" =~ ^[0-9]+$ && "$node_major" -ge 18 ]] || fail "Node.js 18 or newer is required; found $(node --version)."
}

configure_env() {
  [[ -f "$ENV_TEMPLATE" ]] || fail "Environment template not found: $ENV_TEMPLATE"
  mkdir -p "$(dirname "$ENV_FILE")"
  if [[ -f "$ENV_FILE" && "$FORCE_ENV" == false ]]; then
    log "Keeping existing API/.env"
  else
    cp "$ENV_TEMPLATE" "$ENV_FILE"
    chmod 600 "$ENV_FILE"
    log "Created API/.env from the development template"
  fi
}

env_value() {
  local key="$1"
  awk -F= -v requested_key="$key" '$1 == requested_key { sub(/^[^=]*=/, ""); print; exit }' "$ENV_FILE"
}

sql_literal() {
  local value="$1"
  value="${value//\'/\'\'}"
  printf "'%s'" "$value"
}

sql_identifier() {
  local value="$1"
  value="${value//\"/\"\"}"
  printf '"%s"' "$value"
}

xml_escape() {
  printf '%s' "$1" | sed -e 's/&/\&amp;/g' -e 's/</\&lt;/g' -e 's/>/\&gt;/g' -e 's/"/\&quot;/g' -e "s/'/\&apos;/g"
}

wait_for() {
  local description="$1"
  shift
  local attempt
  for attempt in {1..30}; do
    if "$@" >/dev/null 2>&1; then
      return
    fi
    sleep 1
  done
  fail "$description did not become ready within 30 seconds."
}

configure_postgres() {
  local pg_prefix pg_user pg_password pg_database role_literal role_identifier password_literal database_literal
  pg_prefix="$(brew --prefix postgresql@16)"
  pg_user="$(env_value POSTGRES_USER)"
  pg_password="$(env_value POSTGRES_PASSWORD)"
  pg_database="$(env_value POSTGRES_DB)"
  [[ -n "$pg_user" && -n "$pg_password" && -n "$pg_database" ]] || fail "POSTGRES_USER, POSTGRES_PASSWORD, and POSTGRES_DB are required in API/.env."
  role_literal="$(sql_literal "$pg_user")"
  role_identifier="$(sql_identifier "$pg_user")"
  password_literal="$(sql_literal "$pg_password")"
  database_literal="$(sql_literal "$pg_database")"

  log "Starting native PostgreSQL"
  brew services start postgresql@16 >/dev/null
  wait_for "PostgreSQL" "$pg_prefix/bin/pg_isready" -h 127.0.0.1 -p 5432

  if ! "$pg_prefix/bin/psql" -h 127.0.0.1 postgres -tAc "SELECT 1 FROM pg_roles WHERE rolname = $role_literal" | grep -q 1; then
    "$pg_prefix/bin/psql" -h 127.0.0.1 postgres -v ON_ERROR_STOP=1 \
      -c "CREATE ROLE $role_identifier LOGIN PASSWORD $password_literal"
  else
    "$pg_prefix/bin/psql" -h 127.0.0.1 postgres -v ON_ERROR_STOP=1 \
      -c "ALTER ROLE $role_identifier PASSWORD $password_literal"
  fi

  if ! "$pg_prefix/bin/psql" -h 127.0.0.1 postgres -tAc "SELECT 1 FROM pg_database WHERE datname = $database_literal" | grep -q 1; then
    "$pg_prefix/bin/createdb" -h 127.0.0.1 -O "$pg_user" "$pg_database"
  fi
}

start_minio() {
  local minio_data minio_log minio_agent minio_access_key minio_secret_key launch_domain
  minio_data="$PROJECT_DIR/data/minio"
  minio_log="$PROJECT_DIR/logs/minio.log"
  minio_agent="$HOME/Library/LaunchAgents/com.readygo.mediaforge.minio.plist"
  minio_access_key="$(env_value MINIO_ROOT_USER)"
  minio_secret_key="$(env_value MINIO_ROOT_PASSWORD)"
  launch_domain="gui/$(id -u)"
  [[ -n "$minio_access_key" && -n "$minio_secret_key" ]] || fail "MINIO_ROOT_USER and MINIO_ROOT_PASSWORD are required in API/.env."

  mkdir -p "$minio_data" "$(dirname "$minio_log")" "$(dirname "$minio_agent")"
  cat > "$minio_agent" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.readygo.mediaforge.minio</string>
  <key>ProgramArguments</key><array>
    <string>$(command -v minio)</string><string>server</string><string>$(xml_escape "$minio_data")</string>
    <string>--address</string><string>127.0.0.1:9000</string>
    <string>--console-address</string><string>127.0.0.1:9001</string>
  </array>
  <key>EnvironmentVariables</key><dict>
    <key>MINIO_ROOT_USER</key><string>$(xml_escape "$minio_access_key")</string>
    <key>MINIO_ROOT_PASSWORD</key><string>$(xml_escape "$minio_secret_key")</string>
    <key>NO_PROXY</key><string>127.0.0.1,localhost</string>
    <key>no_proxy</key><string>127.0.0.1,localhost</string>
  </dict>
  <key>WorkingDirectory</key><string>$(xml_escape "$PROJECT_DIR")</string>
  <key>StandardOutPath</key><string>$(xml_escape "$minio_log")</string>
  <key>StandardErrorPath</key><string>$(xml_escape "$minio_log")</string>
  <key>RunAtLoad</key><true/><key>KeepAlive</key><true/>
</dict></plist>
EOF
  plutil -lint "$minio_agent" >/dev/null || fail "Generated MinIO launchd configuration is invalid."
  log "Starting native MinIO"
  launchctl bootout "$launch_domain" "$minio_agent" >/dev/null 2>&1 || true
  launchctl bootstrap "$launch_domain" "$minio_agent"
  launchctl kickstart -k "$launch_domain/com.readygo.mediaforge.minio"
  wait_for "MinIO" env -u http_proxy -u https_proxy -u all_proxy -u HTTP_PROXY -u HTTPS_PROXY -u ALL_PROXY \
    curl -fsS http://127.0.0.1:9000/minio/health/live
}

start_redis() {
  local brew_prefix redis_data redis_log redis_config
  brew_prefix="$(brew --prefix)"
  redis_data="$brew_prefix/var/db/redis"
  redis_log="$brew_prefix/var/log/redis.log"
  redis_config="$brew_prefix/etc/redis.conf"

  mkdir -p "$redis_data" "$(dirname "$redis_log")"
  {
    printf 'bind 127.0.0.1\n'
    printf 'port 6379\n'
    printf 'dir %s\n' "$redis_data"
    printf 'appendonly yes\n'
    printf 'logfile %s\n' "$redis_log"
  } > "$redis_config"

  log "Starting native Redis"
  brew services restart redis >/dev/null
  wait_for "Redis" redis-cli -h 127.0.0.1 -p 6379 ping
}

start_infrastructure() {
  "$START_INFRA" || return
  configure_postgres
  start_redis
  start_minio
}

install_system_dependencies
check_required_commands
configure_env
if "$ONLY_INFRA"; then
  start_infrastructure
  log "Native infrastructure is ready"
  exit 0
fi

log "Installing Python dependencies"
cd "$PROJECT_DIR"
uv sync

log "Installing frontend dependencies"
npm --prefix frontend ci
if "$BUILD_FRONTEND"; then
  log "Building frontend assets"
  npm --prefix frontend run build
fi

start_infrastructure

log "Development environment is ready"
printf 'Start the application with: uv run python main.py\n'
printf 'Application URL: http://127.0.0.1:3000\n'
printf 'MinIO console: http://127.0.0.1:9001\n'
