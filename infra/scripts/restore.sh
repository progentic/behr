#!/usr/bin/env bash
set -Eeuo pipefail

readonly REPOSITORY_ROOT="/opt/bhr-cms"
readonly ENV_FILE="/etc/bhr-cms/bhr-api.env"
readonly ASSET_PARENT="/var/lib/bhr-cms"
readonly ASSET_ROOT="/var/lib/bhr-cms/uploads"
readonly ASSET_STAGING="/var/lib/bhr-cms/uploads.staging"
readonly ASSET_PRE_RESTORE="/var/lib/bhr-cms/uploads.pre-restore"
readonly OPS_LOCK="/run/lock/bhr-cms-ops.lock"
readonly SERVICE_NAME="bhr-api.service"
readonly EXPECTED_HEALTH_BODY='{"status":"ok"}'
readonly UUID_PATTERN='^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'

ARCHIVE_PATH=""
RESTORE_TEMP=""
RESTORE_STAGE="startup"
STAGING_CREATED=0
DESTRUCTIVE_STARTED=0
RESTORE_COMPLETE=0

main() {
  parse_restore_arguments "$@"
  trap handle_restore_exit EXIT
  prepare_restore
  validate_backup_package
  stage_restored_assets
  validate_same_filesystem
  execute_destructive_restore
  RESTORE_COMPLETE=1
  RESTORE_STAGE="complete"
  printf 'restore_complete=1\n'
}

prepare_restore() {
  RESTORE_STAGE="preflight"
  require_root
  acquire_operations_lock
  require_clean_restore_state
  require_restore_commands
  load_production_environment
  validate_restore_environment
  load_database_environment
  validate_restore_paths
  require_healthy_service
}

validate_backup_package() {
  RESTORE_STAGE="outer-archive-validation"
  validate_outer_archive
  create_restore_temp
  extract_outer_archive
  verify_backup_checksums
  validate_backup_manifest
  validate_database_dump
  validate_asset_archive
}

stage_restored_assets() {
  RESTORE_STAGE="asset-staging"
  install -d -o root -g root -m 0700 "$ASSET_STAGING"
  STAGING_CREATED=1
  tar --extract --file="$RESTORE_TEMP/assets.tar" \
    --directory="$ASSET_STAGING" --no-same-owner --no-same-permissions
}

validate_same_filesystem() {
  RESTORE_STAGE="filesystem-validation"
  local parent_device live_device staging_device
  parent_device="$(stat -c %d "$ASSET_PARENT")"
  live_device="$(stat -c %d "$ASSET_ROOT")"
  staging_device="$(stat -c %d "$ASSET_STAGING")"
  [[ "$parent_device" == "$live_device" && "$parent_device" == "$staging_device" ]] ||
    fail "asset roots are not on the same filesystem device"
}

execute_destructive_restore() {
  stop_service_for_restore
  restore_database
  install_staged_assets
  migrate_restored_database
  start_restored_service
  remove_pre_restore_assets
}

stop_service_for_restore() {
  RESTORE_STAGE="service-stop"
  systemctl stop "$SERVICE_NAME"
  DESTRUCTIVE_STARTED=1
}

restore_database() {
  RESTORE_STAGE="database-restore"
  pg_restore --clean --if-exists --no-owner --no-acl --single-transaction \
    --dbname="$PGDATABASE" "$RESTORE_TEMP/database.dump"
}

install_staged_assets() {
  RESTORE_STAGE="RENAME_STEP_1"
  printf 'restore_state=RENAME_STEP_1\n' >&2
  mv -- "$ASSET_ROOT" "$ASSET_PRE_RESTORE"
  RESTORE_STAGE="RENAME_STEP_2"
  printf 'restore_state=RENAME_STEP_2\n' >&2
  mv -- "$ASSET_STAGING" "$ASSET_ROOT"
  STAGING_CREATED=0
  chown -R bhr-cms:bhr-cms "$ASSET_ROOT"
  find "$ASSET_ROOT" -type d -exec chmod 0750 {} +
  find "$ASSET_ROOT" -type f -exec chmod 0640 {} +
}

