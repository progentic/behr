#!/usr/bin/env bash
set -Eeuo pipefail

readonly CONFIG_ROOT="/etc/bhr-cms"
readonly ENV_FILE="${CONFIG_ROOT}/bhr-api.env"
readonly TLS_ROOT="${CONFIG_ROOT}/tls"
readonly CERTIFICATE_DESTINATION="${TLS_ROOT}/fullchain.pem"
readonly PRIVATE_KEY_DESTINATION="${TLS_ROOT}/privkey.pem"
readonly API_PORT_VALUE="3000"
readonly ASSET_STORAGE_ROOT="/var/lib/bhr-cms/uploads"
readonly SECRET_PATTERN='^[0-9a-f]{64}$'
readonly DATABASE_URL_PATTERN='^postgresql://behr_app:([0-9a-f]{64})@127\.0\.0\.1:5432/behr$'
readonly HOSTNAME_PATTERN='^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$'

TLS_STAGE="startup"
ROOT_BASHPID="$BASHPID"
FAILURE_REPORTED=0
SCRIPT_DIRECTORY=""
ADMIN_HOST=""
TLS_STATE=""
CERTIFICATE_SOURCE=""
PRIVATE_KEY_SOURCE=""
STAGING_DIRECTORY=""
CERTIFICATE_SNAPSHOT=""
PRIVATE_KEY_SNAPSHOT=""
CERTIFICATE_SNAPSHOT_INODE=""
CERTIFICATE_DIGEST=""
PRIVATE_KEY_DIGEST=""
VALIDATION_DIRECTORY=""
LEAF_CERTIFICATE=""
INTERMEDIATE_BUNDLE=""
CERTIFICATE_COUNT=0
CERTIFICATE_PUBLISHED=0
declare -A ENVIRONMENT_VALUES=()

main() {
  prepare_tls_installation "$@"
  validate_r3_prerequisites
  read_r2_environment
  scan_tls_state
  install_or_preserve_tls
  verify_final_tls_state
  report_tls_success
}

prepare_tls_installation() {
  trap report_tls_failure ERR
  trap cleanup_temporary_tls_state EXIT
  umask 077
  enter_stage "preflight"
  require_no_arguments "$@"
  run_r0_admission
}

validate_r3_prerequisites() {
  enter_stage "prerequisites"
  require_commands awk grep install ln mktemp openssl readlink rm sha256sum stat
  require_tls_root
}

read_r2_environment() {
  enter_stage "environment"
  require_environment_metadata
  read_environment_assignments
  validate_environment_values
}

scan_tls_state() {
  enter_stage "state-scan"
  local certificate_present=0 private_key_present=0
  [[ -e "$CERTIFICATE_DESTINATION" || -L "$CERTIFICATE_DESTINATION" ]] &&
    certificate_present=1
  [[ -e "$PRIVATE_KEY_DESTINATION" || -L "$PRIVATE_KEY_DESTINATION" ]] &&
    private_key_present=1
  if ((certificate_present == 0 && private_key_present == 0)); then
    TLS_STATE="absent"
    printf 'tls_state=absent\n'
    return 0
  fi
  ((certificate_present == 1 && private_key_present == 1)) ||
    fail "installed TLS state is partial and requires operator reconciliation"
  require_installed_tls_metadata
  validate_tls_material "$CERTIFICATE_DESTINATION" "$PRIVATE_KEY_DESTINATION"
  TLS_STATE="correct"
  printf 'tls_state=correct\n'
}

install_or_preserve_tls() {
  if [[ "$TLS_STATE" == "absent" ]]; then
    read_tls_source_paths
    snapshot_tls_sources
    validate_tls_material "$CERTIFICATE_SNAPSHOT" "$PRIVATE_KEY_SNAPSHOT"
    record_snapshot_identity
    publish_tls_snapshots
  fi
}

verify_final_tls_state() {
  enter_stage "verification"
  require_installed_tls_metadata
  if [[ "$TLS_STATE" == "absent" ]]; then
    require_validated_byte_identity
    validate_tls_material "$CERTIFICATE_DESTINATION" "$PRIVATE_KEY_DESTINATION"
    TLS_STATE="correct"
  fi
}

report_tls_success() {
  enter_stage "complete"
  printf 'tls_installation=pass\n'
  printf 'certificate_destination=%s\n' "$CERTIFICATE_DESTINATION"
  printf 'private_key_destination=%s\n' "$PRIVATE_KEY_DESTINATION"
}

