#!/bin/bash

# PostgreSQL init script — reusable
# macOS one-shot setup on any machine

set -e

# ==================== PostgreSQL config ====================
# Override via env vars, e.g. PG_PASSWORD="your_password" ./init_postgresql.sh
PG_VERSION="${PG_VERSION:-15}"
PG_USER="${PG_USER:-postgres}"
PG_PASSWORD="${PG_PASSWORD:-postgres}"
PG_DB="${PG_DB:-gochat_db}"
PG_HOST="${PG_HOST:-127.0.0.1}"
PG_PORT="${PG_PORT:-5432}"
# ==================== end config ====================

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "============================================================"
echo "PostgreSQL 初始化脚本"
echo "============================================================"
echo ""
echo "配置信息:"
echo "  PostgreSQL 版本: ${PG_VERSION}"
echo "  数据库用户: ${PG_USER}"
echo "  数据库名称: ${PG_DB}"
echo "  主机地址: ${PG_HOST}:${PG_PORT}"
echo ""

# Step 1: check/install Homebrew
echo "[1/6] 检查 Homebrew..."
if ! command -v brew &> /dev/null; then
    echo -e "${YELLOW}未找到 Homebrew，正在安装...${NC}"
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
    
    # Add Homebrew to PATH (Apple Silicon and Intel)
    if [[ -f "/opt/homebrew/bin/brew" ]]; then
        echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> ~/.zshrc
        eval "$(/opt/homebrew/bin/brew shellenv)"
    elif [[ -f "/usr/local/bin/brew" ]]; then
        echo 'eval "$(/usr/local/bin/brew shellenv)"' >> ~/.zshrc
        eval "$(/usr/local/bin/brew shellenv)"
    fi
    echo -e "${GREEN}✓ Homebrew 安装完成${NC}"
else
    echo -e "${GREEN}✓ Homebrew 已安装${NC}"
fi
echo ""

# Step 2: install PostgreSQL
echo "[2/6] 检查并安装 PostgreSQL@${PG_VERSION}..."
if ! brew list postgresql@${PG_VERSION} &> /dev/null; then
    echo "正在安装 PostgreSQL@${PG_VERSION}..."
    brew install postgresql@${PG_VERSION}
    echo -e "${GREEN}✓ PostgreSQL@${PG_VERSION} 安装完成${NC}"
else
    echo -e "${GREEN}✓ PostgreSQL@${PG_VERSION} 已安装${NC}"
fi
echo ""

# Step 3: start PostgreSQL service
echo "[3/6] 启动 PostgreSQL 服务..."
# Start or restart if already running
if brew services list | grep -q "postgresql@${PG_VERSION}.*started"; then
    echo "  服务已在运行，跳过启动"
else
    brew services start postgresql@${PG_VERSION} 2>/dev/null || brew services restart postgresql@${PG_VERSION}
    echo "  等待服务启动..."
    sleep 5
fi
echo -e "${GREEN}✓ PostgreSQL 服务已启动${NC}"
echo ""

# Step 4: configure PATH and wait for readiness
echo "[4/6] 配置环境..."
# Add PostgreSQL to PATH (Apple Silicon and Intel)
if [[ -d "/opt/homebrew/opt/postgresql@${PG_VERSION}/bin" ]]; then
    export PATH="/opt/homebrew/opt/postgresql@${PG_VERSION}/bin:$PATH"
elif [[ -d "/usr/local/opt/postgresql@${PG_VERSION}/bin" ]]; then
    export PATH="/usr/local/opt/postgresql@${PG_VERSION}/bin:$PATH"
fi

# Wait until service is ready
echo "  等待服务就绪..."
for i in {1..10}; do
    if psql -d postgres -c "SELECT 1;" &> /dev/null; then
        break
    fi
    sleep 1
done
echo -e "${GREEN}✓ 环境配置完成${NC}"
echo ""

# Step 5: configure user and database
echo "[5/6] 配置数据库..."
CURRENT_USER=$(whoami)

# Create or update postgres user
if [ "$CURRENT_USER" != "$PG_USER" ]; then
    echo "  配置 postgres 用户..."
    # Create user or update password if exists
    psql -d postgres -c "CREATE USER ${PG_USER} WITH SUPERUSER PASSWORD '${PG_PASSWORD}';" 2>/dev/null || \
    psql -d postgres -c "ALTER USER ${PG_USER} WITH SUPERUSER PASSWORD '${PG_PASSWORD}';" 2>/dev/null || \
    psql -d postgres -c "ALTER USER ${PG_USER} WITH PASSWORD '${PG_PASSWORD}';" 2>/dev/null || true
    echo -e "  ${GREEN}✓ postgres 用户已配置${NC}"
fi

# Create database if missing
DB_EXISTS=$(PGPASSWORD=${PG_PASSWORD} psql -U ${PG_USER} -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='${PG_DB}';" 2>/dev/null || \
           psql -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='${PG_DB}';" 2>/dev/null || echo "0")

if [ "$DB_EXISTS" != "1" ]; then
    echo "  创建数据库 ${PG_DB}..."
    PGPASSWORD=${PG_PASSWORD} psql -U ${PG_USER} -d postgres -c "CREATE DATABASE ${PG_DB};" 2>/dev/null || \
    psql -d postgres -c "CREATE DATABASE ${PG_DB};" 2>/dev/null
    echo -e "  ${GREEN}✓ 数据库 ${PG_DB} 已创建${NC}"
