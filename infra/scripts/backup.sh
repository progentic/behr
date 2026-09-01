#!/usr/bin/env bash
set -Eeuo pipefail

readonly REPOSITORY_ROOT="/opt/bhr-cms"
readonly ENV_FILE="/etc/bhr-cms/bhr-api.env"
readonly ASSET_ROOT="/var/lib/bhr-cms/uploads"
readonly ASSET_STAGING="/var/lib/bhr-cms/uploads.staging"
readonly ASSET_PRE_RESTORE="/var/lib/bhr-cms/uploads.pre-restore"
readonly BACKUP_ROOT="/var/backups/bhr-cms"
readonly OPS_LOCK="/run/lock/bhr-cms-ops.lock"
readonly SERVICE_NAME="bhr-api.service"
readonly EXPECTED_HEALTH_BODY='{"status":"ok"}'

BACKUP_STAGE="startup"
SERVICE_STOPPED=0
STAGING_DIR=""
TEMP_ARCHIVE=""
FINAL_ARCHIVE=""

main() {
  trap handle_backup_exit EXIT
  prepare_backup
  enter_backup_maintenance
  capture_backup_components
  finalize_backup_archive
  leave_backup_maintenance
  BACKUP_STAGE="complete"
  printf 'backup_archive=%s\n' "$FINAL_ARCHIVE"
}

prepare_backup() {
  BACKUP_STAGE="preflight"
  require_root
  acquire_operations_lock
  require_clean_restore_state
  require_backup_commands
  load_production_environment
  validate_backup_environment
  load_database_environment
  validate_backup_paths
  require_healthy_service
  prepare_backup_paths
}

enter_backup_maintenance() {
  BACKUP_STAGE="service-stop"
  systemctl stop "$SERVICE_NAME"
  SERVICE_STOPPED=1
}

capture_backup_components() {
  BACKUP_STAGE="database-dump"
  pg_dump --format=custom --no-owner --no-acl \
    --file="$STAGING_DIR/database.dump"
  BACKUP_STAGE="asset-archive"
  tar -C "$ASSET_ROOT" -cf "$STAGING_DIR/assets.tar" .
  BACKUP_STAGE="manifest"
  create_backup_manifest
  create_backup_checksums
}

finalize_backup_archive() {
  BACKUP_STAGE="archive-finalize"
  tar -C "$STAGING_DIR" -czf "$TEMP_ARCHIVE" \
    database.dump assets.tar manifest.txt SHA256SUMS
  chown root:root "$TEMP_ARCHIVE"
  chmod 0600 "$TEMP_ARCHIVE"
  mv -n -- "$TEMP_ARCHIVE" "$FINAL_ARCHIVE"
  [[ ! -e "$TEMP_ARCHIVE" ]] || fail "backup archive appeared before final rename"
  TEMP_ARCHIVE=""
}

leave_backup_maintenance() {
  BACKUP_STAGE="service-restart"
  systemctl start "$SERVICE_NAME"
  wait_for_internal_health
  SERVICE_STOPPED=0
}

require_backup_commands() {
  require_commands bash bun chown chmod curl date flock git gzip mktemp mv \
    pg_dump rm sha256sum sleep stat systemctl tar
}

load_production_environment() {
  require_root_file_mode "$ENV_FILE" "600"
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
}

validate_backup_environment() {
  require_value NODE_ENV
  require_value API_PORT
  require_value ADMIN_ORIGIN
  require_value BETTER_AUTH_URL
  require_value BETTER_AUTH_SECRET
  require_value DATABASE_URL
  require_value ASSET_STORAGE_ROOT
  [[ "$NODE_ENV" == "production" ]] || fail "NODE_ENV must be production"
  [[ "$ASSET_STORAGE_ROOT" == "$ASSET_ROOT" ]] || fail "ASSET_STORAGE_ROOT must be $ASSET_ROOT"
  validate_api_port
  validate_origin_environment
}

validate_backup_paths() {
  [[ -d "$REPOSITORY_ROOT/.git" ]] || fail "production checkout is missing"
  require_directory_owner_mode "$ASSET_ROOT" "bhr-cms" "bhr-cms" "750"
  require_directory_owner_mode "$BACKUP_ROOT" "root" "root" "700"
}

require_healthy_service() {
  systemctl is-active --quiet "$SERVICE_NAME" || fail "bhr-api must be active before backup"
  require_exact_health
}

prepare_backup_paths() {
  local timestamp
  timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
  FINAL_ARCHIVE="$BACKUP_ROOT/bhr-cms-$timestamp.tar.gz"
  TEMP_ARCHIVE="$BACKUP_ROOT/.bhr-cms-$timestamp.tar.gz.tmp"
  [[ ! -e "$FINAL_ARCHIVE" && ! -e "$TEMP_ARCHIVE" ]] || fail "backup timestamp already exists"
  STAGING_DIR="$(mktemp -d "$BACKUP_ROOT/.backup.XXXXXX")"
  chmod 0700 "$STAGING_DIR"
}

create_backup_manifest() {
  local created_at git_sha
  created_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  git_sha="$(git -C "$REPOSITORY_ROOT" rev-parse HEAD)"
  printf 'format_version=1\ncreated_at=%s\ngit_sha=%s\n' \
    "$created_at" "$git_sha" >"$STAGING_DIR/manifest.txt"
}

create_backup_checksums() {
  (
    cd "$STAGING_DIR"
    sha256sum database.dump assets.tar manifest.txt >SHA256SUMS
  )
}

