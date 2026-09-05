#!/usr/bin/env bash
set -Eeuo pipefail

readonly BUN_VERSION="1.4.0"
readonly BUN_RELEASE_TAG="bun-v1.4.0"
readonly BUN_RELEASE_BASE_URL="https://github.com/oven-sh/bun/releases/download/${BUN_RELEASE_TAG}"
readonly BUN_X64_ARCHIVE="bun-linux-x64.zip"
readonly BUN_X64_SHA256="2d03fb5fb83ac8b567aca0a281b2ce1a1a19d488f56c2968d88c3f25e92fe452"
readonly BUN_AARCH64_ARCHIVE="bun-linux-aarch64.zip"
readonly BUN_AARCH64_SHA256="4b1a332ee861983eb93bcfe6f770fff94e3e31b2c388bdaea3c8ed35e58eed0e"
readonly BUN_DESTINATION="/usr/local/bin/bun"
readonly SERVICE_ACCOUNT="bhr-cms"
readonly NOLOGIN_SHELL="/usr/sbin/nologin"
readonly DEFAULT_REGULAR_ID_MIN=1000
readonly DEFAULT_SYSTEM_ID_MIN=101
readonly OPS_STAGING="/var/lib/bhr-cms/uploads.staging"
readonly OPS_PRE_RESTORE="/var/lib/bhr-cms/uploads.pre-restore"

readonly -a HOST_PACKAGES=(
  bash
  ca-certificates
  coreutils
  curl
  findutils
  git
  grep
  gzip
  mawk
  nginx
  openssl
  postgresql-16
  postgresql-client-16
  sed
  sudo
  tar
  unzip
  util-linux
)

INSTALL_HOST_STAGE="startup"
ROOT_BASHPID="$BASHPID"
FAILURE_REPORTED=0
SCRIPT_DIRECTORY=""
TEMP_DIRECTORY=""
SYSTEM_UID_MIN=""
SYSTEM_UID_MAX=""
SYSTEM_GID_MIN=""
SYSTEM_GID_MAX=""
REGULAR_UID_MIN=""
REGULAR_GID_MIN=""
SERVICE_GROUP_PRESENT=0
SERVICE_GROUP_GID=""
SERVICE_USER_PRESENT=0
BUN_ARCHIVE=""
BUN_ARCHIVE_SHA256=""
BUN_EXTRACTED_DIRECTORY=""

main() {
  trap report_host_provisioning_failure ERR
  trap cleanup_temporary_state EXIT
  enter_stage "preflight"
  require_no_arguments "$@"
  run_r0_admission
  scan_host_conflicts
  provision_host_packages
  establish_nginx_baseline
  establish_bun_runtime
  establish_service_identity
  establish_host_filesystem
  report_host_provisioning_success
}

