#!/usr/bin/env bash
set -Eeuo pipefail

readonly CONFIG_ROOT="/etc/bhr-cms"
readonly ENV_FILE="${CONFIG_ROOT}/bhr-api.env"
readonly DATABASE_NAME="behr"
readonly DATABASE_ROLE="behr_app"
readonly DATABASE_HOST="127.0.0.1"
readonly DATABASE_PORT="5432"
readonly API_PORT_VALUE="3000"
readonly ASSET_STORAGE_ROOT="/var/lib/bhr-cms/uploads"
readonly POSTGRESQL_MAJOR_VERSION=16
readonly SECRET_PATTERN='^[0-9a-f]{64}$'
readonly DATABASE_URL_PATTERN='^postgresql://behr_app:([0-9a-f]{64})@127\.0\.0\.1:5432/behr$'
readonly HOSTNAME_PATTERN='^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$'

CONFIGURE_STAGE="startup"
ROOT_BASHPID="$BASHPID"
FAILURE_REPORTED=0
SCRIPT_DIRECTORY=""
TEMP_ENV_FILE=""
ENVIRONMENT_STATE=""
DATABASE_ROLE_STATE=""
DATABASE_STATE=""
DATABASE_PASSWORD=""
BETTER_AUTH_SECRET=""
ADMIN_HOST=""
POSTGRESQL_VERSION_NUM=""
POSTGRESQL_PORT=""
POSTGRESQL_LISTEN_ADDRESSES=""
declare -A ENVIRONMENT_VALUES=()

main() {
  prepare_configuration "$@"
  validate_r1_prerequisites
  validate_local_postgresql
  scan_r2_state
  establish_r2_state
  verify_final_state
  report_configuration_success
}

prepare_configuration() {
  trap report_configuration_failure ERR
  trap cleanup_temporary_environment EXIT
  umask 077
  enter_stage "preflight"
  require_no_arguments "$@"
  run_r0_admission
}

validate_r1_prerequisites() {
  enter_stage "prerequisites"
  require_commands chmod chown ln mktemp openssl psql readlink rm stat sudo
  require_configuration_root
}

validate_local_postgresql() {
  enter_stage "database-server"
  read_postgresql_settings
  require_postgresql_version
  require_postgresql_port
  require_local_listen_addresses
}

scan_r2_state() {
  enter_stage "state-scan"
  scan_environment_state
  scan_database_role_state
  scan_database_state
  require_supported_state
  printf 'environment_state=%s\n' "$ENVIRONMENT_STATE"
  printf 'database_role_state=%s\n' "$DATABASE_ROLE_STATE"
  printf 'database_state=%s\n' "$DATABASE_STATE"
}

establish_r2_state() {
  if [[ "$ENVIRONMENT_STATE" == "absent" ]]; then
    establish_environment
  fi
  establish_database_role
  establish_database
}

verify_final_state() {
  enter_stage "verification"
  scan_environment_state
  scan_database_role_state
  scan_database_state
  [[ "$ENVIRONMENT_STATE" == "correct" ]] || fail "production environment state is invalid"
  [[ "$DATABASE_ROLE_STATE" == "correct" ]] || fail "BeHR database role state is invalid"
  [[ "$DATABASE_STATE" == "correct" ]] || fail "BeHR database state is invalid"
  verify_database_credential "$DATABASE_NAME"
}

report_configuration_success() {
  enter_stage "complete"
  printf 'instance_configuration=pass\n'
  printf 'database_name=%s\n' "$DATABASE_NAME"
  printf 'database_role=%s\n' "$DATABASE_ROLE"
  printf 'environment_file=%s\n' "$ENV_FILE"
}

