#!/bin/bash

echo "开始按顺序更新服务..."

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

# 检查是否以root用户运行
if [ "$EUID" -ne 0 ]; then 
    echo -e "${RED}请使用root权限运行此脚本${NC}"
    exit 1
fi

# 1. 更新数据库
update_database() {
    info "=== 步骤1: 更新数据库 ==="
    
    # 备份当前数据库
    info "备份当前数据库..."
    backup_file="/backup/db_backup_$(date +%Y%m%d_%H%M%S).sql"
    mkdir -p /backup
    mysqldump -u root -p"5452831Rpg.." appsflyer_rawdata > "$backup_file"
    info "数据库备份完成: $backup_file"
    
    # 应用新的数据库结构
    info "应用新的数据库结构..."
    cd /opt/AppsFlyer_RAWDATA_WEB2_Update
    
    # 执行数据库初始化脚本
    if [ -f "init_db.sh" ]; then
        chmod +x init_db.sh
        ./init_db.sh
        info "数据库结构更新完成"
    else
        error "找不到 init_db.sh 文件"
    fi
    
    # 验证数据库连接
    info "验证数据库连接..."
    if mysql -u root -p"5452831Rpg.." -e "USE appsflyer_rawdata; SELECT 1;" > /dev/null 2>&1; then
        info "数据库连接正常"
    else
        error "数据库连接失败"
    fi
}

# 2. 更新后端
update_backend() {
    info "=== 步骤2: 更新后端 ==="
    
    # 停止后端服务
    info "停止后端服务..."
    systemctl stop appsflyer-backend 2>/dev/null || true
    
    # 更新后端代码
    info "更新后端代码..."
    cd /opt/AppsFlyer_RAWDATA_WEB2_Update/backend
    
    # 激活虚拟环境
    source venv/bin/activate
    
    # 检查并更新依赖
    info "检查Python依赖..."
    pip3 install -r requirements.txt
    
    # 重启后端服务
    info "重启后端服务..."
    systemctl daemon-reload
    systemctl restart appsflyer-backend
    
    # 等待服务启动
    info "等待后端服务启动..."
    sleep 5
    
    # 检查后端服务状态
    if systemctl is-active --quiet appsflyer-backend; then
        info "后端服务启动成功"
    else
        error "后端服务启动失败"
    fi
    
    # 检查后端健康状态
    info "检查后端API健康状态..."
    if curl -f http://localhost:5000/api/health > /dev/null 2>&1; then
        info "后端API健康检查通过"
    else
        warn "后端API健康检查失败，但服务可能仍在启动中"
    fi
}

# 3. 更新前端
update_frontend() {
    info "=== 步骤3: 更新前端 ==="
    
    # 更新前端代码
    info "更新前端代码..."
    cd /opt/AppsFlyer_RAWDATA_WEB2_Update/frontend
    
    # 安装依赖
    info "安装前端依赖..."
    npm install
    
    # 重新构建前端
    info "重新构建前端应用..."
    npm run build
    
    # 重启Nginx
    info "重启Nginx服务..."
    systemctl restart nginx
    
    # 检查Nginx状态
    if systemctl is-active --quiet nginx; then
        info "Nginx服务启动成功"
    else
        error "Nginx服务启动失败"
    fi
    
    # 检查前端访问
    info "检查前端访问..."
    if curl -f http://localhost:80 > /dev/null 2>&1; then
        info "前端访问正常"
    else
        warn "前端访问检查失败"
    fi
}

# 主函数
main() {
    info "开始按顺序更新 AppsFlyer RAWDATA WEB2 服务..."
    
    # 执行更新步骤
    update_database
    update_backend
    update_frontend
    
    info "=== 更新完成 ==="
    info "前端访问地址: http://8.222.149.42"
    info "后端 API 地址: http://8.222.149.42/api"
    
    # 显示服务状态
    echo ""
    echo "=== 服务状态 ==="
    systemctl status appsflyer-backend --no-pager -l
    echo ""
    systemctl status nginx --no-pager -l
}

# 执行主函数
main 