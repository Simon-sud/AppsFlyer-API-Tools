#!/usr/bin/env bash
# Sync nginx_server.conf from the repo to the server path and reload Nginx.
# Run from project root or scripts/: ./scripts/update_nginx.sh
# Tip: edit nginx_server.conf locally, SSH to the server, then run this script.

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SRC="$PROJECT_ROOT/nginx_server.conf"
DEST="/etc/nginx/sites-available/appsflyer"

if [[ ! -f "$SRC" ]]; then
  echo "错误: 未找到 $SRC"
  exit 1
fi

echo "同步: $SRC -> $DEST"
sudo cp "$SRC" "$DEST"
echo "检查 Nginx 配置..."
sudo nginx -t
echo "重载 Nginx..."
sudo systemctl reload nginx
echo "完成。"
