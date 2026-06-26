#!/usr/bin/env bash
# Restart: Flask:5000 AutoPipe:5001 Scraper:3001 GoChat:5002
# Usage: cd .../backend && sudo bash restart_backend.sh

set -e

_fix_crlf() {
  local f="$1"
  if [ -f "$f" ] && grep -q $'\r' "$f" 2>/dev/null; then
    echo "[INFO] Removing Windows CRLF from $f ..."
    sed -i 's/\r$//' "$f"
    chmod +x "$f" 2>/dev/null || true
  fi
}

SCRIPT_PATH="${BASH_SOURCE[0]}"
case "$SCRIPT_PATH" in
  /*) ;;
  *) SCRIPT_PATH="$(pwd)/$SCRIPT_PATH" ;;
esac
_fix_crlf "$SCRIPT_PATH"

SCRIPT_DIR="$(cd "$(dirname "$SCRIPT_PATH")" && pwd)"
cd "$SCRIPT_DIR"

CMD_PREFIX=""
[ "$(id -u)" -ne 0 ] && CMD_PREFIX="sudo"

BACKEND_SERVICE="appsflyer-backend"
AI_CHAT_SERVICE="appsflyer-ai-chat"

restart_unit() {
  local name="$1"
  echo "[INFO] Restarting $name ..."
  if $CMD_PREFIX systemctl is-active --quiet "$name" 2>/dev/null; then
    $CMD_PREFIX systemctl restart "$name"
    echo "[OK] $name restarted."
  elif $CMD_PREFIX systemctl list-unit-files "${name}.service" 2>/dev/null | grep -q "${name}.service"; then
    echo "[WARN] $name not active. Starting..."
    $CMD_PREFIX systemctl start "$name" || true
  else
    echo "[WARN] systemd unit $name not installed - skip."
  fi
}

wait_for_autopipe() {
  local i
  echo "[INFO] Waiting for AutoPipe :5001 (up to 180s — Go starts before Scraper now) ..."
  for i in $(seq 1 180); do
    if curl -sf http://127.0.0.1:5001/health >/dev/null 2>&1; then
      echo "[OK] AutoPipe :5001 is healthy (${i}s)"
      curl -s http://127.0.0.1:5001/api/app-estimator/health | head -c 240
      echo
      return 0
    fi
    sleep 1
  done
  echo "[WARN] :5001 still down after 180s. Trying start_autopipe.sh ..."
  if [ -f "$SCRIPT_DIR/start_autopipe.sh" ]; then
    bash "$SCRIPT_DIR/start_autopipe.sh" || true
  fi
  if curl -sf http://127.0.0.1:5001/health >/dev/null 2>&1; then
    echo "[OK] AutoPipe recovered via start_autopipe.sh"
    return 0
  fi
  echo "[ERROR] AutoPipe failed. Last log lines:"
  tail -40 /tmp/go_runner.log 2>/dev/null || true
  return 1
}

export PATH="/usr/local/go/bin:/usr/bin:/bin:${PATH:-}"
# Go 1.22 hosts: auto-download newer toolchain; no-op if already Go 1.25+
export GOTOOLCHAIN="${GOTOOLCHAIN:-auto}"

sync_go_vendor() {
  if [ ! -d vendor ]; then
    echo "[INFO] No vendor/ — using -mod=mod"
    GO_MOD_FLAG="-mod=mod"
    return
  fi
  # SKIP_VENDOR_SYNC=1 skips tidy when vendor is complete and go.mod unchanged (faster restart)
  if [ "${SKIP_VENDOR_SYNC:-}" = "1" ] && [ -f go.sum ]; then
    echo "[INFO] SKIP_VENDOR_SYNC=1 — build with existing vendor/"
    GO_MOD_FLAG="-mod=vendor"
    return
  fi
  echo "[INFO] go mod tidy + vendor ... (Go: $(go version))"
  go mod tidy
  go mod vendor
  GO_MOD_FLAG="-mod=vendor"
  echo "[OK] vendor synced."
}

if command -v go >/dev/null 2>&1; then
  sync_go_vendor

  echo "[INFO] Building ai_chat_service ..."
  go build ${GO_MOD_FLAG} -tags '!autopipe' -o ai_chat_service .
  echo "[OK] ai_chat_service built."

  echo "[INFO] Building autopipe_runner ..."
  go build ${GO_MOD_FLAG} -tags autopipe -ldflags="-s -w" -o autopipe_runner .
  echo "[OK] autopipe_runner built ($(du -h autopipe_runner | cut -f1))."
else
  echo "[WARN] go not in PATH; skip build."
fi

chmod +x start_autopipe.sh 2>/dev/null || true

restart_unit "$BACKEND_SERVICE"
restart_unit "$AI_CHAT_SERVICE"

wait_for_autopipe || true

echo ""
$CMD_PREFIX systemctl status "$BACKEND_SERVICE" --no-pager -l 2>/dev/null | head -12 || true
echo "---"
$CMD_PREFIX systemctl status "$AI_CHAT_SERVICE" --no-pager -l 2>/dev/null | head -12 || true
echo ""
echo "[TIP] curl -s http://127.0.0.1:5001/health"
echo "[TIP] bash start_autopipe.sh   # if 502 persists"
