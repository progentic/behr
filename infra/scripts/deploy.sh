#!/usr/bin/env bash
set -Eeuo pipefail

readonly REPOSITORY_ROOT="/opt/bhr-cms"
readonly ENV_FILE="/etc/bhr-cms/bhr-api.env"
readonly ASSET_ROOT="/var/lib/bhr-cms/uploads"
readonly ASSET_STAGING="/var/lib/bhr-cms/uploads.staging"
readonly ASSET_PRE_RESTORE="/var/lib/bhr-cms/uploads.pre-restore"
readonly BACKUP_ROOT="/var/backups/bhr-cms"
readonly TLS_CERT="/etc/bhr-cms/tls/fullchain.pem"
readonly TLS_KEY="/etc/bhr-cms/tls/privkey.pem"
readonly OPS_LOCK="/run/lock/bhr-cms-ops.lock"
readonly SERVICE_NAME="bhr-api.service"
readonly NGINX_TEMPLATE="${REPOSITORY_ROOT}/infra/nginx/bhr-cms.conf"
readonly NGINX_CONFIG="/etc/nginx/conf.d/bhr-cms.conf"
readonly SYSTEMD_TEMPLATE="${REPOSITORY_ROOT}/infra/systemd/bhr-api.service"
readonly SYSTEMD_CONFIG="/etc/systemd/system/bhr-api.service"
readonly EXPECTED_BUN_VERSION="1.4.0"
readonly EXPECTED_HEALTH_BODY='{"status":"ok"}'

DEPLOY_STAGE="startup"
RENDERED_NGINX=""

main() {
  trap report_deploy_failure ERR
  trap cleanup_deploy EXIT
  prepare_deployment
  build_release
  install_service_configuration
  activate_release
}

prepare_deployment() {
  DEPLOY_STAGE="preflight"
  require_root
  acquire_operations_lock
  require_clean_restore_state
  require_deploy_commands
  require_repository_state
  load_production_environment
  validate_production_environment
  load_database_environment
  validate_production_paths
  check_reserved_admin_host_pre_migration
}

build_release() {
  DEPLOY_STAGE="build"
  run_in_repository bun install --frozen-lockfile
  run_in_repository bun run typecheck
  run_in_repository bun run build
  require_service_read_access
  run_in_repository bun run db:migration:check
  run_in_repository bun run db:check
}

install_service_configuration() {
  DEPLOY_STAGE="configuration"
  render_nginx_configuration
  install -o root -g root -m 0644 "$RENDERED_NGINX" "$NGINX_CONFIG"
  install -o root -g root -m 0644 "$SYSTEMD_TEMPLATE" "$SYSTEMD_CONFIG"
  nginx -t
  systemctl daemon-reload
}

activate_release() {
  DEPLOY_STAGE="migration"
  stop_service_if_active
  run_in_repository bun run db:migrate
  DEPLOY_STAGE="post-migration-reserved-host"
  reject_reserved_admin_host
  DEPLOY_STAGE="api-start"
  systemctl restart "$SERVICE_NAME"
  wait_for_internal_health
  DEPLOY_STAGE="nginx-reload"
  systemctl reload nginx
  DEPLOY_STAGE="external-health"
  wait_for_external_health
  DEPLOY_STAGE="complete"
}

require_deploy_commands() {
  require_commands bash bun git curl flock nginx systemctl install stat \
    openssl tar gzip sha256sum psql pg_dump pg_restore sudo grep sed mktemp \
    rm sleep
  require_bun_version
}

require_repository_state() {
  [[ "$(pwd -P)" == "$REPOSITORY_ROOT" ]] || fail "deploy must run from $REPOSITORY_ROOT"
  [[ -d "$REPOSITORY_ROOT/.git" ]] || fail "repository checkout is missing"
  [[ -z "$(git status --porcelain --untracked-files=no)" ]] || fail "tracked Git state is dirty"
}

load_production_environment() {
  require_root_file_mode "$ENV_FILE" "600"
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
}

validate_production_environment() {
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
  read_admin_origin
}

validate_production_paths() {
  [[ -d "$REPOSITORY_ROOT" ]] || fail "application root is missing: $REPOSITORY_ROOT"
  require_directory_owner_mode "$ASSET_ROOT" "bhr-cms" "bhr-cms" "750"
  require_directory_owner_mode "$BACKUP_ROOT" "root" "root" "700"
  [[ -r "$TLS_CERT" ]] || fail "TLS certificate is unreadable: $TLS_CERT"
  require_root_private_file "$TLS_KEY"
  openssl x509 -in "$TLS_CERT" -noout >/dev/null
  openssl x509 -in "$TLS_CERT" -noout -checkhost "$ADMIN_HOST" >/dev/null
  sudo -u bhr-cms test -x "$ASSET_ROOT"
  sudo -u bhr-cms test -w "$ASSET_ROOT"
}

check_reserved_admin_host_pre_migration() {
  local relation_exists
  relation_exists="$(read_domains_relation_presence)"
  if [[ "$relation_exists" == "f" ]]; then
    return
  fi
  [[ "$relation_exists" == "t" ]] || fail "domains relation probe returned an unexpected result"
  reject_reserved_admin_host
}

