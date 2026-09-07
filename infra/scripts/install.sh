#!/usr/bin/env bash
set -Eeuo pipefail

readonly INSTALL_ROOT="/opt/bhr-cms"
readonly ENV_FILE="/etc/bhr-cms/bhr-api.env"
readonly COMPLETION_MARKER="/etc/bhr-cms/first-run.complete"
readonly API_PORT_VALUE="3000"
readonly EXPECTED_ASSET_STORAGE_ROOT="/var/lib/bhr-cms/uploads"
readonly SECRET_PATTERN='^[0-9a-f]{64}$'
readonly DATABASE_URL_PATTERN='^postgresql://behr_app:([0-9a-f]{64})@127\.0\.0\.1:5432/behr$'
readonly HOSTNAME_PATTERN='^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$'

FIRST_RUN_STAGE="startup"
ROOT_BASHPID="$BASHPID"
FAILURE_REPORTED=0
SCRIPT_DIRECTORY=""
SOURCE_ROOT=""
SOURCE_SHA=""
ADMIN_ORIGIN_VALUE=""
ADMINISTRATOR_NAME=""
ADMINISTRATOR_EMAIL=""
ADMINISTRATOR_PASSWORD=""
DATABASE_PASSWORD=""
COMPLETION_MARKER_STATE=""
IDENTITY_COUNT=""
TEMP_COMPLETION_MARKER=""
declare -A ENVIRONMENT_VALUES=()

main() {
  prepare_first_run "$@"
  establish_host_prerequisites
  establish_instance_configuration
  establish_tls_authority
  install_admitted_source
  deploy_installed_source
  bootstrap_initial_identity
  report_first_run_success
}

prepare_first_run() {
  trap report_first_run_failure ERR
  trap cleanup_completion_marker EXIT
  umask 077
  enter_stage "preflight"
  require_no_arguments "$@"
  read_source_authority
  "$SCRIPT_DIRECTORY/install-preflight.sh"
  SOURCE_SHA="$(git -C "$SOURCE_ROOT" rev-parse --verify 'HEAD^{commit}')"
}

establish_host_prerequisites() {
  enter_stage "host-provisioning"
  "$SCRIPT_DIRECTORY/provision-host.sh"
}

establish_instance_configuration() {
  enter_stage "instance-configuration"
  "$SCRIPT_DIRECTORY/configure-instance.sh"
}

establish_tls_authority() {
  enter_stage "tls"
  "$SCRIPT_DIRECTORY/install-tls.sh"
}

install_admitted_source() {
  enter_stage "source-installation"
  require_commands find git stat
  require_install_root
  if [[ -z "$(find "$INSTALL_ROOT" -mindepth 1 -print -quit)" ]]; then
    clone_admitted_source
  fi
  require_installed_source
  require_operator_source_unchanged
}

deploy_installed_source() {
  enter_stage "deployment"
  (cd "$INSTALL_ROOT" && ./infra/scripts/deploy.sh)
}

bootstrap_initial_identity() {
  enter_stage "bootstrap"
  require_commands chmod chown ln mktemp psql rm stat
  read_runtime_environment
  classify_completion_marker
  read_identity_count
  reconcile_bootstrap_state
}

report_first_run_success() {
  enter_stage "complete"
  printf 'first_run=pass\n'
  printf 'source_sha=%s\n' "$SOURCE_SHA"
  printf 'admin_url=%s\n' "$ADMIN_ORIGIN_VALUE"
}

