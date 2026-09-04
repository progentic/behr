#!/usr/bin/env bash
set -Eeuo pipefail

readonly REQUIRED_UBUNTU_VERSION="24.04"
readonly MINIMUM_BASH_MAJOR=5

HOST_OS_ID=""
HOST_OS_VERSION=""
HOST_ARCH=""
SOURCE_ROOT=""
SOURCE_SHA=""

main() {
  require_no_arguments "$@"
  require_root
  require_interactive_terminal
  require_supported_bash
  require_commands git readlink uname
  read_supported_ubuntu_release
  require_systemd_host
  read_supported_architecture
  read_source_identity
  report_preflight_success
}

require_no_arguments() {
  (($# == 0)) || fail "first-run preflight accepts no arguments"
}

require_root() {
  ((EUID == 0)) || fail "first-run installation requires root"
}

require_interactive_terminal() {
  [[ -t 0 ]] || fail "first-run installation requires an interactive terminal"
}

require_supported_bash() {
  ((BASH_VERSINFO[0] >= MINIMUM_BASH_MAJOR)) ||
    fail "first-run installation requires Bash 5 or newer"
}

require_commands() {
  local command
  for command in "$@"; do
    command -v "$command" >/dev/null ||
      fail "first-run preflight requires command: $command"
  done
}

read_supported_ubuntu_release() {
  [[ -r /etc/os-release ]] || fail "host release metadata is unreadable"
  local ID="" VERSION_ID=""
  # shellcheck disable=SC1091
  source /etc/os-release
  [[ -n "$ID" && -n "$VERSION_ID" ]] ||
    fail "host release metadata is invalid"
  [[ "$ID" == "ubuntu" && "$VERSION_ID" == "$REQUIRED_UBUNTU_VERSION" ]] ||
    fail "first-run installation requires Ubuntu 24.04 LTS"
  HOST_OS_ID="$ID"
  HOST_OS_VERSION="$VERSION_ID"
}

require_systemd_host() {
  command -v systemctl >/dev/null ||
    fail "first-run installation requires a systemd host"
  [[ -d /run/systemd/system ]] ||
    fail "first-run installation requires a systemd host"
}

read_supported_architecture() {
  HOST_ARCH="$(uname -m)"
  case "$HOST_ARCH" in
    x86_64 | aarch64) ;;
    *) fail "first-run installation does not support this CPU architecture" ;;
  esac
}

read_source_identity() {
  local script_path git_top_level tracked_state
  script_path="$(readlink -f -- "${BASH_SOURCE[0]}")"
  [[ -n "$script_path" && -f "$script_path" ]] ||
    fail "first-run preflight source path is invalid"
  SOURCE_ROOT="$(readlink -f -- "${script_path%/*}/../..")"
  [[ -n "$SOURCE_ROOT" && -e "$SOURCE_ROOT/.git" ]] ||
    fail "first-run source must be a Git work tree"
  git_top_level="$(git -C "$SOURCE_ROOT" rev-parse --show-toplevel)"
  git_top_level="$(readlink -f -- "$git_top_level")"
  [[ "$git_top_level" == "$SOURCE_ROOT" ]] ||
    fail "Git top-level does not match the first-run source root"
  SOURCE_SHA="$(git -C "$SOURCE_ROOT" rev-parse --verify 'HEAD^{commit}')"
  [[ "$SOURCE_SHA" =~ ^[0-9a-f]{40}$ ]] ||
    fail "source HEAD must resolve to a full commit SHA"
  tracked_state="$(git -C "$SOURCE_ROOT" status --porcelain --untracked-files=no)"
  [[ -z "$tracked_state" ]] || fail "first-run source has tracked changes"
}

report_preflight_success() {
  printf 'install_preflight=pass\n'
  printf 'source_sha=%s\n' "$SOURCE_SHA"
  printf 'source_root=%s\n' "$SOURCE_ROOT"
  printf 'host_os=%s\n' "$HOST_OS_ID"
  printf 'host_version=%s\n' "$HOST_OS_VERSION"
  printf 'host_arch=%s\n' "$HOST_ARCH"
}

fail() {
  printf 'install_preflight_error=%s\n' "$1" >&2
  return 1
}

main "$@"