read_domains_relation_presence() {
  psql -X --no-psqlrc -v ON_ERROR_STOP=1 -Atc \
    "SELECT to_regclass('public.domains') IS NOT NULL;"
}

reject_reserved_admin_host() {
  local collision
  collision="$(printf "SELECT 1 FROM domains WHERE hostname = :'admin_host' LIMIT 1;\n" |
    psql -X --no-psqlrc -v ON_ERROR_STOP=1 -v "admin_host=$ADMIN_HOST" -At)"
  [[ -z "$collision" ]] || fail "admin hostname is already assigned as a tenant domain"
}

render_nginx_configuration() {
  RENDERED_NGINX="$(mktemp)"
  sed \
    -e "s/__BHR_ADMIN_HOST__/${ADMIN_HOST}/g" \
    -e "s/__BHR_API_PORT__/${API_PORT}/g" \
    "$NGINX_TEMPLATE" >"$RENDERED_NGINX"
  ! grep -q "__BHR_" "$RENDERED_NGINX" || fail "nginx template contains unresolved substitutions"
}

require_service_read_access() {
  sudo -u bhr-cms test -x "$REPOSITORY_ROOT"
  sudo -u bhr-cms test -r "$REPOSITORY_ROOT/apps/api/dist/index.js"
}

stop_service_if_active() {
  if systemctl is-active --quiet "$SERVICE_NAME"; then
    systemctl stop "$SERVICE_NAME"
  fi
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

wait_for_external_health() {
  local attempt body status
  for attempt in {1..30}; do
    if body="$(curl --silent --show-error --fail \
      --resolve "${ADMIN_HOST}:443:127.0.0.1" \
      "https://${ADMIN_HOST}/health")"; then
      [[ "$body" == "$EXPECTED_HEALTH_BODY" ]] || fail "external health response is invalid"
      return
    else
      status=$?
    fi
    ((status == 7)) || return "$status"
    ((attempt < 30)) && sleep 1
  done
  fail "external HTTPS endpoint did not become reachable within 30 attempts"
}

read_admin_origin() {
  local name value
  unset ADMIN_HOST
  # shellcheck disable=SC2016
  while IFS= read -r -d '' name && IFS= read -r -d '' value; do
    printf -v "$name" '%s' "$value"
    export "${name?}"
  done < <(bun -e '
    const admin = new URL(process.env.ADMIN_ORIGIN);
    const auth = new URL(process.env.BETTER_AUTH_URL);
    const originOnly = (url) => url.pathname === "/" && url.search === "" && url.hash === "" && url.username === "" && url.password === "";
    const hostname = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(?:\.(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?))*$/;
    if (process.env.ADMIN_ORIGIN !== process.env.BETTER_AUTH_URL || admin.origin !== auth.origin || admin.protocol !== "https:" || !originOnly(admin) || !originOnly(auth) || admin.port !== "" || auth.port !== "") process.exit(1);
    if (!hostname.test(admin.hostname)) process.exit(1);
    process.stdout.write(`ADMIN_HOST\0${admin.hostname}\0`);
  ')
  [[ -n "${ADMIN_HOST:-}" ]] || fail "authentication origins are invalid"
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
    const database = decodeURIComponent(url.pathname.replace(/^\//, ""));
    const entries = [
      ["PGHOST", url.hostname],
      ["PGPORT", url.port || "5432"],
      ["PGUSER", decodeURIComponent(url.username)],
      ["PGPASSWORD", decodeURIComponent(url.password)],
      ["PGDATABASE", database],
    ];
    const sslmode = url.searchParams.get("sslmode");
    if (sslmode) entries.push(["PGSSLMODE", sslmode]);
    if (entries.some(([, value]) => value === "")) process.exit(1);
    for (const [name, value] of entries) process.stdout.write(`${name}\0${value}\0`);
  ')
  [[ -n "${PGDATABASE:-}" ]] || fail "DATABASE_URL is invalid"
}

validate_api_port() {
  [[ "$API_PORT" =~ ^[0-9]+$ ]] || fail "API_PORT must be numeric"
  ((API_PORT >= 1 && API_PORT <= 65535)) || fail "API_PORT is outside the TCP port range"
}

require_clean_restore_state() {
  local residue=0
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

require_root_private_file() {
  local path=$1 mode
  [[ -f "$path" ]] || fail "required file is missing: $path"
  [[ "$(stat -c %U "$path")" == "root" ]] || fail "file must be root-owned: $path"
  mode="$(stat -c %a "$path")"
  (((8#$mode & 077) == 0)) || fail "file must not be group/world accessible: $path"
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

require_bun_version() {
  [[ "$(bun --version)" == "$EXPECTED_BUN_VERSION" ]] || fail "Bun $EXPECTED_BUN_VERSION is required"
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

cleanup_deploy() {
  [[ -z "$RENDERED_NGINX" || ! -e "$RENDERED_NGINX" ]] || rm -f -- "$RENDERED_NGINX"
}

report_deploy_failure() {
  local status=$?
  printf 'deploy_failed_stage=%s\n' "$DEPLOY_STAGE" >&2
  return "$status"
}

fail() {
  printf 'deploy_error=%s\n' "$1" >&2
  return 1
}

main "$@"
