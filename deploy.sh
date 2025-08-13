#!/bin/bash

echo "开始部署流程..."

# 设置颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# 输出带颜色的信息
info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1"
    exit 1
}

# 检查并更新 Python
check_and_update_python() {
    info "检查 Python 版本..."
    
    # 检查是否已安装 Python 3.10
    if ! command -v python3.10 &> /dev/null; then
        warn "Python 3.10 未安装，正在安装..."
        
        # 添加 deadsnakes PPA
        add-apt-repository -y ppa:deadsnakes/ppa
        apt-get update
        
        # 安装 Python 3.10
        apt-get install -y python3.10 python3.10-venv python3.10-dev
        
        # 安装 pip
        curl -sS https://bootstrap.pypa.io/get-pip.py | python3.10
        
        # 创建软链接
        ln -sf /usr/bin/python3.10 /usr/bin/python3
        ln -sf /usr/bin/python3.10 /usr/bin/python
        
        info "Python 3.10 安装完成"
    else
        info "Python 3.10 已安装"
    fi
    
    # 验证 Python 版本
    python3 --version
}

# 检查命令是否存在
check_command() {
    if ! command -v $1 &> /dev/null; then
        error "命令 '$1' 未找到，请先安装"
    fi
}

# 检查并创建目录
check_and_create_dir() {
    if [ ! -d "$1" ]; then
        info "创建目录: $1"
        mkdir -p "$1"
    fi
}

# 检查并设置目录权限
set_dir_permissions() {
    info "设置目录权限: $1"
    chown -R root:root "$1"
    chmod -R 755 "$1"
}

# 检查并清理旧的 Nginx 配置
cleanup_nginx_config() {
    info "清理旧的 Nginx 配置..."
    if [ -f "/etc/nginx/sites-enabled/default" ]; then
        rm -f "/etc/nginx/sites-enabled/default"
    fi
    if [ -f "/etc/nginx/sites-enabled/appsflyer" ]; then
        rm -f "/etc/nginx/sites-enabled/appsflyer"
    fi
}

# 检查是否以root用户运行
if [ "$EUID" -ne 0 ]; then 
    echo -e "${RED}请使用root权限运行此脚本${NC}"
    exit 1
fi

# 更新系统包
echo -e "${YELLOW}正在更新系统包...${NC}"
apt-get update && apt-get upgrade -y

# 安装必要的系统依赖
echo -e "${YELLOW}正在安装系统依赖...${NC}"
apt-get install -y python3-pip python3-venv nginx mysql-server

# 配置MySQL
echo -e "${YELLOW}正在配置MySQL...${NC}"
mysql -e "ALTER USER 'root'@'localhost' IDENTIFIED BY '5452831Rpg..';"
mysql -e "CREATE USER IF NOT EXISTS 'root'@'127.0.0.1' IDENTIFIED BY '5452831Rpg..';"
mysql -e "GRANT ALL PRIVILEGES ON *.* TO 'root'@'127.0.0.1' WITH GRANT OPTION;"
mysql -e "CREATE DATABASE IF NOT EXISTS appsflyer_rawdata;"
mysql -e "FLUSH PRIVILEGES;"

# 添加系统检查
echo -e "${YELLOW}检查系统要求...${NC}"
# 检查内存
total_mem=$(free -m | awk '/^Mem:/{print $2}')
if [ $total_mem -lt 2048 ]; then
    echo -e "${RED}警告：系统内存小于2GB，可能影响性能${NC}"
fi

# 检查磁盘空间
free_space=$(df -m / | awk 'NR==2 {print $4}')
if [ $free_space -lt 10240 ]; then
    echo -e "${RED}警告：磁盘空间小于10GB，请确保有足够空间${NC}"
fi

# 检查Python版本
python_version=$(python3 --version 2>&1 | awk '{print $2}')
if [[ $(echo "$python_version 3.8" | awk '{print ($1 < $2)}') -eq 1 ]]; then
    echo -e "${RED}警告：Python版本低于3.8，建议升级${NC}"
fi

