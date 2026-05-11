#!/usr/bin/env bash
# Run `next dev` with a memory watchdog.
# - Caps V8 heap at HEAP_MB (hard limit inside Node).
# - Polls total RSS (server + descendants) every POLL_SEC and kills the tree
#   if it exceeds THRESHOLD_MB. The watchdog runs in its own background
#   process so it can still act if the Next.js tree stalls the shell.
# - Detaches from the terminal; dev output goes to dev.log.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/.."

THRESHOLD_MB="${DEV_SAFE_MB:-2500}"
HEAP_MB="${DEV_SAFE_HEAP_MB:-2048}"
POLL_SEC="${DEV_SAFE_POLL:-1}"
PID_FILE=".dev-pid"
WATCHDOG_PID_FILE=".dev-watchdog-pid"
LOG_FILE="dev.log"

if [[ -f "$PID_FILE" ]] && kill -0 "$(cat "$PID_FILE" 2>/dev/null || echo 0)" 2>/dev/null; then
  echo "dev-safe: already running (PID $(cat "$PID_FILE")). Stop with scripts/dev-stop.sh" >&2
  exit 1
fi
rm -f "$PID_FILE" "$WATCHDOG_PID_FILE"

ulimit -n 10240 2>/dev/null || true

: > "$LOG_FILE"
NODE_OPTIONS="--max-old-space-size=$HEAP_MB" \
  nohup ./node_modules/.bin/next dev >> "$LOG_FILE" 2>&1 &
DEV_PID=$!
echo "$DEV_PID" > "$PID_FILE"
disown "$DEV_PID" 2>/dev/null || true

(
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

  while kill -0 "$DEV_PID" 2>/dev/null; do
    tree_pids=$(collect_tree "$DEV_PID")
    total_kb=0
    for p in $tree_pids; do
      rss=$(ps -o rss= -p "$p" 2>/dev/null | tr -d ' ')
      [[ -n "$rss" ]] && total_kb=$((total_kb + rss))
    done
    total_mb=$((total_kb / 1024))
    echo "[watchdog $(date '+%H:%M:%S')] RSS=${total_mb}MB limit=${THRESHOLD_MB}MB pids=$(echo "$tree_pids" | tr '\n' ' ')" >> "$LOG_FILE"
    if (( total_mb > THRESHOLD_MB )); then
      echo "[watchdog] RSS ${total_mb}MB exceeded ${THRESHOLD_MB}MB — terminating dev tree" >> "$LOG_FILE"
      for p in $tree_pids; do kill -TERM "$p" 2>/dev/null || true; done
      sleep 5
      still=$(collect_tree "$DEV_PID" 2>/dev/null || true)
      for p in $still; do kill -KILL "$p" 2>/dev/null || true; done
      break
    fi
    sleep "$POLL_SEC"
  done

  rm -f "$PID_FILE" "$WATCHDOG_PID_FILE"
) >> "$LOG_FILE" 2>&1 &
WATCHDOG_PID=$!
echo "$WATCHDOG_PID" > "$WATCHDOG_PID_FILE"
disown "$WATCHDOG_PID" 2>/dev/null || true

cat <<EOF
next dev started.
  Dev PID:    $DEV_PID
  Watchdog:   $WATCHDOG_PID
  Heap cap:   ${HEAP_MB} MB  (V8 --max-old-space-size)
  RSS cap:    ${THRESHOLD_MB} MB  (watchdog kills above this)
  Poll:       every ${POLL_SEC}s
  Log:        tail -f docs-lens-next/$LOG_FILE
  Stop:       scripts/dev-stop.sh
  Override:   DEV_SAFE_MB=2500 scripts/dev-safe.sh
EOF
