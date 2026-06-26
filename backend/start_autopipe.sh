#!/usr/bin/env bash
# Start AutoPipe (5001) standalone; independent of Scraper/Python startup order
# Usage: cd backend && bash start_autopipe.sh

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

export PATH="/usr/local/go/bin:$PATH"

if [ -f /etc/appsflyer/backend.env ]; then
  if [ -r /etc/appsflyer/backend.env ]; then
    set -a
    # shellcheck disable=SC1091
    source /etc/appsflyer/backend.env
    set +a
  else
    echo "[WARN] Cannot read /etc/appsflyer/backend.env (Permission denied)."
    echo "[WARN] Use: sudo bash start_autopipe.sh   OR   ask admin: sudo chmod 640 /etc/appsflyer/backend.env && sudo chgrp ubuntu /etc/appsflyer/backend.env"
  fi
fi

BINARY="$SCRIPT_DIR/autopipe_runner"
if [ ! -x "$BINARY" ]; then
  echo "[ERROR] autopipe_runner 不存在，请先运行: bash restart_backend.sh"
  exit 1
fi

pkill -f "$BINARY" 2>/dev/null || true
sleep 1

export AUTOPIPE_PORT="${AUTOPIPE_PORT:-:5001}"
export APP_ESTIMATOR_DB_PATH="${APP_ESTIMATOR_DB_PATH:-}"
export APP_ESTIMATOR_SKILL_ROOT="${APP_ESTIMATOR_SKILL_ROOT:-}"
export APP_ESTIMATOR_PIPELINE_ENABLED="${APP_ESTIMATOR_PIPELINE_ENABLED:-true}"
export APP_ESTIMATOR_PIPELINE_INTERVAL_SEC="${APP_ESTIMATOR_PIPELINE_INTERVAL_SEC:-300}"
export APP_ESTIMATOR_SCRIPTS_DIR="${APP_ESTIMATOR_SCRIPTS_DIR:-$SCRIPT_DIR/scripts}"
export JWT_SECRET_KEY="${JWT_SECRET_KEY:-change-me-in-production}"
export DB_HOST="${DB_HOST:-127.0.0.1}"
export DB_USER="${DB_USER:-root}"
export DB_PASSWORD="${DB_PASSWORD:-}"
export DB_NAME="${DB_NAME:-appsflyer_rawdata}"

echo "[INFO] Starting autopipe_runner on $AUTOPIPE_PORT ..."
nohup "$BINARY" >>/tmp/go_runner.log 2>&1 &
GPID=$!
echo "$GPID" >/tmp/go_runner.pid

for i in $(seq 1 60); do
  if curl -sf "http://127.0.0.1${AUTOPIPE_PORT#:}/health" >/dev/null; then
    echo "[OK] AutoPipe healthy (PID $GPID)"
    curl -s "http://127.0.0.1${AUTOPIPE_PORT#:}/api/app-estimator/health" | head -c 200
    echo
    exit 0
  fi
  if ! ps -p "$GPID" >/dev/null 2>&1; then
    echo "[ERROR] Process exited. Log:"
    tail -40 /tmp/go_runner.log
    exit 1
  fi
  sleep 1
done

echo "[ERROR] Health check timeout. Log:"
tail -40 /tmp/go_runner.log
exit 1