require_no_arguments() {
  (($# == 0)) || fail "instance configuration accepts no arguments"
}

run_r0_admission() {
  local script_path
  script_path="$(readlink -f -- "${BASH_SOURCE[0]}")"
  SCRIPT_DIRECTORY="${script_path%/*}"
  "$SCRIPT_DIRECTORY/install-preflight.sh"
}

require_commands() {
  local command
  for command in "$@"; do
    command -v "$command" >/dev/null ||
      fail "instance configuration requires command: $command"
  done
}

require_configuration_root() {
  [[ -d "$CONFIG_ROOT" && ! -L "$CONFIG_ROOT" ]] ||
    fail "protected configuration root is invalid"
  [[ "$(stat -c %U "$CONFIG_ROOT")" == "root" &&
    "$(stat -c %G "$CONFIG_ROOT")" == "root" &&
    "$(stat -c %a "$CONFIG_ROOT")" == "700" ]] ||
    fail "protected configuration root metadata is invalid"
}

read_postgresql_settings() {
  local settings extra
  settings="$(run_admin_query \
    "SELECT current_setting('server_version_num'), current_setting('port'), current_setting('listen_addresses');")"
  IFS='|' read -r POSTGRESQL_VERSION_NUM POSTGRESQL_PORT \
    POSTGRESQL_LISTEN_ADDRESSES extra <<<"$settings"
  [[ -z "${extra:-}" ]] || fail "local PostgreSQL settings are invalid"
}

require_postgresql_version() {
  [[ "$POSTGRESQL_VERSION_NUM" =~ ^[0-9]+$ ]] ||
    fail "local PostgreSQL server version is invalid"
  ((10#$POSTGRESQL_VERSION_NUM / 10000 == POSTGRESQL_MAJOR_VERSION)) ||
    fail "instance configuration requires PostgreSQL 16"
}

require_postgresql_port() {
  [[ "$POSTGRESQL_PORT" == "$DATABASE_PORT" ]] ||
    fail "local PostgreSQL server must use port 5432"
}

require_local_listen_addresses() {
  local address
  local -a addresses
  [[ -n "$POSTGRESQL_LISTEN_ADDRESSES" ]] ||
    fail "local PostgreSQL server must listen on loopback"
  IFS=',' read -ra addresses <<<"$POSTGRESQL_LISTEN_ADDRESSES"
  for address in "${addresses[@]}"; do
    address="$(trim_ascii_whitespace "$address")"
    case "$address" in
      localhost | 127.0.0.1 | ::1) ;;
      *) fail "local PostgreSQL server has a non-loopback listener" ;;
    esac
  done
}

scan_environment_state() {
  ENVIRONMENT_STATE="absent"
  DATABASE_PASSWORD=""
  BETTER_AUTH_SECRET=""
  ADMIN_HOST=""
  if [[ -e "$ENV_FILE" || -L "$ENV_FILE" ]]; then
    if has_expected_environment_metadata && parse_existing_environment; then
      ENVIRONMENT_STATE="correct"
    else
      ENVIRONMENT_STATE="conflict"
    fi
  fi
}

scan_database_role_state() {
  local attributes memberships
  attributes="$(run_admin_query \
    "SELECT rolcanlogin, rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolbypassrls FROM pg_roles WHERE rolname = 'behr_app';")"
  if [[ -z "$attributes" ]]; then
    DATABASE_ROLE_STATE="absent"
    return 0
  fi
  memberships="$(run_admin_query \
    "SELECT count(*) FROM pg_auth_members WHERE member = (SELECT oid FROM pg_roles WHERE rolname = 'behr_app');")"
  if [[ "$attributes" == "t|f|f|f|f|f" && "$memberships" == "0" ]]; then
    DATABASE_ROLE_STATE="correct"
  else
    DATABASE_ROLE_STATE="conflict"
  fi
}

scan_database_state() {
  local database_record
  database_record="$(run_admin_query \
    "SELECT pg_get_userbyid(datdba), datallowconn, datistemplate FROM pg_database WHERE datname = 'behr';")"
  if [[ -z "$database_record" ]]; then
    DATABASE_STATE="absent"
  elif [[ "$database_record" == "behr_app|t|f" ]]; then
    DATABASE_STATE="correct"
  else
    DATABASE_STATE="conflict"
  fi
}

require_supported_state() {
  [[ "$ENVIRONMENT_STATE" != "conflict" ]] ||
    fail "existing production environment conflicts with R2"
  [[ "$DATABASE_ROLE_STATE" != "conflict" ]] ||
    fail "existing BeHR database role conflicts with R2"
  [[ "$DATABASE_STATE" != "conflict" ]] ||
    fail "existing BeHR database conflicts with R2"
  case "$ENVIRONMENT_STATE:$DATABASE_ROLE_STATE:$DATABASE_STATE" in
    absent:absent:absent | correct:absent:absent | correct:correct:absent | correct:correct:correct) ;;
    *) fail "existing R2 state is ambiguous and requires operator reconciliation" ;;
  esac
}

