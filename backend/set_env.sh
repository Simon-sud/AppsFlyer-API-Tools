#!/bin/bash

# 设置后端环境变量
echo "正在设置后端环境变量..."

# 数据库配置
export DB_HOST="127.0.0.1"
export DB_USER="root"
export DB_PASSWORD="5452831Rpg.."
export DB_NAME="appsflyer_rawdata"

# JWT配置
export JWT_SECRET_KEY="your-secret-key-please-change-in-production"

# Flask配置
export FLASK_ENV="production"
export FLASK_APP="app.py"

# 日志配置
export LOG_LEVEL="INFO"

# 环境标识
export IS_LOCAL="false"

# 服务器配置
export SERVER_HOST="0.0.0.0"
export SERVER_PORT="5000"

# 文件路径配置
export TEMP_DIR="/app/temp"
export LOG_DIR="/app/logs"

# 创建必要的目录
mkdir -p $TEMP_DIR
mkdir -p $LOG_DIR

# 设置目录权限
chmod -R 755 $TEMP_DIR
chmod -R 755 $LOG_DIR

# 显示环境变量设置结果
echo "环境变量设置完成："
echo "数据库主机: $DB_HOST"
echo "数据库用户: $DB_USER"
echo "数据库名称: $DB_NAME"
echo "Flask环境: $FLASK_ENV"
echo "服务器主机: $SERVER_HOST"
echo "服务器端口: $SERVER_PORT"
echo "临时目录: $TEMP_DIR"
echo "日志目录: $LOG_DIR"
echo "环境类型: 生产环境"

# 验证环境变量
echo "正在验证环境变量..."
if [ -z "$DB_HOST" ] || [ -z "$DB_USER" ] || [ -z "$DB_PASSWORD" ] || [ -z "$DB_NAME" ]; then
    echo "错误：数据库配置不完整"
    exit 1
fi

if [ -z "$JWT_SECRET_KEY" ]; then
    echo "错误：JWT密钥未设置"
    exit 1
fi

if [ -z "$FLASK_ENV" ]; then
    echo "错误：Flask环境未设置"
    exit 1
fi

echo "环境变量验证通过" 