wait_for_internal_health() {
  local body
  for _attempt in {1..30}; do
    body="$(curl --silent --show-error --fail "http://127.0.0.1:${API_PORT}/health" 2>/dev/null || true)"
    if [[ "$body" == "$EXPECTED_HEALTH_BODY" ]]; then
      return
    fi
    sleep 1
  done
  fail "API did not become healthy within 30 seconds"
}

require_exact_health() {
  local body
  body="$(curl --silent --show-error --fail "http://127.0.0.1:${API_PORT}/health")"
  [[ "$body" == "$EXPECTED_HEALTH_BODY" ]] || fail "API health response is invalid"
}

load_database_environment() {
  local name value
  unset PGHOST PGPORT PGUSER PGPASSWORD PGDATABASE PGSSLMODE
  # shellcheck disable=SC2016
  while IFS= read -r -d '' name && IFS= read -r -d '' value; do
    printf -v "$name" '%s' "$value"
    export "${name?}"
  done < <(bun -e '
    const url = new URL(process.env.DATABASE_URL);
    if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") process.exit(1);
    const entries = [
      ["PGHOST", url.hostname],
      ["PGPORT", url.port || "5432"],
      ["PGUSER", decodeURIComponent(url.username)],
      ["PGPASSWORD", decodeURIComponent(url.password)],
      ["PGDATABASE", decodeURIComponent(url.pathname.replace(/^\//, ""))],
    ];
    const sslmode = url.searchParams.get("sslmode");
    if (sslmode) entries.push(["PGSSLMODE", sslmode]);
    if (entries.some(([, value]) => value === "")) process.exit(1);
    for (const [name, value] of entries) process.stdout.write(`${name}\0${value}\0`);
  ')
  [[ -n "${PGDATABASE:-}" ]] || fail "DATABASE_URL is invalid"
}

validate_origin_environment() {
  bun -e '
    const admin = new URL(process.env.ADMIN_ORIGIN);
    const auth = new URL(process.env.BETTER_AUTH_URL);
    const originOnly = (url) => url.pathname === "/" && url.search === "" && url.hash === "" && url.username === "" && url.password === "";
    if (process.env.ADMIN_ORIGIN !== process.env.BETTER_AUTH_URL || admin.origin !== auth.origin || admin.protocol !== "https:" || !originOnly(admin) || !originOnly(auth) || admin.port !== "" || auth.port !== "") process.exit(1);
  ' || fail "authentication origins are invalid"
}

validate_api_port() {
  [[ "$API_PORT" =~ ^[0-9]+$ ]] || fail "API_PORT must be numeric"
  ((API_PORT >= 1 && API_PORT <= 65535)) || fail "API_PORT is outside the TCP port range"
}

require_clean_restore_state() {
  local residue=0 path
  for path in "$ASSET_STAGING" "$ASSET_PRE_RESTORE"; do
    if [[ -e "$path" ]]; then
      printf 'unresolved_restore_path=%s\n' "$path" >&2
      residue=1
    fi
  done
  ((residue == 0)) || fail "restore residue requires operator reconciliation"
}

require_root_file_mode() {
  local path=$1 expected_mode=$2
  [[ -f "$path" ]] || fail "required file is missing: $path"
  [[ "$(stat -c %U "$path")" == "root" ]] || fail "file must be root-owned: $path"
  [[ "$(stat -c %G "$path")" == "root" ]] || fail "file group must be root: $path"
  [[ "$(stat -c %a "$path")" == "$expected_mode" ]] || fail "file mode is invalid: $path"
}

require_directory_owner_mode() {
  local path=$1 owner=$2 group=$3 mode=$4
  [[ -d "$path" ]] || fail "required directory is missing: $path"
  [[ "$(stat -c %U "$path")" == "$owner" ]] || fail "directory owner is invalid: $path"
  [[ "$(stat -c %G "$path")" == "$group" ]] || fail "directory group is invalid: $path"
  [[ "$(stat -c %a "$path")" == "$mode" ]] || fail "directory mode is invalid: $path"
}

require_commands() {
  local command
  for command in "$@"; do
    command -v "$command" >/dev/null || fail "required command is missing: $command"
  done
}

require_value() {
  local name=$1
  [[ -n "${!name:-}" ]] || fail "required environment value is missing: $name"
}

require_root() {
  ((EUID == 0)) || fail "operation requires root"
}

acquire_operations_lock() {
  exec 9>"$OPS_LOCK"
  flock -n 9 || fail "another BeHR operation is active"
}

cleanup_backup_paths() {
  if [[ -n "$STAGING_DIR" && "$STAGING_DIR" == "$BACKUP_ROOT/.backup."* && -d "$STAGING_DIR" ]]; then
    rm -rf -- "$STAGING_DIR"
  fi
  if [[ -n "$TEMP_ARCHIVE" && "$TEMP_ARCHIVE" == "$BACKUP_ROOT/.bhr-cms-"* && -f "$TEMP_ARCHIVE" ]]; then
    rm -f -- "$TEMP_ARCHIVE"
  fi
}

handle_backup_exit() {
  local status=$?
  trap - EXIT
  if ((SERVICE_STOPPED == 1)); then
    printf 'backup_restart_attempt=1\n' >&2
    if ! systemctl start "$SERVICE_NAME" || ! wait_for_internal_health; then
      printf 'backup_restart_failed=1\n' >&2
      status=1
    fi
  fi
  cleanup_backup_paths
  if ((status != 0)); then
    printf 'backup_failed_stage=%s\n' "$BACKUP_STAGE" >&2
  fi
  exit "$status"
}

fail() {
  printf 'backup_error=%s\n' "$1" >&2
  return 1
}

main "$@"
