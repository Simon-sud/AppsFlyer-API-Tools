#!/bin/bash
#
# Cloud DB init (schema only; does not install/start MySQL or PostgreSQL)
# Prerequisites:
#   1. MySQL running; DB_HOST/DB_USER/DB_PASSWORD/DB_NAME configured (below)
#   2. For AI Chat (GoChat): PostgreSQL running; PG_* configured
#
# Usage:
#   cd backend && bash init_db_server.sh                    # read backend/.env
#   cd backend && bash init_db_server.sh --env-file /etc/appsflyer/backend.env  # systemd env file (recommended; secrets off-repo)
#   cd backend && bash init_db_server.sh --with-pg           # also init PostgreSQL (GoChat)
#   cd backend && bash init_db_server.sh --migrations       # then run migrations (upgrade existing DB)
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Parse args: --env-file [path], --with-pg, --migrations
ENV_FILE=""
WITH_PG=false
RUN_MIGRATIONS=false
while [ $# -gt 0 ]; do
    case "$1" in
        --env-file=*) ENV_FILE="${1#*=}"; shift ;;
        --env-file)   ENV_FILE="${2:-}"; shift 2 ;;
        --with-pg)    WITH_PG=true; shift ;;
        --migrations) RUN_MIGRATIONS=true; shift ;;
        *) shift ;;
    esac
done

