#!/bin/bash

# MySQL init script — reusable
# macOS one-shot setup on any machine

set -e

# ==================== MySQL config ====================
# Override via env vars, e.g. DB_PASSWORD="your_password" ./init_mysql.sh
# Password: 8+ chars; upper, lower, digits, symbols recommended
MYSQL_VERSION="${MYSQL_VERSION:-8.0}"
DB_HOST="${DB_HOST:-127.0.0.1}"
DB_PORT="${DB_PORT:-3306}"
DB_USER="${DB_USER:-root}"
DB_PASSWORD="${DB_PASSWORD:-ADNEXUS-Nexus!2026}"
DB_NAME="${DB_NAME:-appsflyer_rawdata}"
# ==================== end config ====================

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "============================================================"
echo "MySQL 初始化脚本"
echo "============================================================"
echo ""
echo "配置信息:"
echo "  MySQL 版本: ${MYSQL_VERSION}"
echo "  数据库用户: ${DB_USER}"
echo "  数据库名称: ${DB_NAME}"
echo "  主机地址: ${DB_HOST}:${DB_PORT}"
echo ""

echo "[1/7] 检查 Homebrew..."
if ! command -v brew &> /dev/null; then
    echo -e "${YELLOW}未找到 Homebrew，正在安装...${NC}"
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
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

echo "[2/7] 检查并安装 MySQL..."
if ! brew list mysql &> /dev/null && ! brew list mysql@${MYSQL_VERSION} &> /dev/null; then
    echo "正在安装 MySQL..."
    if brew search mysql@${MYSQL_VERSION} &> /dev/null; then
        brew install mysql@${MYSQL_VERSION}
    else
        brew install mysql
    fi
    echo -e "${GREEN}✓ MySQL 安装完成${NC}"
else
    echo -e "${GREEN}✓ MySQL 已安装${NC}"
fi
echo ""

echo "[3/7] 启动 MySQL 服务..."
if brew services list | grep -E "mysql|mysql@" | grep -q "started"; then
    echo "  服务已在运行，跳过启动"
else
    if brew services list | grep -q "mysql@${MYSQL_VERSION}"; then
        brew services start mysql@${MYSQL_VERSION} 2>/dev/null || brew services restart mysql@${MYSQL_VERSION}
    else
        brew services start mysql 2>/dev/null || brew services restart mysql
    fi
    echo "  等待服务启动..."
    sleep 5
fi
echo -e "${GREEN}✓ MySQL 服务已启动${NC}"
echo ""

echo "[4/7] 配置环境..."
if [[ -d "/opt/homebrew/opt/mysql@${MYSQL_VERSION}/bin" ]]; then
    export PATH="/opt/homebrew/opt/mysql@${MYSQL_VERSION}/bin:$PATH"
elif [[ -d "/opt/homebrew/opt/mysql/bin" ]]; then
    export PATH="/opt/homebrew/opt/mysql/bin:$PATH"
elif [[ -d "/usr/local/opt/mysql@${MYSQL_VERSION}/bin" ]]; then
    export PATH="/usr/local/opt/mysql@${MYSQL_VERSION}/bin:$PATH"
elif [[ -d "/usr/local/opt/mysql/bin" ]]; then
    export PATH="/usr/local/opt/mysql/bin:$PATH"
fi

echo "  等待服务就绪..."
for i in {1..15}; do
    if mysqladmin ping -h ${DB_HOST} -P ${DB_PORT} -u ${DB_USER} --password=${DB_PASSWORD} &> /dev/null 2>&1 || \
       mysqladmin ping -h ${DB_HOST} -P ${DB_PORT} -u ${DB_USER} &> /dev/null 2>&1; then
        break
    fi
    sleep 1
done
echo -e "${GREEN}✓ 环境配置完成${NC}"
echo ""

echo "[5/7] 配置数据库用户..."
if mysql -h ${DB_HOST} -P ${DB_PORT} -u ${DB_USER} -p${DB_PASSWORD} -e "SELECT 1;" &> /dev/null 2>&1; then
    echo "  使用现有密码连接成功"
elif mysql -h ${DB_HOST} -P ${DB_PORT} -u ${DB_USER} -e "SELECT 1;" &> /dev/null 2>&1; then
    echo "  设置 root 用户密码..."
    mysql -h ${DB_HOST} -P ${DB_PORT} -u ${DB_USER} -e "ALTER USER '${DB_USER}'@'localhost' IDENTIFIED BY '${DB_PASSWORD}';" 2>/dev/null || \
    mysql -h ${DB_HOST} -P ${DB_PORT} -u ${DB_USER} -e "SET PASSWORD FOR '${DB_USER}'@'localhost' = PASSWORD('${DB_PASSWORD}');" 2>/dev/null || true
    echo -e "  ${GREEN}✓ 密码设置完成${NC}"
else
    echo -e "  ${YELLOW}⚠ 无法连接到 MySQL，可能需要手动配置${NC}"
fi
echo ""

echo "[6/7] 创建数据库 ${DB_NAME}..."
DB_EXISTS=$(mysql -h ${DB_HOST} -P ${DB_PORT} -u ${DB_USER} -p${DB_PASSWORD} -e "SHOW DATABASES LIKE '${DB_NAME}';" 2>/dev/null | grep -q "${DB_NAME}" && echo "1" || echo "0")

