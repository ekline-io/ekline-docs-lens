#!/usr/bin/env bash
# Stop the dev server started by dev-safe.sh. SIGTERM, wait 5s, then SIGKILL.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/.."

PID_FILE=".dev-pid"
WATCHDOG_PID_FILE=".dev-watchdog-pid"

collect_tree() {
  local pid=$1
  echo "$pid"
  local children
  children=$(pgrep -P "$pid" 2>/dev/null || true)
  local c
  for c in $children; do
    collect_tree "$c"
  done
}

if [[ ! -f "$PID_FILE" ]]; then
  echo "dev-stop: no PID file. Nothing to stop."
  exit 0
fi

DEV_PID=$(cat "$PID_FILE")
if ! kill -0 "$DEV_PID" 2>/dev/null; then
  echo "dev-stop: PID $DEV_PID is not running; cleaning up stale files."
  rm -f "$PID_FILE" "$WATCHDOG_PID_FILE"
  exit 0
fi

tree_pids=$(collect_tree "$DEV_PID")
echo "dev-stop: SIGTERM to: $(echo "$tree_pids" | tr '\n' ' ')"
for p in $tree_pids; do kill -TERM "$p" 2>/dev/null || true; done

for _ in 1 2 3 4 5; do
  if ! kill -0 "$DEV_PID" 2>/dev/null; then break; fi
  sleep 1
done

if kill -0 "$DEV_PID" 2>/dev/null; then
  still=$(collect_tree "$DEV_PID")
  echo "dev-stop: still alive, SIGKILL to: $(echo "$still" | tr '\n' ' ')"
  for p in $still; do kill -KILL "$p" 2>/dev/null || true; done
fi

if [[ -f "$WATCHDOG_PID_FILE" ]]; then
  WD=$(cat "$WATCHDOG_PID_FILE")
  kill -TERM "$WD" 2>/dev/null || true
fi

rm -f "$PID_FILE" "$WATCHDOG_PID_FILE"
echo "dev-stop: stopped."