# 主部署流程
main() {
    info "开始部署 AppsFlyer RAWDATA WEB2..."

    # 检查必要的命令
    check_command python3
    check_command pip3
    check_command node
    check_command npm
    check_command nginx

    # 创建必要的目录
    check_and_create_dir "/opt/AppsFlyer_RAWDATA_WEB2_Update"
    check_and_create_dir "/var/log/appsflyer"
    check_and_create_dir "/var/www/html"

    # 设置目录权限
    set_dir_permissions "/opt/AppsFlyer_RAWDATA_WEB2_Update"
    set_dir_permissions "/var/log/appsflyer"
    set_dir_permissions "/var/www/html"

    # 部署后端
    info "部署后端服务..."
    cd /opt/AppsFlyer_RAWDATA_WEB2_Update/backend

    # 创建并激活虚拟环境
    info "创建 Python 虚拟环境..."
    python3 -m venv venv
    source venv/bin/activate

    # 安装依赖
    info "安装 Python 依赖..."
    pip3 install -r requirements.txt
    pip3 install gunicorn

    # 设置环境变量
    info "设置后端环境变量..."
    source set_env.sh

    # 创建 systemd 服务
    info "配置后端服务..."
    cat > /etc/systemd/system/appsflyer-backend.service << EOF
[Unit]
Description=AppsFlyer RAWDATA WEB2 Backend Service
After=network.target

[Service]
User=root
WorkingDirectory=/opt/AppsFlyer_RAWDATA_WEB2_Update/backend
Environment="PATH=/opt/AppsFlyer_RAWDATA_WEB2_Update/backend/venv/bin"
Environment="FLASK_ENV=production"
Environment="FLASK_DEBUG=0"
ExecStart=/opt/AppsFlyer_RAWDATA_WEB2_Update/backend/venv/bin/gunicorn -w 4 -b 127.0.0.1:5000 app:app
Restart=always

[Install]
WantedBy=multi-user.target
EOF

    # 重新加载 systemd 配置
    systemctl daemon-reload
    systemctl enable appsflyer-backend
    systemctl restart appsflyer-backend

    # 部署前端
    info "部署前端服务..."
    cd /opt/AppsFlyer_RAWDATA_WEB2_Update/frontend

    # 安装依赖
    info "安装 Node.js 依赖..."
    npm install

    # 构建前端
    info "构建前端应用..."
    npm run build

    # 配置 Nginx
    info "配置 Nginx..."
    cleanup_nginx_config

    # 创建 Nginx 配置
    cat > /etc/nginx/sites-available/appsflyer << EOF
server {
    listen 80;
    server_name 8.222.149.42;

    # 前端文件
    root /opt/AppsFlyer_RAWDATA_WEB2_Update/frontend/build;
    index index.html;

    # 日志配置
    access_log /var/log/appsflyer/access.log;
    error_log /var/log/appsflyer/error.log;

    # 前端路由
    location / {
        try_files \$uri \$uri/ /index.html;
    }

    # 后端 API
    location /api {
        proxy_pass http://127.0.0.1:5000;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF

    # 启用 Nginx 配置
    ln -sf /etc/nginx/sites-available/appsflyer /etc/nginx/sites-enabled/
nginx -t && systemctl restart nginx

    # 初始化数据库
    info "初始化数据库..."
    cd /opt/AppsFlyer_RAWDATA_WEB2_Update
    ./init_db.sh

    info "部署完成！"
    info "前端访问地址: http://8.222.149.42"
    info "后端 API 地址: http://8.222.149.42/api"
}

# 执行主函数
main

# 显示部署后的注意事项
echo "
部署后注意事项：
1. 请确保阿里云安全组已开放以下端口：
   - 80 (HTTP)
   - 443 (HTTPS，如果配置了SSL)
   - 5000 (后端API)
   - 3306 (数据库)

2. 建议配置域名和SSL证书：
   - 在阿里云控制台添加域名解析
   - 申请SSL证书并配置到Nginx

3. 数据库安全：
   - 修改默认数据库密码
   - 限制数据库远程访问

4. 定期维护：
   - 设置数据库自动备份
   - 监控服务器资源使用情况
   - 定期更新系统和依赖包
" 

# 添加备份功能
backup_database() {
    echo -e "${YELLOW}备份数据库...${NC}"
    backup_dir="/backup/$(date +%Y%m%d_%H%M%S)"
    mkdir -p $backup_dir
    mysqldump -u root -p"5452831Rpg.." appsflyer_rawdata > "$backup_dir/database_backup.sql"
    echo -e "${GREEN}数据库备份完成：$backup_dir/database_backup.sql${NC}"
}

# 添加日志配置
echo -e "${YELLOW}配置日志...${NC}"
mkdir -p /var/log/appsflyer
touch /var/log/appsflyer/backend.log
touch /var/log/appsflyer/nginx.log
chmod 755 /var/log/appsflyer 

# 添加安全配置
echo -e "${YELLOW}配置安全设置...${NC}"
# 配置防火墙
if command -v ufw &> /dev/null; then
    ufw allow 80/tcp
    ufw allow 443/tcp
    ufw allow 5000/tcp
fi

# 配置SELinux（如果存在）
if command -v sestatus &> /dev/null; then
    setsebool -P httpd_can_network_connect 1
fi 

# 添加错误处理
set -e
trap 'echo -e "${RED}部署过程中出现错误，正在回滚...${NC}"; rollback' ERR

rollback() {
    # 停止服务
    systemctl stop appsflyer-backend
    systemctl stop nginx
    
    # 恢复数据库备份
    if [ -f "$backup_dir/database_backup.sql" ]; then
        mysql -u root -p"5452831Rpg.." appsflyer_rawdata < "$backup_dir/database_backup.sql"
    fi
    
    echo -e "${RED}回滚完成${NC}"
    exit 1
}

# 添加部署后检查
check_deployment() {
    echo -e "${YELLOW}检查部署状态...${NC}"
    
    # 检查服务状态
    systemctl is-active --quiet appsflyer-backend
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}后端服务运行正常${NC}"
    else
        echo -e "${RED}后端服务未正常运行${NC}"
    fi
    
    # 检查数据库连接
    mysql -u root -p"5452831Rpg.." -e "SELECT 1" > /dev/null 2>&1
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}数据库连接正常${NC}"
    else
        echo -e "${RED}数据库连接失败${NC}"
    fi
    
    # 检查Nginx配置
    nginx -t
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}Nginx配置正常${NC}"
    else
        echo -e "${RED}Nginx配置有误${NC}"
    fi
}

cleanup() {
    echo -e "${YELLOW}清理临时文件...${NC}"
    # 清理临时文件
    rm -rf /tmp/appsflyer_*
    
    # 清理30天前的日志文件
    find /var/log/appsflyer -type f -name "*.log" -mtime +30 -delete
} 