if [ "$DB_EXISTS" = "1" ]; then
    echo -e "  ${GREEN}✓ 数据库 ${DB_NAME} 已存在${NC}"
else
    echo "  创建数据库 ${DB_NAME}..."
    mysql -h ${DB_HOST} -P ${DB_PORT} -u ${DB_USER} -p${DB_PASSWORD} -e "CREATE DATABASE IF NOT EXISTS ${DB_NAME} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;" 2>/dev/null || \
    mysql -h ${DB_HOST} -P ${DB_PORT} -u ${DB_USER} -e "CREATE DATABASE IF NOT EXISTS ${DB_NAME} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;" 2>/dev/null
    echo -e "  ${GREEN}✓ 数据库 ${DB_NAME} 已创建${NC}"
fi

SCHEMA_FILE="${SCRIPT_DIR}/database/schema.sql"
if [ -f "$SCHEMA_FILE" ]; then
    echo "  初始化表结构..."
    mysql -h ${DB_HOST} -P ${DB_PORT} -u ${DB_USER} -p${DB_PASSWORD} ${DB_NAME} < "$SCHEMA_FILE" 2>/dev/null || \
    mysql -h ${DB_HOST} -P ${DB_PORT} -u ${DB_USER} ${DB_NAME} < "$SCHEMA_FILE" 2>/dev/null || true
    echo -e "  ${GREEN}✓ 表结构已初始化${NC}"
else
    echo -e "  ${YELLOW}⚠ 未找到 schema 文件: $SCHEMA_FILE${NC}"
    if command -v python3 &> /dev/null && [ -f "${SCRIPT_DIR}/database/db.py" ]; then
        cd "$SCRIPT_DIR"
        python3 -c "
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath('.')))
from database.db import init_mysql_tables
if init_mysql_tables():
    print('MySQL表初始化成功')
    sys.exit(0)
else:
    print('MySQL表初始化失败')
    sys.exit(1)
" 2>/dev/null || true
    fi
fi
echo ""

echo "[7/7] 校验部署..."
ERRORS=0
WARNINGS=0

if brew services list | grep -E "mysql|mysql@" | grep -q "started"; then
    echo -e "  ${GREEN}✓ 服务运行正常${NC}"
else
    echo -e "  ${RED}✗ 服务未运行${NC}"
    ERRORS=$((ERRORS + 1))
fi

if mysql -h ${DB_HOST} -P ${DB_PORT} -u ${DB_USER} -p${DB_PASSWORD} -e "USE ${DB_NAME}; SELECT 1;" &> /dev/null 2>&1; then
    echo -e "  ${GREEN}✓ 数据库连接成功${NC}"
elif mysql -h ${DB_HOST} -P ${DB_PORT} -u ${DB_USER} -e "USE ${DB_NAME}; SELECT 1;" &> /dev/null 2>&1; then
    echo -e "  ${GREEN}✓ 数据库连接成功（无密码）${NC}"
else
    echo -e "  ${RED}✗ 数据库连接失败${NC}"
    ERRORS=$((ERRORS + 1))
fi

TABLE_COUNT=$(mysql -h ${DB_HOST} -P ${DB_PORT} -u ${DB_USER} -p${DB_PASSWORD} ${DB_NAME} -e "SHOW TABLES;" 2>/dev/null | wc -l | tr -d ' ' || \
             mysql -h ${DB_HOST} -P ${DB_PORT} -u ${DB_USER} ${DB_NAME} -e "SHOW TABLES;" 2>/dev/null | wc -l | tr -d ' ' || echo "0")
if [ "$TABLE_COUNT" -gt "0" ]; then
    echo -e "  ${GREEN}✓ 数据表已创建 (${TABLE_COUNT} 个表)${NC}"
else
    echo -e "  ${YELLOW}⚠ 数据表未创建${NC}"
    WARNINGS=$((WARNINGS + 1))
fi

if lsof -i :${DB_PORT} 2>/dev/null | grep -q LISTEN; then
    echo -e "  ${GREEN}✓ 端口 ${DB_PORT} 正在监听${NC}"
else
    echo -e "  ${RED}✗ 端口 ${DB_PORT} 未监听${NC}"
    ERRORS=$((ERRORS + 1))
fi

echo ""
echo "============================================================"

if [ $ERRORS -eq 0 ]; then
    if [ $WARNINGS -gt 0 ]; then
        echo -e "${YELLOW}⚠ MySQL 部署完成，但有 ${WARNINGS} 个警告${NC}"
    else
        echo -e "${GREEN}✓ MySQL 部署成功！${NC}"
    fi
    echo "============================================================"
    echo ""
    echo -e "${BLUE}数据库配置信息:${NC}"
    echo "  主机: ${DB_HOST}:${DB_PORT}"
    echo "  用户: ${DB_USER}"
    echo "  密码: ${DB_PASSWORD}"
    echo "  数据库: ${DB_NAME}"
    echo ""
    echo -e "${BLUE}常用命令:${NC}"
    echo "  启动服务: brew services start mysql"
    echo "  停止服务: brew services stop mysql"
    echo "  重启服务: brew services restart mysql"
    echo "  连接数据库: mysql -u ${DB_USER} -p${DB_PASSWORD} ${DB_NAME}"
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