require_no_arguments() {
  (($# == 0)) || fail "first-run installation accepts no arguments"
}

read_source_authority() {
  local script_path
  script_path="$(readlink -f -- "${BASH_SOURCE[0]}")"
  SCRIPT_DIRECTORY="${script_path%/*}"
  SOURCE_ROOT="$(readlink -f -- "${SCRIPT_DIRECTORY}/../..")"
}

require_commands() {
  local command
  for command in "$@"; do
    command -v "$command" >/dev/null ||
      fail "first-run installation requires command: $command"
  done
}

require_install_root() {
  [[ -d "$INSTALL_ROOT" && ! -L "$INSTALL_ROOT" ]] ||
    fail "application installation root is invalid"
  [[ "$(stat -c %U "$INSTALL_ROOT")" == "root" &&
    "$(stat -c %G "$INSTALL_ROOT")" == "root" &&
    "$(stat -c %a "$INSTALL_ROOT")" == "755" ]] ||
    fail "application installation root metadata is invalid"
}

clone_admitted_source() {
  git clone --no-hardlinks --no-checkout -- "$SOURCE_ROOT" "$INSTALL_ROOT"
  git -C "$INSTALL_ROOT" checkout --detach "$SOURCE_SHA"
}

require_installed_source() {
  local installed_sha tracked_state
  [[ -d "$INSTALL_ROOT/.git" && ! -L "$INSTALL_ROOT/.git" ]] ||
    fail "application installation root contains unknown state"
  installed_sha="$(git -C "$INSTALL_ROOT" rev-parse --verify 'HEAD^{commit}')"
  [[ "$installed_sha" == "$SOURCE_SHA" ]] ||
    fail "installed source revision differs from admitted source"
  tracked_state="$(git -C "$INSTALL_ROOT" status --porcelain --untracked-files=no)"
  [[ -z "$tracked_state" ]] || fail "installed source has tracked changes"
  "$INSTALL_ROOT/infra/scripts/install-preflight.sh" >/dev/null
}

require_operator_source_unchanged() {
  local source_sha tracked_state
  source_sha="$(git -C "$SOURCE_ROOT" rev-parse --verify 'HEAD^{commit}')"
  tracked_state="$(git -C "$SOURCE_ROOT" status --porcelain --untracked-files=no)"
  [[ "$source_sha" == "$SOURCE_SHA" && -z "$tracked_state" ]] ||
    fail "operator source changed during first-run installation"
}

read_runtime_environment() {
  require_environment_metadata
  read_environment_assignments
  validate_environment_values
}

require_environment_metadata() {
  [[ -f "$ENV_FILE" && ! -L "$ENV_FILE" ]] ||
    fail "protected production environment is invalid"
  [[ "$(stat -c %U "$ENV_FILE")" == "root" &&
    "$(stat -c %G "$ENV_FILE")" == "root" &&
    "$(stat -c %a "$ENV_FILE")" == "600" ]] ||
    fail "protected production environment metadata is invalid"
}

read_environment_assignments() {
  local line key value line_count=0
  ENVIRONMENT_VALUES=()
  while IFS= read -r line || [[ -n "$line" ]]; do
    ((line_count += 1))
    [[ "$line" =~ ^([A-Z_]+)=([^[:space:]]+)$ ]] ||
      fail "protected production environment content is invalid"
    key="${BASH_REMATCH[1]}"
    value="${BASH_REMATCH[2]}"
    is_allowed_environment_key "$key" ||
      fail "protected production environment content is invalid"
    [[ -z "${ENVIRONMENT_VALUES[$key]+present}" ]] ||
      fail "protected production environment content is invalid"
    ENVIRONMENT_VALUES[$key]="$value"
  done <"$ENV_FILE"
  ((line_count == 7 && ${#ENVIRONMENT_VALUES[@]} == 7)) ||
    fail "protected production environment content is invalid"
}

is_allowed_environment_key() {
  case "$1" in
    NODE_ENV | API_PORT | DATABASE_URL | BETTER_AUTH_URL | BETTER_AUTH_SECRET | ADMIN_ORIGIN | ASSET_STORAGE_ROOT) return 0 ;;
    *) return 1 ;;
  esac
}

validate_environment_values() {
  require_fixed_environment_values
  require_distinct_environment_secrets
  read_admin_origin
}

require_fixed_environment_values() {
  [[ "${ENVIRONMENT_VALUES[NODE_ENV]-}" == "production" &&
    "${ENVIRONMENT_VALUES[API_PORT]-}" == "$API_PORT_VALUE" &&
    "${ENVIRONMENT_VALUES[ASSET_STORAGE_ROOT]-}" == "$EXPECTED_ASSET_STORAGE_ROOT" ]] ||
    fail "protected production environment content is invalid"
}

require_distinct_environment_secrets() {
  local database_url auth_secret
  database_url="${ENVIRONMENT_VALUES[DATABASE_URL]-}"
  [[ "$database_url" =~ $DATABASE_URL_PATTERN ]] ||
    fail "protected production environment content is invalid"
  DATABASE_PASSWORD="${BASH_REMATCH[1]}"
  auth_secret="${ENVIRONMENT_VALUES[BETTER_AUTH_SECRET]-}"
  [[ "$auth_secret" =~ $SECRET_PATTERN && "$auth_secret" != "$DATABASE_PASSWORD" ]] ||
    fail "protected production environment content is invalid"
}

read_admin_origin() {
  local admin_host
  ADMIN_ORIGIN_VALUE="${ENVIRONMENT_VALUES[ADMIN_ORIGIN]-}"
  admin_host="${ADMIN_ORIGIN_VALUE#https://}"
  [[ "$ADMIN_ORIGIN_VALUE" == "https://${admin_host}" &&
    "$admin_host" =~ $HOSTNAME_PATTERN &&
    "${ENVIRONMENT_VALUES[BETTER_AUTH_URL]-}" == "$ADMIN_ORIGIN_VALUE" ]] ||
    fail "protected production environment content is invalid"
}

classify_completion_marker() {
  COMPLETION_MARKER_STATE="absent"
  if [[ -e "$COMPLETION_MARKER" || -L "$COMPLETION_MARKER" ]]; then
    if has_valid_completion_marker; then
      COMPLETION_MARKER_STATE="correct"
    else
      COMPLETION_MARKER_STATE="conflict"
    fi
  fi
}

has_valid_completion_marker() {
  local marker_line
  [[ -f "$COMPLETION_MARKER" && ! -L "$COMPLETION_MARKER" &&
    "$(stat -c %U "$COMPLETION_MARKER")" == "root" &&
    "$(stat -c %G "$COMPLETION_MARKER")" == "root" &&
    "$(stat -c %a "$COMPLETION_MARKER")" == "600" &&
    "$(stat -c %h "$COMPLETION_MARKER")" == "1" &&
    "$(stat -c %s "$COMPLETION_MARKER")" == "52" ]] || return 1
  IFS= read -r marker_line <"$COMPLETION_MARKER" || return 1
  [[ "$marker_line" =~ ^source_sha=([0-9a-f]{40})$ &&
    "${BASH_REMATCH[1]}" == "$SOURCE_SHA" ]]
}

read_identity_count() {
  local count
  count="$(PGPASSWORD="$DATABASE_PASSWORD" psql -X --no-psqlrc --no-password \
    -v ON_ERROR_STOP=1 -At --host=127.0.0.1 --port=5432 \
    --username=behr_app --dbname=behr --command='SELECT COUNT(*) FROM "user";')"
  [[ "$count" =~ ^[0-9]+$ ]] || fail "BeHR identity count is invalid"
  IDENTITY_COUNT=$((10#$count))
}

reconcile_bootstrap_state() {
  case "$COMPLETION_MARKER_STATE" in
    absent)
      ((IDENTITY_COUNT == 0)) ||
        fail "existing identity without a first-run completion marker requires operator reconciliation"
      create_initial_identity
      ;;
    correct)
      ((IDENTITY_COUNT >= 1)) ||
        fail "first-run completion marker without an identity requires operator reconciliation"
      printf 'bootstrap_state=preserved\n'
      ;;
    *) fail "first-run completion marker conflicts with required state and requires operator reconciliation" ;;
  esac
}

create_initial_identity() {
  read_administrator_identity
  invoke_existing_bootstrap
  read_identity_count
  ((IDENTITY_COUNT == 1)) || fail "initial identity count is invalid after bootstrap"
  publish_completion_marker
  printf 'bootstrap_state=created\n'
}

publish_completion_marker() {
  [[ ! -e "$COMPLETION_MARKER" && ! -L "$COMPLETION_MARKER" ]] ||
    fail "first-run completion marker appeared before publication"
  TEMP_COMPLETION_MARKER="$(mktemp /etc/bhr-cms/.first-run.complete.XXXXXX)"
  chown root:root "$TEMP_COMPLETION_MARKER"
  chmod 0600 "$TEMP_COMPLETION_MARKER"
  printf 'source_sha=%s\n' "$SOURCE_SHA" >"$TEMP_COMPLETION_MARKER"
  if ! ln -- "$TEMP_COMPLETION_MARKER" "$COMPLETION_MARKER"; then
    [[ ! -e "$COMPLETION_MARKER" && ! -L "$COMPLETION_MARKER" ]] ||
      fail "first-run completion marker appeared during publication"
    return 1
  fi
  rm -f -- "$TEMP_COMPLETION_MARKER"
  TEMP_COMPLETION_MARKER=""
  classify_completion_marker
  [[ "$COMPLETION_MARKER_STATE" == "correct" ]] ||
    fail "published first-run completion marker is invalid"
}

read_administrator_identity() {
  printf 'Administrator name: ' >&2
  IFS= read -r ADMINISTRATOR_NAME || fail "administrator name was not received"
  [[ -n "$ADMINISTRATOR_NAME" ]] || fail "administrator name must not be empty"
  printf 'Administrator email: ' >&2
  IFS= read -r ADMINISTRATOR_EMAIL || fail "administrator email was not received"
  [[ -n "$ADMINISTRATOR_EMAIL" ]] || fail "administrator email must not be empty"
  printf 'Administrator password: ' >&2
  IFS= read -rs ADMINISTRATOR_PASSWORD || fail "administrator password was not received"
  printf '\n' >&2
}

invoke_existing_bootstrap() {
  local status
  if (
    export_runtime_environment
    export_bootstrap_environment
    cd "$INSTALL_ROOT"
    bun run auth:bootstrap
  ); then
    status=0
  else
    status=$?
  fi
  unset ADMINISTRATOR_NAME ADMINISTRATOR_EMAIL ADMINISTRATOR_PASSWORD
  return "$status"
}

export_runtime_environment() {
  export NODE_ENV="${ENVIRONMENT_VALUES[NODE_ENV]}"
  export API_PORT="${ENVIRONMENT_VALUES[API_PORT]}"
  export DATABASE_URL="${ENVIRONMENT_VALUES[DATABASE_URL]}"
  export BETTER_AUTH_URL="${ENVIRONMENT_VALUES[BETTER_AUTH_URL]}"
  export BETTER_AUTH_SECRET="${ENVIRONMENT_VALUES[BETTER_AUTH_SECRET]}"
  export ADMIN_ORIGIN="${ENVIRONMENT_VALUES[ADMIN_ORIGIN]}"
  export ASSET_STORAGE_ROOT="${ENVIRONMENT_VALUES[ASSET_STORAGE_ROOT]}"
}

export_bootstrap_environment() {
  export BOOTSTRAP_NAME="$ADMINISTRATOR_NAME"
  export BOOTSTRAP_EMAIL="$ADMINISTRATOR_EMAIL"
  export BOOTSTRAP_PASSWORD="$ADMINISTRATOR_PASSWORD"
}

cleanup_completion_marker() {
  if [[ -n "$TEMP_COMPLETION_MARKER" &&
    "$TEMP_COMPLETION_MARKER" == /etc/bhr-cms/.first-run.complete.* &&
    -f "$TEMP_COMPLETION_MARKER" && ! -L "$TEMP_COMPLETION_MARKER" ]]; then
    rm -f -- "$TEMP_COMPLETION_MARKER"
  fi
}

enter_stage() {
  FIRST_RUN_STAGE=$1
  printf 'first_run_stage=%s\n' "$FIRST_RUN_STAGE"
}

report_first_run_failure() {
  local status=$?
  if ((BASHPID == ROOT_BASHPID && FAILURE_REPORTED == 0)); then
    FAILURE_REPORTED=1
    printf 'first_run_failed_stage=%s\n' "$FIRST_RUN_STAGE" >&2
  fi
  return "$status"
}

fail() {
  printf 'first_run_error=%s\n' "$1" >&2
  return 1
}

main "$@"