require_no_arguments() {
  (($# == 0)) || fail "host provisioning accepts no arguments"
}

run_r0_admission() {
  local script_path
  script_path="$(readlink -f -- "${BASH_SOURCE[0]}")"
  SCRIPT_DIRECTORY="${script_path%/*}"
  "$SCRIPT_DIRECTORY/install-preflight.sh"
}

scan_host_conflicts() {
  enter_stage "conflict-scan"
  require_commands apt-get getent grep id readlink stat
  read_system_account_ranges
  require_clean_restore_state
  scan_service_group
  scan_service_user
  scan_bun_destination_type
  scan_directory_conflicts
  scan_nginx_conflicts
}

provision_host_packages() {
  enter_stage "packages"
  apt-get update
  DEBIAN_FRONTEND=noninteractive apt-get install --yes "${HOST_PACKAGES[@]}"
  require_phase_q_commands
}

establish_nginx_baseline() {
  enter_stage "nginx-baseline"
  disable_package_default_site
  scan_nginx_conflicts
  nginx -t
}

establish_bun_runtime() {
  enter_stage "bun"
  select_bun_artifact
  acquire_verified_bun
  install_or_preserve_bun
}

establish_service_identity() {
  enter_stage "service-identity"
  if ((SERVICE_GROUP_PRESENT == 0)); then
    groupadd --system "$SERVICE_ACCOUNT"
  fi
  scan_service_group
  if ((SERVICE_USER_PRESENT == 0)); then
    useradd --system --gid "$SERVICE_ACCOUNT" --home-dir /nonexistent \
      --no-create-home --shell "$NOLOGIN_SHELL" "$SERVICE_ACCOUNT"
  fi
  scan_service_user
}

establish_host_filesystem() {
  enter_stage "filesystem"
  ensure_directory /opt/bhr-cms root root 0755
  ensure_directory /etc/bhr-cms root root 0700
  ensure_directory /etc/bhr-cms/tls root root 0700
  ensure_directory /var/lib/bhr-cms root root 0755
  ensure_directory /var/lib/bhr-cms/uploads "$SERVICE_ACCOUNT" "$SERVICE_ACCOUNT" 0750
  ensure_directory /var/backups/bhr-cms root root 0700
}

report_host_provisioning_success() {
  enter_stage "complete"
  printf 'host_provisioning=pass\n'
  printf 'bun_version=%s\n' "$BUN_VERSION"
  printf 'bun_asset=%s\n' "$BUN_ARCHIVE"
  printf 'bun_archive_sha256=%s\n' "$BUN_ARCHIVE_SHA256"
  printf 'service_user=%s\n' "$SERVICE_ACCOUNT"
  printf 'service_group=%s\n' "$SERVICE_ACCOUNT"
}

enter_stage() {
  INSTALL_HOST_STAGE=$1
  printf 'install_host_stage=%s\n' "$INSTALL_HOST_STAGE"
}

require_commands() {
  local command
  for command in "$@"; do
    command -v "$command" >/dev/null ||
      fail "host provisioning requires command: $command"
  done
}

read_system_account_ranges() {
  local key value
  local uid_min_value="" gid_min_value=""
  local sys_uid_min_value="" sys_uid_max_value=""
  local sys_gid_min_value="" sys_gid_max_value=""
  local uid_min_count=0 gid_min_count=0
  local sys_uid_min_count=0 sys_uid_max_count=0
  local sys_gid_min_count=0 sys_gid_max_count=0
  [[ -r /etc/login.defs ]] || fail "system account policy is unreadable"
  while read -r key value _; do
    case "$key" in
      UID_MIN)
        ((uid_min_count += 1))
        uid_min_value=$value
        ;;
      GID_MIN)
        ((gid_min_count += 1))
        gid_min_value=$value
        ;;
      SYS_UID_MIN)
        ((sys_uid_min_count += 1))
        sys_uid_min_value=$value
        ;;
      SYS_UID_MAX)
        ((sys_uid_max_count += 1))
        sys_uid_max_value=$value
        ;;
      SYS_GID_MIN)
        ((sys_gid_min_count += 1))
        sys_gid_min_value=$value
        ;;
      SYS_GID_MAX)
        ((sys_gid_max_count += 1))
        sys_gid_max_value=$value
        ;;
    esac
  done </etc/login.defs
  ((uid_min_count <= 1 && gid_min_count <= 1 &&
    sys_uid_min_count <= 1 && sys_uid_max_count <= 1 &&
    sys_gid_min_count <= 1 && sys_gid_max_count <= 1)) ||
    fail "system account policy contains duplicate entries"

  if ((uid_min_count == 0)); then
    REGULAR_UID_MIN=$DEFAULT_REGULAR_ID_MIN
  else
    [[ "$uid_min_value" =~ ^[0-9]+$ ]] || fail "system account policy is invalid"
    REGULAR_UID_MIN=$((10#$uid_min_value))
  fi
  if ((gid_min_count == 0)); then
    REGULAR_GID_MIN=$DEFAULT_REGULAR_ID_MIN
  else
    [[ "$gid_min_value" =~ ^[0-9]+$ ]] || fail "system account policy is invalid"
    REGULAR_GID_MIN=$((10#$gid_min_value))
  fi
  if ((sys_uid_min_count == 0)); then
    SYSTEM_UID_MIN=$DEFAULT_SYSTEM_ID_MIN
  else
    [[ "$sys_uid_min_value" =~ ^[0-9]+$ ]] || fail "system account policy is invalid"
    SYSTEM_UID_MIN=$((10#$sys_uid_min_value))
  fi
  if ((sys_uid_max_count == 0)); then
    SYSTEM_UID_MAX=$((REGULAR_UID_MIN - 1))
  else
    [[ "$sys_uid_max_value" =~ ^[0-9]+$ ]] || fail "system account policy is invalid"
    SYSTEM_UID_MAX=$((10#$sys_uid_max_value))
  fi
  if ((sys_gid_min_count == 0)); then
    SYSTEM_GID_MIN=$DEFAULT_SYSTEM_ID_MIN
  else
    [[ "$sys_gid_min_value" =~ ^[0-9]+$ ]] || fail "system account policy is invalid"
    SYSTEM_GID_MIN=$((10#$sys_gid_min_value))
  fi
  if ((sys_gid_max_count == 0)); then
    SYSTEM_GID_MAX=$((REGULAR_GID_MIN - 1))
  else
    [[ "$sys_gid_max_value" =~ ^[0-9]+$ ]] || fail "system account policy is invalid"
    SYSTEM_GID_MAX=$((10#$sys_gid_max_value))
  fi

  [[ "$SYSTEM_UID_MIN" =~ ^[0-9]+$ && "$SYSTEM_UID_MAX" =~ ^[0-9]+$ &&
    "$SYSTEM_GID_MIN" =~ ^[0-9]+$ && "$SYSTEM_GID_MAX" =~ ^[0-9]+$ ]] ||
    fail "system account policy is invalid"
  ((SYSTEM_UID_MIN <= SYSTEM_UID_MAX && SYSTEM_GID_MIN <= SYSTEM_GID_MAX)) ||
    fail "system account policy is invalid"
}

require_clean_restore_state() {
  [[ ! -e "$OPS_STAGING" && ! -L "$OPS_STAGING" ]] ||
    fail "restore residue requires operator reconciliation: $OPS_STAGING"
  [[ ! -e "$OPS_PRE_RESTORE" && ! -L "$OPS_PRE_RESTORE" ]] ||
    fail "restore residue requires operator reconciliation: $OPS_PRE_RESTORE"
}

scan_service_group() {
  local entry status name gid members
  if entry="$(getent group "$SERVICE_ACCOUNT")"; then
    IFS=: read -r name _ gid members <<<"$entry"
    [[ "$name" == "$SERVICE_ACCOUNT" && "$gid" =~ ^[0-9]+$ && -z "$members" ]] ||
      fail "existing bhr-cms group conflicts with required system identity"
    ((gid >= SYSTEM_GID_MIN && gid <= SYSTEM_GID_MAX)) ||
      fail "existing bhr-cms group conflicts with required system identity"
    SERVICE_GROUP_PRESENT=1
    SERVICE_GROUP_GID=$gid
  else
    status=$?
    ((status == 2)) || return "$status"
    SERVICE_GROUP_PRESENT=0
    SERVICE_GROUP_GID=""
  fi
}

scan_service_user() {
  local entry status name uid gid home shell group_ids
  if entry="$(getent passwd "$SERVICE_ACCOUNT")"; then
    IFS=: read -r name _ uid gid _ home shell <<<"$entry"
    group_ids="$(id -G "$SERVICE_ACCOUNT")"
    [[ "$name" == "$SERVICE_ACCOUNT" && "$uid" =~ ^[0-9]+$ && "$gid" =~ ^[0-9]+$ &&
      "$SERVICE_GROUP_PRESENT" -eq 1 && "$gid" == "$SERVICE_GROUP_GID" &&
      "$group_ids" == "$SERVICE_GROUP_GID" && "$home" == "/nonexistent" &&
      "$shell" == "$NOLOGIN_SHELL" ]] ||
      fail "existing bhr-cms user conflicts with required system identity"
    ((uid >= SYSTEM_UID_MIN && uid <= SYSTEM_UID_MAX)) ||
      fail "existing bhr-cms user conflicts with required system identity"
    SERVICE_USER_PRESENT=1
  else
    status=$?
    ((status == 2)) || return "$status"
    SERVICE_USER_PRESENT=0
  fi
}

scan_bun_destination_type() {
  [[ -d /usr/local/bin && ! -L /usr/local/bin ]] ||
    fail "Bun destination directory is invalid"
  if [[ -e "$BUN_DESTINATION" || -L "$BUN_DESTINATION" ]]; then
    [[ -f "$BUN_DESTINATION" && ! -L "$BUN_DESTINATION" ]] ||
      fail "existing Bun destination has a conflicting type"
  fi
}

scan_directory_conflicts() {
  require_directory_if_present /opt/bhr-cms root root 755
  require_directory_if_present /etc/bhr-cms root root 700
  require_directory_if_present /etc/bhr-cms/tls root root 700
  require_directory_if_present /var/lib/bhr-cms root root 755
  require_directory_if_present /var/lib/bhr-cms/uploads "$SERVICE_ACCOUNT" "$SERVICE_ACCOUNT" 750
  require_directory_if_present /var/backups/bhr-cms root root 700
}

require_directory_if_present() {
  local path=$1 owner=$2 group=$3 mode=$4
  if [[ -e "$path" || -L "$path" ]]; then
    [[ -d "$path" && ! -L "$path" ]] ||
      fail "existing host path has a conflicting type: $path"
    [[ "$(stat -c %U "$path")" == "$owner" &&
      "$(stat -c %G "$path")" == "$group" &&
      "$(stat -c %a "$path")" == "$mode" ]] ||
      fail "existing host directory has conflicting metadata: $path"
  fi
}

scan_nginx_conflicts() {
  local enabled_root="/etc/nginx/sites-enabled" path target
  [[ ! -L "$enabled_root" ]] || fail "nginx enabled-site root is a conflicting symlink"
  [[ -e "$enabled_root" ]] || return 0
  [[ -d "$enabled_root" ]] || fail "nginx enabled-site root has a conflicting type"
  if [[ -e "$enabled_root/default" || -L "$enabled_root/default" ]]; then
    [[ -L "$enabled_root/default" ]] || fail "nginx default enabled site is not the package symlink"
    target="$(readlink -f -- "$enabled_root/default")"
    [[ "$target" == "/etc/nginx/sites-available/default" && -f "$target" && ! -L "$target" ]] ||
      fail "nginx default enabled site has a conflicting target"
  fi
  shopt -s nullglob
  for path in "$enabled_root"/*; do
    [[ "$path" == "$enabled_root/default" ]] && continue
    [[ -f "$path" ]] || fail "enabled nginx configuration has a conflicting type: $path"
    target="$(readlink -f -- "$path")"
    [[ -r "$target" ]] || fail "enabled nginx configuration is unreadable: $path"
    if grep -Eq '^[[:space:]]*listen[[:space:]].*default_server' "$target"; then
      fail "enabled nginx configuration conflicts with BeHR default-server ownership: $path"
    fi
  done
  shopt -u nullglob
}

require_phase_q_commands() {
  require_commands bash git curl flock nginx systemctl install stat openssl tar \
    gzip sha256sum psql pg_dump pg_restore sudo grep sed mktemp rm sleep awk cut \
    find sort wc unzip cmp getent groupadd id readlink useradd uname
}

disable_package_default_site() {
  local enabled="/etc/nginx/sites-enabled/default" target
  if [[ -e "$enabled" || -L "$enabled" ]]; then
    [[ -L "$enabled" ]] || fail "nginx default enabled site is not the package symlink"
    target="$(readlink -f -- "$enabled")"
    [[ "$target" == "/etc/nginx/sites-available/default" && -f "$target" && ! -L "$target" ]] ||
      fail "nginx default enabled site has a conflicting target"
    rm -- "$enabled"
  fi
}

select_bun_artifact() {
  case "$(uname -m)" in
    x86_64)
      BUN_ARCHIVE=$BUN_X64_ARCHIVE
      BUN_ARCHIVE_SHA256=$BUN_X64_SHA256
      BUN_EXTRACTED_DIRECTORY="bun-linux-x64"
      ;;
    aarch64)
      BUN_ARCHIVE=$BUN_AARCH64_ARCHIVE
      BUN_ARCHIVE_SHA256=$BUN_AARCH64_SHA256
      BUN_EXTRACTED_DIRECTORY="bun-linux-aarch64"
      ;;
    *) fail "R0-admitted architecture no longer matches R1 Bun support" ;;
  esac
}

acquire_verified_bun() {
  local archive candidate
  TEMP_DIRECTORY="$(mktemp -d)"
  chmod 0700 "$TEMP_DIRECTORY"
  archive="$TEMP_DIRECTORY/$BUN_ARCHIVE"
  curl --fail --location --proto '=https' --tlsv1.2 \
    --output "$archive" "$BUN_RELEASE_BASE_URL/$BUN_ARCHIVE"
  printf '%s  %s\n' "$BUN_ARCHIVE_SHA256" "$archive" | sha256sum --check --status
  unzip -q "$archive" -d "$TEMP_DIRECTORY/extracted"
  candidate="$TEMP_DIRECTORY/extracted/$BUN_EXTRACTED_DIRECTORY/bun"
  [[ -f "$candidate" && ! -L "$candidate" ]] ||
    fail "verified Bun archive does not contain the expected executable"
  [[ "$($candidate --version)" == "$BUN_VERSION" ]] ||
    fail "verified Bun candidate has an unexpected version"
}

install_or_preserve_bun() {
  local candidate="$TEMP_DIRECTORY/extracted/$BUN_EXTRACTED_DIRECTORY/bun"
  if [[ -e "$BUN_DESTINATION" || -L "$BUN_DESTINATION" ]]; then
    [[ -f "$BUN_DESTINATION" && ! -L "$BUN_DESTINATION" &&
      "$(stat -c %U "$BUN_DESTINATION")" == "root" &&
      "$(stat -c %G "$BUN_DESTINATION")" == "root" &&
      "$(stat -c %a "$BUN_DESTINATION")" == "755" ]] ||
      fail "existing Bun destination has conflicting metadata"
    cmp --silent "$candidate" "$BUN_DESTINATION" ||
      fail "existing Bun destination does not match the verified candidate"
  else
    install -o root -g root -m 0755 "$candidate" "$BUN_DESTINATION"
  fi
  [[ "$($BUN_DESTINATION --version)" == "$BUN_VERSION" ]] ||
    fail "installed Bun version is invalid"
}

ensure_directory() {
  local path=$1 owner=$2 group=$3 mode=$4
  if [[ ! -e "$path" && ! -L "$path" ]]; then
    install -d -o "$owner" -g "$group" -m "$mode" "$path"
  fi
  require_directory_if_present "$path" "$owner" "$group" "${mode#0}"
}

cleanup_temporary_state() {
  if [[ -n "$TEMP_DIRECTORY" && "$TEMP_DIRECTORY" == /tmp/* &&
    -d "$TEMP_DIRECTORY" ]]; then
    rm -rf -- "$TEMP_DIRECTORY"
  fi
}

report_host_provisioning_failure() {
  local status=$?
  if ((BASHPID == ROOT_BASHPID && FAILURE_REPORTED == 0)); then
    FAILURE_REPORTED=1
    printf 'install_host_failed_stage=%s\n' "$INSTALL_HOST_STAGE" >&2
  fi
  return "$status"
}

fail() {
  printf 'install_host_error=%s\n' "$1" >&2
  return 1
}

main "$@"