# Load env: --env-file first, else backend/.env
load_env_from() {
    local f="$1"
    [ ! -f "$f" ] && return 1
    set -a
    while IFS= read -r line || [ -n "$line" ]; do
        line="${line%$'\r'}"
        [[ "$line" =~ ^[[:space:]]*# ]] && continue
        [[ -z "${line//[[:space:]]}" ]] && continue
        [[ "$line" =~ ^[A-Za-z_][A-Za-z0-9_]*= ]] && export "$line"
    done < "$f"
    set +a
    return 0
}

if [ -n "$ENV_FILE" ]; then
    if [ ! -f "$ENV_FILE" ]; then
        echo -e "${RED}错误：指定的环境文件不存在: $ENV_FILE${NC}"
        echo "  请先创建并填写 DB_HOST、DB_USER、DB_PASSWORD、DB_NAME 等，例如："
        echo "  sudo mkdir -p /etc/appsflyer"
        echo "  sudo nano /etc/appsflyer/backend.env"
        echo "  sudo chmod 600 /etc/appsflyer/backend.env"
        exit 1
    fi
    load_env_from "$ENV_FILE" || true
elif [ -f .env ]; then
    load_env_from .env || true
else
    echo -e "${RED}错误：未找到环境变量文件。${NC}"
    echo "  方式一（推荐，密钥不落项目）：使用 systemd 共用环境文件"
    echo "    sudo mkdir -p /etc/appsflyer"
    echo "    sudo nano /etc/appsflyer/backend.env   # 填写 DB_HOST、DB_USER、DB_PASSWORD、DB_NAME 等"
    echo "    sudo chmod 600 /etc/appsflyer/backend.env"
    echo "    cd $(pwd) && sudo bash init_db_server.sh --env-file /etc/appsflyer/backend.env"
    echo "  方式二：在项目内创建 backend/.env 后执行 bash init_db_server.sh"
    exit 1
fi

# MySQL config (matches .env or env vars)
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-3306}"
DB_USER="${DB_USER:-root}"
DB_PASSWORD="${DB_PASSWORD:-}"
DB_NAME="${DB_NAME:-appsflyer_rawdata}"

# PostgreSQL config (only with --with-pg)
PG_HOST="${PG_HOST:-127.0.0.1}"
PG_PORT="${PG_PORT:-5432}"
PG_USER="${PG_USER:-postgres}"
PG_PASSWORD="${PG_PASSWORD:-postgres}"
PG_DB="${PG_DB:-gochat_db}"

echo "=============================================="
echo "  云服务器数据库初始化"
echo "=============================================="
echo "  MySQL: ${DB_USER}@${DB_HOST}:${DB_PORT} -> ${DB_NAME}"
echo "  PostgreSQL: $WITH_PG (${PG_USER}@${PG_HOST}:${PG_PORT} -> ${PG_DB})"
echo "  执行 migrations: $RUN_MIGRATIONS"
echo "=============================================="
echo ""

# ---------- MySQL ----------
echo "[1] 创建 MySQL 数据库: ${DB_NAME} ..."
if [ -n "$DB_PASSWORD" ]; then
    MYSQL_CMD="mysql -h ${DB_HOST} -P ${DB_PORT} -u ${DB_USER} -p${DB_PASSWORD}"
else
    MYSQL_CMD="mysql -h ${DB_HOST} -P ${DB_PORT} -u ${DB_USER}"
fi

if ! $MYSQL_CMD -e "SELECT 1;" &>/dev/null; then
    echo -e "${RED}无法连接 MySQL，请检查服务与 backend/.env 配置 (DB_HOST, DB_USER, DB_PASSWORD)。${NC}"
    exit 1
fi

$MYSQL_CMD -e "CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
echo -e "${GREEN}  数据库已存在或已创建${NC}"

SCHEMA_FILE="${SCRIPT_DIR}/database/schema.sql"
if [ ! -f "$SCHEMA_FILE" ]; then
    echo -e "${RED}未找到 schema 文件: $SCHEMA_FILE${NC}"
    exit 1
fi

echo "[2] 导入 MySQL 表结构: database/schema.sql ..."
if [ -n "$DB_PASSWORD" ]; then
    mysql -h "${DB_HOST}" -P "${DB_PORT}" -u "${DB_USER}" -p"${DB_PASSWORD}" "${DB_NAME}" < "$SCHEMA_FILE"
else
    mysql -h "${DB_HOST}" -P "${DB_PORT}" -u "${DB_USER}" "${DB_NAME}" < "$SCHEMA_FILE"
fi
echo -e "${GREEN}  表结构导入完成${NC}"

if [ "$RUN_MIGRATIONS" = true ]; then
    echo "[3] 执行 MySQL 迁移 (migrations/*.sql) ..."
    MIGRATIONS_DIR="${SCRIPT_DIR}/migrations"
    if [ -d "$MIGRATIONS_DIR" ]; then
        for f in "$MIGRATIONS_DIR"/*.sql; do
            [ -f "$f" ] || continue
            echo "  执行: $(basename "$f")"
            if [ -n "$DB_PASSWORD" ]; then
                mysql -h "${DB_HOST}" -P "${DB_PORT}" -u "${DB_USER}" -p"${DB_PASSWORD}" "${DB_NAME}" < "$f" 2>/dev/null || true
            else
                mysql -h "${DB_HOST}" -P "${DB_PORT}" -u "${DB_USER}" "${DB_NAME}" < "$f" 2>/dev/null || true
            fi
        done
        echo -e "${GREEN}  迁移执行完成${NC}"
    else
        echo -e "${YELLOW}  未找到 migrations 目录，跳过${NC}"
    fi
else
    echo "[3] 跳过 migrations（若需升级已有库，请使用: ./init_db_server.sh --migrations）"
fi

# ---------- PostgreSQL (optional) ----------
if [ "$WITH_PG" = true ]; then
    echo ""
    echo "[4] 初始化 PostgreSQL (GoChat): ${PG_DB} ..."
    if ! command -v psql &>/dev/null; then
        echo -e "${YELLOW}未找到 psql，跳过 PostgreSQL 初始化。若需 AI Chat，请安装 PostgreSQL 后重试。${NC}"
    else
        export PGPASSWORD="${PG_PASSWORD}"
        if ! psql -h "${PG_HOST}" -p "${PG_PORT}" -U "${PG_USER}" -d postgres -tAc "SELECT 1;" &>/dev/null; then
            echo -e "${YELLOW}无法连接 PostgreSQL，请检查 PG_HOST/PG_USER/PG_PASSWORD。跳过。${NC}"
        else
            psql -h "${PG_HOST}" -p "${PG_PORT}" -U "${PG_USER}" -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname = '${PG_DB}';" | grep -q 1 || \
                psql -h "${PG_HOST}" -p "${PG_PORT}" -U "${PG_USER}" -d postgres -c "CREATE DATABASE ${PG_DB};"
            PG_SCHEMA="${SCRIPT_DIR}/database/gochat_schema.sql"
            if [ -f "$PG_SCHEMA" ]; then
                psql -h "${PG_HOST}" -p "${PG_PORT}" -U "${PG_USER}" -d "${PG_DB}" -f "$PG_SCHEMA" >/dev/null 2>&1 || true
                echo -e "${GREEN}  GoChat 表结构已导入${NC}"
            else
                echo -e "${YELLOW}  未找到 gochat_schema.sql，跳过${NC}"
            fi
        fi
        unset PGPASSWORD
    fi
fi

echo ""
echo "=============================================="
echo -e "${GREEN}数据库初始化完成。${NC}"
echo "  验证: cd backend && python3 check_db_schema.py"
echo "=============================================="