else
    echo -e "  ${GREEN}✓ 数据库 ${PG_DB} 已存在${NC}"
fi

# Initialize schema
SCHEMA_FILE="${SCRIPT_DIR}/database/gochat_schema.sql"
SCHEMA_ERROR=0
if [ -f "$SCHEMA_FILE" ]; then
    echo "  初始化表结构..."
    PGPASSWORD=${PG_PASSWORD} psql -U ${PG_USER} -d ${PG_DB} -f "$SCHEMA_FILE" 2>/dev/null || \
    psql -d ${PG_DB} -f "$SCHEMA_FILE" 2>/dev/null || true
    echo -e "  ${GREEN}✓ 表结构已初始化${NC}"
else
    echo -e "  ${RED}✗ 未找到 schema 文件: $SCHEMA_FILE${NC}"
    echo "  请确保 database/gochat_schema.sql 文件存在"
    SCHEMA_ERROR=1
fi
echo ""

# Step 6: verify deployment
echo "[6/6] 校验部署..."
ERRORS=0
WARNINGS=0
if [ $SCHEMA_ERROR -eq 1 ]; then
    WARNINGS=$((WARNINGS + 1))
fi

# Check 1: service status
if brew services list | grep -q "postgresql@${PG_VERSION}.*started"; then
    echo -e "  ${GREEN}✓ 服务运行正常${NC}"
else
    echo -e "  ${RED}✗ 服务未运行${NC}"
    ERRORS=$((ERRORS + 1))
fi

# Check 2: database connection
if PGPASSWORD=${PG_PASSWORD} psql -U ${PG_USER} -h ${PG_HOST} -p ${PG_PORT} -d ${PG_DB} -c "SELECT 1;" &> /dev/null; then
    echo -e "  ${GREEN}✓ 数据库连接成功 (使用 postgres 用户)${NC}"
elif psql -d ${PG_DB} -c "SELECT 1;" &> /dev/null; then
    echo -e "  ${GREEN}✓ 数据库连接成功 (使用当前用户)${NC}"
else
    echo -e "  ${RED}✗ 数据库连接失败${NC}"
    ERRORS=$((ERRORS + 1))
fi

# Check 3: required tables
TABLE_COUNT=$(PGPASSWORD=${PG_PASSWORD} psql -U ${PG_USER} -d ${PG_DB} -tAc "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('conversations', 'chat_messages');" 2>/dev/null || \
             psql -d ${PG_DB} -tAc "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('conversations', 'chat_messages');" 2>/dev/null || echo "0")
if [ "$TABLE_COUNT" -ge "2" ]; then
    echo -e "  ${GREEN}✓ 数据表已创建 (${TABLE_COUNT}/2)${NC}"
elif [ "$TABLE_COUNT" -eq "1" ]; then
    echo -e "  ${YELLOW}⚠ 部分表已创建 (${TABLE_COUNT}/2)${NC}"
    WARNINGS=$((WARNINGS + 1))
else
    echo -e "  ${YELLOW}⚠ 数据表未创建${NC}"
    WARNINGS=$((WARNINGS + 1))
fi

# Check 4: port listening
if lsof -i :${PG_PORT} 2>/dev/null | grep -q LISTEN; then
    echo -e "  ${GREEN}✓ 端口 ${PG_PORT} 正在监听${NC}"
else
    echo -e "  ${RED}✗ 端口 ${PG_PORT} 未监听${NC}"
    ERRORS=$((ERRORS + 1))
fi

echo ""
echo "============================================================"

# Print result
if [ $ERRORS -eq 0 ]; then
    if [ $WARNINGS -gt 0 ]; then
        echo -e "${YELLOW}⚠ PostgreSQL 部署完成，但有 ${WARNINGS} 个警告${NC}"
    else
        echo -e "${GREEN}✓ PostgreSQL 部署成功！${NC}"
    fi
    echo "============================================================"
    echo ""
    echo -e "${BLUE}数据库配置信息:${NC}"
    echo "  主机: ${PG_HOST}:${PG_PORT}"
    echo "  用户: ${PG_USER}"
    echo "  密码: ${PG_PASSWORD}"
    echo "  数据库: ${PG_DB}"
    echo ""
    echo -e "${BLUE}常用命令:${NC}"
    echo "  启动服务: brew services start postgresql@${PG_VERSION}"
    echo "  停止服务: brew services stop postgresql@${PG_VERSION}"
    echo "  重启服务: brew services restart postgresql@${PG_VERSION}"
    echo "  连接数据库: psql -U ${PG_USER} -d ${PG_DB}"
    echo "  查看服务状态: brew services list"
    echo ""
    exit 0
else
    echo -e "${RED}✗ 部署校验失败，发现 ${ERRORS} 个错误${NC}"
    if [ $WARNINGS -gt 0 ]; then
        echo -e "${YELLOW}  还有 ${WARNINGS} 个警告${NC}"
    fi
    echo "============================================================"
    echo ""
    echo "请检查上述错误信息并重试"
    exit 1
fi

