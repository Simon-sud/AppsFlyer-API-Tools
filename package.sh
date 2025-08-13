#!/bin/bash

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
}

# 检查必要的文件是否存在
check_required_files() {
    local missing_files=()
    
    # 检查主要文件
    for file in "backend/app.py" "backend/auth.py" "backend/requirements.txt" \
                "frontend/package.json" "frontend/nginx.conf" \
                "deploy.sh" "deploy.md" "init_db.sh"; do
        if [ ! -f "$file" ]; then
            missing_files+=("$file")
        fi
    done
    
    # 检查主要目录
    for dir in "backend" "frontend"; do
        if [ ! -d "$dir" ]; then
            missing_files+=("$dir")
        fi
    done
    
    if [ ${#missing_files[@]} -ne 0 ]; then
        error "以下文件或目录缺失："
        printf '%s\n' "${missing_files[@]}"
        exit 1
    fi
}

# 清理目录中的临时文件
clean_directory() {
    local dir=$1
    info "清理目录: $dir"
    
    # 清理 Python 相关文件
    find "$dir" -type d -name "__pycache__" -exec rm -rf {} +
    find "$dir" -type f -name "*.pyc" -delete
    find "$dir" -type f -name "*.pyo" -delete
    find "$dir" -type f -name "*.pyd" -delete
    find "$dir" -type f -name "*.so" -delete
    find "$dir" -type f -name "*.log" -delete
    
    # 清理 Node.js 相关文件
    find "$dir" -type d -name "node_modules" -exec rm -rf {} +
    find "$dir" -type d -name "dist" -exec rm -rf {} +
    find "$dir" -type d -name ".next" -exec rm -rf {} +
    
    # 清理构建文件
    find "$dir" -type d -name "build" -exec rm -rf {} +
    find "$dir" -type d -name ".build" -exec rm -rf {} +
    
    # 清理系统文件
    find "$dir" -type f -name ".DS_Store" -delete
    find "$dir" -type f -name "Thumbs.db" -delete
    
    # 清理 Git 相关文件
    find "$dir" -type d -name ".git" -exec rm -rf {} +
    find "$dir" -type f -name ".gitignore" -delete
    
    # 清理临时文件
    find "$dir" -type d -name "temp" -exec rm -rf {} +
    find "$dir" -type d -name "tmp" -exec rm -rf {} +
    find "$dir" -type d -name "logs" -exec rm -rf {} +
}

# 主打包流程
main() {
    info "开始打包项目..."
    
    # 检查必要的文件
    check_required_files
    
    # 创建临时目录
    TEMP_DIR="appsflyer_temp"
    rm -rf $TEMP_DIR
    mkdir -p $TEMP_DIR
    
    # 复制项目文件
    info "复制项目文件..."
    cp -r backend $TEMP_DIR/
    cp -r frontend $TEMP_DIR/
    cp deploy.sh $TEMP_DIR/
    cp deploy.md $TEMP_DIR/
    cp init_db.sh $TEMP_DIR/
    
    # 清理临时文件
    info "清理临时文件..."
    clean_directory "$TEMP_DIR"
    
    # 创建打包文件
    info "创建压缩包..."
    tar -czf AppsFlyer_RAWDATA_WEB2_Update.tar.gz $TEMP_DIR
    
    # 清理临时目录
    info "清理临时目录..."
    rm -rf $TEMP_DIR
    
    # 显示打包结果
    info "打包完成！"
    info "打包文件：AppsFlyer_RAWDATA_WEB2_Update.tar.gz"
    info "文件大小：$(du -h AppsFlyer_RAWDATA_WEB2_Update.tar.gz | cut -f1)"
    
    # 显示打包文件列表
    info "打包文件列表："
    tar -tvf AppsFlyer_RAWDATA_WEB2_Update.tar.gz | grep -v "node_modules" | grep -v "__pycache__" | grep -v ".git"
}

# 执行主函数
main 