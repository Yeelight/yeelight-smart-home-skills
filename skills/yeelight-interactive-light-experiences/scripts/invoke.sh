#!/usr/bin/env sh
set -eu

if [ "$#" -gt 1 ]; then
  printf '%s\n' '{"contractVersion":"1.0","status":"error","error":{"code":"service_operation_invalid","message":"Use only start, status, or stop."}}' >&2
  exit 2
fi
action=${1:-start}
case "$action" in
  start|status|stop) ;;
  *)
    printf '%s\n' '{"contractVersion":"1.0","status":"error","error":{"code":"service_operation_invalid","message":"Use only start, status, or stop."}}' >&2
    exit 2
    ;;
esac

exec node "$(dirname "$0")/service.mjs" "$action"