establish_environment() {
  enter_stage "configuration"
  read_admin_hostname
  generate_secrets
  publish_environment
  scan_environment_state
  [[ "$ENVIRONMENT_STATE" == "correct" ]] ||
    fail "published production environment is invalid"
}

establish_database_role() {
  enter_stage "database-role"
  if [[ "$DATABASE_ROLE_STATE" == "absent" ]]; then
    create_database_role
  fi
  scan_database_role_state
  [[ "$DATABASE_ROLE_STATE" == "correct" ]] ||
    fail "BeHR database role was not established"
  verify_database_credential "postgres"
}

establish_database() {
  enter_stage "database"
  if [[ "$DATABASE_STATE" == "absent" ]]; then
    create_database
  fi
  scan_database_state
  [[ "$DATABASE_STATE" == "correct" ]] || fail "BeHR database was not established"
}

read_admin_hostname() {
  printf 'Admin hostname: ' >&2
  IFS= read -r ADMIN_HOST || fail "admin hostname input was not received"
  [[ "$ADMIN_HOST" =~ $HOSTNAME_PATTERN ]] || fail "admin hostname is invalid"
}

generate_secrets() {
  DATABASE_PASSWORD="$(openssl rand -hex 32)"
  BETTER_AUTH_SECRET="$(openssl rand -hex 32)"
  [[ "$DATABASE_PASSWORD" =~ $SECRET_PATTERN &&
    "$BETTER_AUTH_SECRET" =~ $SECRET_PATTERN &&
    "$DATABASE_PASSWORD" != "$BETTER_AUTH_SECRET" ]] ||
    fail "secure secret generation failed"
}

publish_environment() {
  [[ ! -e "$ENV_FILE" && ! -L "$ENV_FILE" ]] ||
    fail "production environment appeared before publication"
  TEMP_ENV_FILE="$(mktemp "$CONFIG_ROOT/.bhr-api.env.XXXXXX")"
  chown root:root "$TEMP_ENV_FILE"
  chmod 0600 "$TEMP_ENV_FILE"
  write_environment_file "$TEMP_ENV_FILE"
  if ! ln -- "$TEMP_ENV_FILE" "$ENV_FILE"; then
    [[ ! -e "$ENV_FILE" && ! -L "$ENV_FILE" ]] ||
      fail "production environment appeared before exclusive publication"
    return 1
  fi
  rm -f -- "$TEMP_ENV_FILE"
  TEMP_ENV_FILE=""
}

write_environment_file() {
  local destination=$1 origin="https://${ADMIN_HOST}"
  printf '%s\n' \
    "NODE_ENV=production" \
    "API_PORT=$API_PORT_VALUE" \
    "DATABASE_URL=postgresql://${DATABASE_ROLE}:${DATABASE_PASSWORD}@${DATABASE_HOST}:${DATABASE_PORT}/${DATABASE_NAME}" \
    "BETTER_AUTH_URL=$origin" \
    "BETTER_AUTH_SECRET=$BETTER_AUTH_SECRET" \
    "ADMIN_ORIGIN=$origin" \
    "ASSET_STORAGE_ROOT=$ASSET_STORAGE_ROOT" >"$destination"
}

create_database_role() {
  printf "CREATE ROLE %s LOGIN PASSWORD '%s' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;\n" \
    "$DATABASE_ROLE" "$DATABASE_PASSWORD" | execute_admin_sql
}

create_database() {
  printf 'CREATE DATABASE %s OWNER %s;\n' "$DATABASE_NAME" "$DATABASE_ROLE" |
    execute_admin_sql
}

verify_database_credential() {
  local database=$1 result
  result="$(PGPASSWORD="$DATABASE_PASSWORD" PGCONNECT_TIMEOUT=5 \
    psql -X --no-psqlrc --no-password -v ON_ERROR_STOP=1 -At \
      --host="$DATABASE_HOST" --port="$DATABASE_PORT" \
      --username="$DATABASE_ROLE" --dbname="$database" \
      --command='SELECT 1;')"
  [[ "$result" == "1" ]] || fail "recorded database credential is invalid"
}

has_expected_environment_metadata() {
  [[ -f "$ENV_FILE" && ! -L "$ENV_FILE" &&
    "$(stat -c %U "$ENV_FILE")" == "root" &&
    "$(stat -c %G "$ENV_FILE")" == "root" &&
    "$(stat -c %a "$ENV_FILE")" == "600" ]]
}

