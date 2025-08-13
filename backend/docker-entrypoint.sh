#!/bin/bash
set -e

echo "Starting backend service..."

# 等待数据库就绪
echo "Waiting for database..."
max_retries=30
retry_count=0

while ! mysql -h"$DB_HOST" -u"$DB_USER" -p"$DB_PASSWORD" -e "SELECT 1" >/dev/null 2>&1; do
    retry_count=$((retry_count+1))
    if [ $retry_count -ge $max_retries ]; then
        echo "Failed to connect to database after $max_retries attempts"
        exit 1
    fi
    echo "Attempt $retry_count: Database not ready yet... waiting"
    sleep 2
done

echo "Database is ready!"

# 检查 Python 环境
echo "Checking Python environment..."
python --version
pip list

# 检查文件权限
echo "Checking file permissions..."
ls -la /app
ls -la /usr/local/bin/docker-entrypoint.sh

# 执行数据库初始化
echo "Initializing database..."
python -c "
from app import init_db, app
with app.app_context():
    init_db(app)
    print('Database initialization completed.')
"

echo "Starting application..."
# 执行传入的命令
exec "$@" 