require_no_arguments() {
  (($# == 0)) || fail "TLS installation accepts no arguments"
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
      fail "TLS installation requires command: $command"
  done
}

require_tls_root() {
  [[ -d "$TLS_ROOT" && ! -L "$TLS_ROOT" ]] ||
    fail "TLS destination root is invalid"
  [[ "$(stat -c %U "$TLS_ROOT")" == "root" &&
    "$(stat -c %G "$TLS_ROOT")" == "root" &&
    "$(stat -c %a "$TLS_ROOT")" == "700" ]] ||
    fail "TLS destination root metadata is invalid"
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
  read_environment_admin_host
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

read_environment_admin_host() {
  local admin_origin
  admin_origin="${ENVIRONMENT_VALUES[ADMIN_ORIGIN]-}"
  ADMIN_HOST="${admin_origin#https://}"
  [[ "$admin_origin" == "https://${ADMIN_HOST}" &&
    "$ADMIN_HOST" =~ $HOSTNAME_PATTERN &&
    "${ENVIRONMENT_VALUES[BETTER_AUTH_URL]-}" == "$admin_origin" ]] ||
    fail "protected production environment content is invalid"
}

read_tls_source_paths() {
  enter_stage "source"
  printf 'Certificate/full-chain source path: ' >&2
  IFS= read -r CERTIFICATE_SOURCE || fail "certificate source path was not received"
  printf 'Private-key source path: ' >&2
  IFS= read -r PRIVATE_KEY_SOURCE || fail "private-key source path was not received"
  require_absolute_source_path "$CERTIFICATE_SOURCE" "certificate"
  require_absolute_source_path "$PRIVATE_KEY_SOURCE" "private key"
}

require_absolute_source_path() {
  [[ -n "$1" && "$1" == /* ]] || fail "$2 source path must be absolute"
}

snapshot_tls_sources() {
  local certificate_path private_key_path private_key_mode
  certificate_path="$(readlink -f -- "$CERTIFICATE_SOURCE")" ||
    fail "certificate source path cannot be resolved"
  private_key_path="$(readlink -f -- "$PRIVATE_KEY_SOURCE")" ||
    fail "private-key source path cannot be resolved"
  [[ -f "$certificate_path" && -r "$certificate_path" ]] ||
    fail "certificate source is not a readable regular file"
  [[ -f "$private_key_path" && -r "$private_key_path" ]] ||
    fail "private-key source is not a readable regular file"
  private_key_mode="$(stat -c %a "$private_key_path")"
  (((8#$private_key_mode & 077) == 0)) ||
    fail "private-key source must not be group/world accessible"
  STAGING_DIRECTORY="$(mktemp -d "$TLS_ROOT/.tls-install.XXXXXX")"
  CERTIFICATE_SNAPSHOT="${STAGING_DIRECTORY}/fullchain.pem"
  PRIVATE_KEY_SNAPSHOT="${STAGING_DIRECTORY}/privkey.pem"
  install -o root -g root -m 0644 "$certificate_path" "$CERTIFICATE_SNAPSHOT"
  install -o root -g root -m 0600 "$private_key_path" "$PRIVATE_KEY_SNAPSHOT"
}

validate_tls_material() {
  local certificate=$1 private_key=$2
  prepare_validation_directory
  validate_certificate_bundle "$certificate"
  validate_leaf_certificate
  validate_private_key "$private_key"
  validate_certificate_key_pair "$private_key"
  cleanup_validation_directory
}

prepare_validation_directory() {
  VALIDATION_DIRECTORY="$(mktemp -d "$TLS_ROOT/.tls-validation.XXXXXX")"
  LEAF_CERTIFICATE="${VALIDATION_DIRECTORY}/certificate-1.pem"
  INTERMEDIATE_BUNDLE="${VALIDATION_DIRECTORY}/intermediates.pem"
  CERTIFICATE_COUNT=0
}

validate_certificate_bundle() {
  local certificate=$1 index
  enter_stage "certificate"
  CERTIFICATE_COUNT="$(split_certificate_bundle "$certificate")" ||
    fail "certificate bundle grammar is invalid"
  [[ "$CERTIFICATE_COUNT" =~ ^[0-9]+$ && "$CERTIFICATE_COUNT" -ge 1 ]] ||
    fail "certificate bundle grammar is invalid"
  for ((index = 1; index <= CERTIFICATE_COUNT; index += 1)); do
    openssl x509 -in "${VALIDATION_DIRECTORY}/certificate-${index}.pem" \
      -noout >/dev/null 2>&1 || fail "certificate bundle contains an invalid certificate"
  done
}

split_certificate_bundle() {
  local certificate=$1
  awk -v output_dir="$VALIDATION_DIRECTORY" '
    function reject() { invalid = 1; exit 1 }
    function write_line(line) {
      print line > output_dir "/certificate-" count ".pem"
      if (count > 1) print line >> output_dir "/intermediates.pem"
    }
    BEGIN { inside = 0; count = 0; invalid = 0 }
    $0 == "-----BEGIN CERTIFICATE-----" {
      if (inside) reject()
      inside = 1
      count += 1
      write_line($0)
      next
    }
    $0 == "-----END CERTIFICATE-----" {
      if (!inside) reject()
      write_line($0)
      inside = 0
      next
    }
    inside {
      if ($0 !~ /^[A-Za-z0-9+\/=]+$/) reject()
      write_line($0)
      next
    }
    $0 !~ /^[[:space:]]*$/ { reject() }
    END {
      if (invalid || inside || count < 1) exit 1
      print count
    }
  ' "$certificate"
}

validate_leaf_certificate() {
  openssl x509 -in "$LEAF_CERTIFICATE" -noout -checkhost "$ADMIN_HOST" \
    >/dev/null 2>&1 || fail "leaf certificate does not match the configured admin hostname"
  openssl x509 -in "$LEAF_CERTIFICATE" -noout -checkend 0 \
    >/dev/null 2>&1 || fail "leaf certificate is expired"
  openssl x509 -in "$LEAF_CERTIFICATE" -noout -purpose 2>/dev/null |
    grep -qx 'SSL server : Yes' || fail "leaf certificate is not valid for TLS server use"
  if ((CERTIFICATE_COUNT > 1)); then
    openssl verify -purpose sslserver -verify_hostname "$ADMIN_HOST" \
      -untrusted "$INTERMEDIATE_BUNDLE" "$LEAF_CERTIFICATE" >/dev/null 2>&1 ||
      fail "certificate chain is untrusted or not currently valid"
  else
    openssl verify -purpose sslserver -verify_hostname "$ADMIN_HOST" \
      "$LEAF_CERTIFICATE" >/dev/null 2>&1 ||
      fail "certificate chain is untrusted or not currently valid"
  fi
}

validate_private_key() {
  local private_key=$1
  enter_stage "private-key"
  ! grep -Eq 'BEGIN ENCRYPTED PRIVATE KEY|Proc-Type:[[:space:]]*4,ENCRYPTED' \
    "$private_key" || fail "encrypted private keys are not supported"
  openssl pkey -in "$private_key" -passin pass: -noout -check \
    >/dev/null 2>&1 || fail "private key is invalid or requires a passphrase"
}

validate_certificate_key_pair() {
  local private_key=$1 certificate_digest key_digest
  enter_stage "pair"
  certificate_digest="$(openssl x509 -in "$LEAF_CERTIFICATE" -pubkey -noout |
    openssl pkey -pubin -outform DER 2>/dev/null | sha256sum | awk '{print $1}')"
  key_digest="$(openssl pkey -in "$private_key" -passin pass: -pubout \
    -outform DER 2>/dev/null | sha256sum | awk '{print $1}')"
  [[ "$certificate_digest" == "$key_digest" ]] ||
    fail "private key does not match the leaf certificate"
}

record_snapshot_identity() {
  CERTIFICATE_SNAPSHOT_INODE="$(stat -c %i "$CERTIFICATE_SNAPSHOT")"
  CERTIFICATE_DIGEST="$(sha256sum "$CERTIFICATE_SNAPSHOT" | awk '{print $1}')"
  PRIVATE_KEY_DIGEST="$(sha256sum "$PRIVATE_KEY_SNAPSHOT" | awk '{print $1}')"
}

publish_tls_snapshots() {
  enter_stage "publication"
  [[ ! -e "$CERTIFICATE_DESTINATION" && ! -L "$CERTIFICATE_DESTINATION" &&
    ! -e "$PRIVATE_KEY_DESTINATION" && ! -L "$PRIVATE_KEY_DESTINATION" ]] ||
    fail "TLS destination appeared before publication"
  publish_certificate_snapshot
  publish_private_key_snapshot
  finish_tls_publication
}

publish_certificate_snapshot() {
  if ! ln -- "$CERTIFICATE_SNAPSHOT" "$CERTIFICATE_DESTINATION"; then
    classify_publication_failure "$CERTIFICATE_DESTINATION"
    return 1
  fi
  CERTIFICATE_PUBLISHED=1
}

publish_private_key_snapshot() {
  if ! ln -- "$PRIVATE_KEY_SNAPSHOT" "$PRIVATE_KEY_DESTINATION"; then
    compensate_owned_certificate
    classify_publication_failure "$PRIVATE_KEY_DESTINATION"
    return 1
  fi
}

finish_tls_publication() {
  rm -f -- "$CERTIFICATE_SNAPSHOT" "$PRIVATE_KEY_SNAPSHOT"
  CERTIFICATE_SNAPSHOT=""
  PRIVATE_KEY_SNAPSHOT=""
  CERTIFICATE_PUBLISHED=0
  cleanup_staging_directory
}

classify_publication_failure() {
  [[ ! -e "$1" && ! -L "$1" ]] || fail "TLS destination appeared during publication"
}

compensate_owned_certificate() {
  if ((CERTIFICATE_PUBLISHED == 1)) &&
    [[ -f "$CERTIFICATE_DESTINATION" && ! -L "$CERTIFICATE_DESTINATION" &&
      "$(stat -c %i "$CERTIFICATE_DESTINATION")" == "$CERTIFICATE_SNAPSHOT_INODE" ]]; then
    rm -f -- "$CERTIFICATE_DESTINATION"
  fi
  CERTIFICATE_PUBLISHED=0
}

require_installed_tls_metadata() {
  [[ -f "$CERTIFICATE_DESTINATION" && ! -L "$CERTIFICATE_DESTINATION" &&
    "$(stat -c %U "$CERTIFICATE_DESTINATION")" == "root" &&
    "$(stat -c %G "$CERTIFICATE_DESTINATION")" == "root" &&
    "$(stat -c %a "$CERTIFICATE_DESTINATION")" == "644" &&
    "$(stat -c %h "$CERTIFICATE_DESTINATION")" == "1" ]] ||
    fail "installed certificate state conflicts with R3"
  [[ -f "$PRIVATE_KEY_DESTINATION" && ! -L "$PRIVATE_KEY_DESTINATION" &&
    "$(stat -c %U "$PRIVATE_KEY_DESTINATION")" == "root" &&
    "$(stat -c %G "$PRIVATE_KEY_DESTINATION")" == "root" &&
    "$(stat -c %a "$PRIVATE_KEY_DESTINATION")" == "600" &&
    "$(stat -c %h "$PRIVATE_KEY_DESTINATION")" == "1" ]] ||
    fail "installed private-key state conflicts with R3"
}

require_validated_byte_identity() {
  local certificate_digest private_key_digest
  certificate_digest="$(sha256sum "$CERTIFICATE_DESTINATION" | awk '{print $1}')"
  private_key_digest="$(sha256sum "$PRIVATE_KEY_DESTINATION" | awk '{print $1}')"
  [[ "$certificate_digest" == "$CERTIFICATE_DIGEST" &&
    "$private_key_digest" == "$PRIVATE_KEY_DIGEST" ]] ||
    fail "installed TLS bytes differ from validated snapshots"
}

cleanup_validation_directory() {
  if [[ -n "$VALIDATION_DIRECTORY" &&
    "$VALIDATION_DIRECTORY" == "$TLS_ROOT/.tls-validation."* &&
    -d "$VALIDATION_DIRECTORY" ]]; then
    rm -rf -- "$VALIDATION_DIRECTORY"
  fi
  VALIDATION_DIRECTORY=""
  LEAF_CERTIFICATE=""
  INTERMEDIATE_BUNDLE=""
}

cleanup_staging_directory() {
  if [[ -n "$STAGING_DIRECTORY" &&
    "$STAGING_DIRECTORY" == "$TLS_ROOT/.tls-install."* &&
    -d "$STAGING_DIRECTORY" ]]; then
    rm -rf -- "$STAGING_DIRECTORY"
  fi
  STAGING_DIRECTORY=""
}

cleanup_temporary_tls_state() {
  cleanup_validation_directory
  cleanup_staging_directory
}

enter_stage() {
  TLS_STAGE=$1
  printf 'tls_installation_stage=%s\n' "$TLS_STAGE"
}

report_tls_failure() {
  local status=$?
  if ((BASHPID == ROOT_BASHPID && FAILURE_REPORTED == 0)); then
    FAILURE_REPORTED=1
    printf 'tls_installation_failed_stage=%s\n' "$TLS_STAGE" >&2
  fi
  return "$status"
}

fail() {
  printf 'tls_installation_error=%s\n' "$1" >&2
  return 1
}

main "$@"
