#!/usr/bin/env bash
set -Eeuo pipefail

readonly INSTALL_ROOT="/opt/bhr-cms"
readonly ENV_FILE="/etc/bhr-cms/bhr-api.env"
readonly API_PORT_VALUE="3000"
readonly ASSET_STORAGE_ROOT="/var/lib/bhr-cms/uploads"
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
  read_runtime_environment
  read_administrator_identity
  invoke_existing_bootstrap
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
    "${ENVIRONMENT_VALUES[ASSET_STORAGE_ROOT]-}" == "$ASSET_STORAGE_ROOT" ]] ||
    fail "protected production environment content is invalid"
}

require_distinct_environment_secrets() {
  local database_url database_password auth_secret
  database_url="${ENVIRONMENT_VALUES[DATABASE_URL]-}"
  [[ "$database_url" =~ $DATABASE_URL_PATTERN ]] ||
    fail "protected production environment content is invalid"
  database_password="${BASH_REMATCH[1]}"
  auth_secret="${ENVIRONMENT_VALUES[BETTER_AUTH_SECRET]-}"
  [[ "$auth_secret" =~ $SECRET_PATTERN && "$auth_secret" != "$database_password" ]] ||
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