migrate_restored_database() {
  RESTORE_STAGE="migration"
  run_in_repository bun run db:migrate
}

start_restored_service() {
  RESTORE_STAGE="service-start"
  systemctl start "$SERVICE_NAME"
  wait_for_internal_health
}

remove_pre_restore_assets() {
  RESTORE_STAGE="cleanup"
  rm -rf -- "$ASSET_PRE_RESTORE"
}

parse_restore_arguments() {
  (($# == 2)) || fail "usage: restore.sh --confirm-restore <backup-archive>"
  [[ "$1" == "--confirm-restore" ]] || fail "restore requires --confirm-restore"
  ARCHIVE_PATH=$2
}

require_restore_commands() {
  require_commands awk bash bun chmod chown curl find flock grep install \
    cut gzip mktemp mv pg_restore psql rm sha256sum sleep sort stat systemctl tar wc
}

load_production_environment() {
  require_root_file_mode "$ENV_FILE" "600"
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
}

validate_restore_environment() {
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

validate_restore_paths() {
  [[ -d "$REPOSITORY_ROOT/.git" ]] || fail "production checkout is missing"
  [[ -d "$ASSET_PARENT" ]] || fail "asset parent is missing: $ASSET_PARENT"
  [[ -d "$ASSET_ROOT" ]] || fail "live asset root is missing: $ASSET_ROOT"
  [[ -f "$ARCHIVE_PATH" && -r "$ARCHIVE_PATH" ]] || fail "backup archive is unreadable"
}

require_healthy_service() {
  systemctl is-active --quiet "$SERVICE_NAME" || fail "bhr-api must be active before restore"
  require_exact_health
}

validate_outer_archive() {
  local expected actual line
  local -a outer_members
  tar -tzf "$ARCHIVE_PATH" >/dev/null
  mapfile -t outer_members < <(tar -tzf "$ARCHIVE_PATH")
  expected=$'SHA256SUMS\nassets.tar\ndatabase.dump\nmanifest.txt'
  actual="$(printf '%s\n' "${outer_members[@]}" | LC_ALL=C sort)"
  [[ "$actual" == "$expected" && ${#outer_members[@]} -eq 4 ]] ||
    fail "backup archive members are invalid"
  while IFS= read -r line; do
    [[ "${line:0:1}" == "-" ]] || fail "backup outer members must be regular files"
  done < <(tar -tvzf "$ARCHIVE_PATH")
}

create_restore_temp() {
  RESTORE_TEMP="$(mktemp -d)"
  chmod 0700 "$RESTORE_TEMP"
}

extract_outer_archive() {
  tar -xzf "$ARCHIVE_PATH" -C "$RESTORE_TEMP" -- \
    database.dump assets.tar manifest.txt SHA256SUMS
}

verify_backup_checksums() {
  validate_checksum_manifest
  (cd "$RESTORE_TEMP" && sha256sum -c SHA256SUMS)
}

validate_checksum_manifest() {
  local checksums="$RESTORE_TEMP/SHA256SUMS" expected actual
  [[ "$(wc -l <"$checksums")" -eq 3 ]] || fail "checksum manifest has an invalid entry count"
  [[ "$(grep -Ec '^[0-9a-f]{64}  (database\.dump|assets\.tar|manifest\.txt)$' "$checksums")" -eq 3 ]] ||
    fail "checksum manifest contains an invalid entry"
  expected=$'assets.tar\ndatabase.dump\nmanifest.txt'
  actual="$(awk '{ print $2 }' "$checksums" | LC_ALL=C sort)"
  [[ "$actual" == "$expected" ]] || fail "checksum manifest members are invalid"
}

validate_backup_manifest() {
  local manifest="$RESTORE_TEMP/manifest.txt"
  [[ "$(grep -c '^format_version=' "$manifest")" -eq 1 ]] || fail "manifest format is invalid"
  [[ "$(grep -c '^created_at=' "$manifest")" -eq 1 ]] || fail "manifest timestamp is invalid"
  [[ "$(grep -c '^git_sha=' "$manifest")" -eq 1 ]] || fail "manifest Git SHA is invalid"
  grep -qx 'format_version=1' "$manifest" || fail "manifest version is unsupported"
  grep -Eq '^created_at=[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$' "$manifest" ||
    fail "manifest timestamp is invalid"
  grep -Eq '^git_sha=[0-9a-f]{40}$' "$manifest" || fail "manifest Git SHA is invalid"
  [[ "$(wc -l <"$manifest")" -eq 3 ]] || fail "manifest contains unexpected fields"
}

validate_database_dump() {
  pg_restore --list "$RESTORE_TEMP/database.dump" >/dev/null
}

validate_asset_archive() {
  local index
  local -a asset_members asset_types
  tar -tf "$RESTORE_TEMP/assets.tar" >/dev/null
  mapfile -t asset_members < <(tar -tf "$RESTORE_TEMP/assets.tar")
  mapfile -t asset_types < <(tar -tvf "$RESTORE_TEMP/assets.tar" | cut -c1)
  [[ ${#asset_members[@]} -eq ${#asset_types[@]} ]] || fail "asset archive listing is inconsistent"
  for index in "${!asset_members[@]}"; do
    validate_asset_member "${asset_types[$index]}" "${asset_members[$index]}"
  done
}

validate_asset_member() {
  local type=$1 member=$2 normalized site_id asset_id extra
  [[ "$type" == "d" || "$type" == "-" ]] || fail "asset archive contains a special member"
  normalized=${member#./}
  [[ "$normalized" != "." && -n "$normalized" ]] || {
    [[ "$type" == "d" ]] || fail "asset archive root must be a directory"
    return
  }
  [[ "$normalized" != /* && "$normalized" != *".."* ]] || fail "asset archive path is unsafe"
  if [[ "$type" == "d" ]]; then
    site_id=${normalized%/}
    [[ "$site_id" =~ $UUID_PATTERN && "$site_id" != */* ]] || fail "asset directory path is noncanonical"
    return
  fi
  IFS=/ read -r site_id asset_id extra <<<"$normalized"
  [[ -z "${extra:-}" && "$site_id" =~ $UUID_PATTERN && "$asset_id" =~ $UUID_PATTERN ]] ||
    fail "asset file path is noncanonical"
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

validate_api_port() {
  [[ "$API_PORT" =~ ^[0-9]+$ ]] || fail "API_PORT must be numeric"
  ((API_PORT >= 1 && API_PORT <= 65535)) || fail "API_PORT is outside the TCP port range"
}

require_clean_restore_state() {
  local residue=0 path
  [[ -d "$ASSET_ROOT" ]] || fail "live asset root is missing: $ASSET_ROOT"
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

run_in_repository() {
  (cd "$REPOSITORY_ROOT" && "$@")
}

cleanup_pre_destructive_restore() {
  if ((DESTRUCTIVE_STARTED == 0 && STAGING_CREATED == 1)) && [[ -d "$ASSET_STAGING" ]]; then
    rm -rf -- "$ASSET_STAGING"
  fi
}

cleanup_restore_temp() {
  if [[ -n "$RESTORE_TEMP" && -d "$RESTORE_TEMP" ]]; then
    rm -rf -- "$RESTORE_TEMP"
  fi
}

report_destructive_failure() {
  systemctl stop "$SERVICE_NAME" >/dev/null 2>&1 || true
  printf 'restore_failed_stage=%s\n' "$RESTORE_STAGE" >&2
  printf 'restore_live_path=%s\n' "$ASSET_ROOT" >&2
  printf 'restore_staging_path=%s\n' "$ASSET_STAGING" >&2
  printf 'restore_pre_restore_path=%s\n' "$ASSET_PRE_RESTORE" >&2
  printf 'restore_operator_recovery_required=1\n' >&2
}

handle_restore_exit() {
  local status=$?
  trap - EXIT
  if ((status != 0 && DESTRUCTIVE_STARTED == 1)); then
    report_destructive_failure
  fi
  if ((RESTORE_COMPLETE == 0)); then
    cleanup_pre_destructive_restore
  fi
  cleanup_restore_temp
  exit "$status"
}

fail() {
  printf 'restore_error=%s\n' "$1" >&2
  return 1
}

main "$@"