parse_existing_environment() {
  read_environment_assignments || return 1
  validate_environment_values || return 1
  return 0
}

read_environment_assignments() {
  local line key value line_count=0
  ENVIRONMENT_VALUES=()
  while IFS= read -r line || [[ -n "$line" ]]; do
    ((line_count += 1))
    [[ "$line" =~ ^([A-Z_]+)=([^[:space:]]+)$ ]] || return 1
    key="${BASH_REMATCH[1]}"
    value="${BASH_REMATCH[2]}"
    is_allowed_environment_key "$key" || return 1
    [[ -z "${ENVIRONMENT_VALUES[$key]+present}" ]] || return 1
    ENVIRONMENT_VALUES[$key]="$value"
  done <"$ENV_FILE"
  ((line_count == 7 && ${#ENVIRONMENT_VALUES[@]} == 7)) || return 1
  return 0
}

is_allowed_environment_key() {
  case "$1" in
    NODE_ENV | API_PORT | DATABASE_URL | BETTER_AUTH_URL | BETTER_AUTH_SECRET | ADMIN_ORIGIN | ASSET_STORAGE_ROOT) return 0 ;;
    *) return 1 ;;
  esac
}

validate_environment_values() {
  local database_url admin_origin
  [[ "${ENVIRONMENT_VALUES[NODE_ENV]-}" == "production" &&
    "${ENVIRONMENT_VALUES[API_PORT]-}" == "$API_PORT_VALUE" &&
    "${ENVIRONMENT_VALUES[ASSET_STORAGE_ROOT]-}" == "$ASSET_STORAGE_ROOT" ]] || return 1
  database_url="${ENVIRONMENT_VALUES[DATABASE_URL]-}"
  [[ "$database_url" =~ $DATABASE_URL_PATTERN ]] || return 1
  DATABASE_PASSWORD="${BASH_REMATCH[1]}"
  admin_origin="${ENVIRONMENT_VALUES[ADMIN_ORIGIN]-}"
  ADMIN_HOST="${admin_origin#https://}"
  [[ "$admin_origin" == "https://${ADMIN_HOST}" &&
    "$ADMIN_HOST" =~ $HOSTNAME_PATTERN &&
    "${ENVIRONMENT_VALUES[BETTER_AUTH_URL]-}" == "$admin_origin" ]] || return 1
  BETTER_AUTH_SECRET="${ENVIRONMENT_VALUES[BETTER_AUTH_SECRET]-}"
  [[ "$BETTER_AUTH_SECRET" =~ $SECRET_PATTERN &&
    "$BETTER_AUTH_SECRET" != "$DATABASE_PASSWORD" ]] || return 1
  return 0
}

run_admin_query() {
  sudo -u postgres -- psql -X --no-psqlrc -v ON_ERROR_STOP=1 -At \
    --field-separator='|' --dbname=postgres --command="$1"
}

execute_admin_sql() {
  sudo -u postgres -- psql -X --no-psqlrc -v ON_ERROR_STOP=1 --quiet \
    --dbname=postgres >/dev/null
}

trim_ascii_whitespace() {
  local value=$1
  value="${value#"${value%%[![:space:]]*}"}"
  value="${value%"${value##*[![:space:]]}"}"
  printf '%s\n' "$value"
}

enter_stage() {
  CONFIGURE_STAGE=$1
  printf 'instance_configuration_stage=%s\n' "$CONFIGURE_STAGE"
}

cleanup_temporary_environment() {
  if [[ -n "$TEMP_ENV_FILE" && "$TEMP_ENV_FILE" == "$CONFIG_ROOT/.bhr-api.env."* &&
    -f "$TEMP_ENV_FILE" ]]; then
    rm -f -- "$TEMP_ENV_FILE"
  fi
}

report_configuration_failure() {
  local status=$?
  if ((BASHPID == ROOT_BASHPID && FAILURE_REPORTED == 0)); then
    FAILURE_REPORTED=1
    printf 'instance_configuration_failed_stage=%s\n' "$CONFIGURE_STAGE" >&2
  fi
  return "$status"
}

fail() {
  printf 'instance_configuration_error=%s\n' "$1" >&2
  return 1
}

main "$@"
