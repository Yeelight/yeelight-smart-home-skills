#!/bin/sh
set -eu
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
ACTION=${1:-start}
shift || true
case "$ACTION" in
  host-prepare-validation|host-run-validation|host-recover-validation|host-recover-screening)
    exec node "$SCRIPT_DIR/validation-host.mjs" "$ACTION" "$@"
    ;;
esac
exec node "$SCRIPT_DIR/service.mjs" "$ACTION" "$@"
