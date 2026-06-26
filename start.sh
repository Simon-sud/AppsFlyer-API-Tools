#!/bin/bash

# Unified project startup script
# Check deps -> install missing -> check DB -> init DB -> start services

set -e  # Exit on error

# Resolve project root
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$PROJECT_ROOT/backend"
FRONTEND_DIR="$PROJECT_ROOT/frontend"
SCRAPER_DIR="$PROJECT_ROOT/frontend/Scraper-backend"

# ANSI color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m' # No Color

# Logging helpers
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[✓]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[⚠]${NC} $1"
}

log_error() {
    echo -e "${RED}[✗]${NC} $1"
}

log_section() {
    echo ""
    echo -e "${CYAN}========================================${NC}"
    echo -e "${CYAN}$1${NC}"
    echo -e "${CYAN}========================================${NC}"
    echo ""
}

log_step() {
    echo ""
    echo -e "${MAGENTA}→ $1${NC}"
    echo ""
}

# Return true if command is on PATH
command_exists() {
    command -v "$1" &> /dev/null
}

# Return true if port is free
check_port() {
    local port=$1
    if lsof -i :$port > /dev/null 2>&1; then
        return 1
    fi
    return 0
}

# ==================== Step 1: Check system dependencies ====================
check_system_dependencies() {
    log_section "步骤 1/6: 检查系统依赖"
    
    local missing_deps=()
    
    # Homebrew (macOS)
    if [[ "$OSTYPE" == "darwin"* ]]; then
        if ! command_exists brew; then
            log_error "Homebrew 未安装"
            echo "请先安装 Homebrew: /bin/bash -c \"\$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)\""
            exit 1
        fi
        log_success "Homebrew 已安装"
    fi
    
    # Python
    if ! command_exists python3; then
        log_warning "Python3 未安装"
        missing_deps+=("python3")
    else
        log_success "Python3 已安装: $(python3 --version)"
    fi
    
    # Node.js
    if ! command_exists node; then
        log_warning "Node.js 未安装"
        missing_deps+=("node")
    else
        log_success "Node.js 已安装: $(node --version)"
    fi
    
    # npm
    if ! command_exists npm; then
        log_warning "npm 未安装"
        missing_deps+=("npm")
    else
        log_success "npm 已安装: $(npm --version)"
    fi
    
    # Go (optional)
    if ! command_exists go; then
        log_warning "Go 未安装（可选，用于Go后端服务）"
    else
        log_success "Go 已安装: $(go version | awk '{print $3}')"
    fi
    
    # Install missing dependencies
    if [ ${#missing_deps[@]} -gt 0 ]; then
        log_step "安装缺失的系统依赖..."
        if [[ "$OSTYPE" == "darwin"* ]] && command_exists brew; then
            for dep in "${missing_deps[@]}"; do
                log_info "安装 $dep..."
                brew install "$dep"
                log_success "$dep 安装完成"
            done
        else
            log_error "无法自动安装依赖，请手动安装: ${missing_deps[*]}"
            exit 1
        fi
    fi
}

# ==================== Step 2: Check and install databases ====================
check_and_setup_databases() {
    log_section "步骤 2/6: 检查并设置数据库"
    
    # MySQL
    log_step "检查 MySQL..."
    if ! command_exists mysql; then
        log_warning "MySQL 未安装"
        if [[ "$OSTYPE" == "darwin"* ]] && command_exists brew; then
            log_info "安装 MySQL..."
            brew install mysql
            log_success "MySQL 安装完成"
        else
            log_error "无法自动安装 MySQL"
            exit 1
        fi
    else
        log_success "MySQL 已安装: $(mysql --version | head -n1)"
    fi
    
    # Start MySQL service
    if [[ "$OSTYPE" == "darwin"* ]] && command_exists brew; then
        if ! brew services list | grep -q "mysql.*started"; then
            log_info "启动 MySQL 服务..."
            brew services start mysql
            sleep 5
            log_success "MySQL 服务已启动"
        else
            log_success "MySQL 服务正在运行"
        fi
    fi
    
    # PostgreSQL
    log_step "检查 PostgreSQL..."
    if ! command_exists psql; then
        log_warning "PostgreSQL 未安装"
        if [[ "$OSTYPE" == "darwin"* ]] && command_exists brew; then
            log_info "安装 PostgreSQL..."
            brew install postgresql@15
            log_success "PostgreSQL 安装完成"
        else
            log_warning "无法自动安装 PostgreSQL（可选）"
        fi
    else
        log_success "PostgreSQL 已安装: $(psql --version)"
    fi
    
    # Start PostgreSQL service
    if [[ "$OSTYPE" == "darwin"* ]] && command_exists brew && command_exists psql; then
        if ! brew services list | grep -q "postgresql@15.*started"; then
            log_info "启动 PostgreSQL 服务..."
            brew services start postgresql@15
            sleep 3
            log_success "PostgreSQL 服务已启动"
        else
            log_success "PostgreSQL 服务正在运行"
        fi
    fi
}

# ==================== Step 3: Initialize databases ====================
init_databases() {
    log_section "步骤 3/6: 初始化数据库"
    
    cd "$BACKEND_DIR"
    
    # Initialize MySQL database
    log_step "初始化 MySQL 数据库..."
    if [ -f "check_db_schema.py" ]; then
        # Verify schema first
        if python3 check_db_schema.py 2>&1 | grep -q "MySQL 数据库表结构检查通过"; then
            log_success "MySQL 数据库表结构已就绪"
        else
            log_info "MySQL 数据库表结构不符合要求，执行初始化..."
            # Initialize via database/db.py init_all_databases
            if python3 -c "
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath('.')))
from database.db import init_all_databases
if init_all_databases():
    print('MySQL数据库初始化成功')
    sys.exit(0)
else:
    print('MySQL数据库初始化失败')
    sys.exit(1)
" 2>&1; then
                log_success "MySQL 数据库初始化完成"
            else
                log_warning "MySQL 数据库初始化可能有问题，将在应用启动时重试"
            fi
        fi
    else
        log_warning "数据库检查脚本不存在，跳过表结构检查"
    fi
    
    # Initialize PostgreSQL database
    log_step "初始化 PostgreSQL 数据库..."
    if [ -f "check_db_schema.py" ]; then
        # Verify PostgreSQL schema first
        if python3 check_db_schema.py 2>&1 | grep -q "PostgreSQL 数据库表结构检查通过"; then
            log_success "PostgreSQL 数据库表结构已就绪"
        else
            log_info "PostgreSQL 数据库表结构不符合要求，执行初始化..."
            if [ -f "init_postgresql.sh" ]; then
                if bash init_postgresql.sh 2>&1; then
                    log_success "PostgreSQL 数据库初始化完成"
                else
                    log_warning "PostgreSQL 数据库初始化可能有问题（可能已存在）"
                fi
            else
                log_warning "PostgreSQL 初始化脚本不存在，跳过 PostgreSQL 初始化"
            fi
        fi
    else
        log_warning "数据库检查脚本不存在，跳过表结构检查"
    fi
}

# ==================== Step 4: Install project dependencies ====================
install_project_dependencies() {
    log_section "步骤 4/6: 安装项目依赖"
    
    # Python dependencies
    log_step "安装 Python 依赖..."
    cd "$BACKEND_DIR"
    if [ ! -d "venv" ]; then
        log_info "创建 Python 虚拟环境..."
        python3 -m venv venv
        log_success "虚拟环境已创建"
    fi
    
    if [ -f "requirements.txt" ]; then
        log_info "安装 Python 包..."
        "$BACKEND_DIR/venv/bin/pip" install -q -r requirements.txt
        log_success "Python 依赖安装完成"
    fi
    
    # Node.js dependencies (frontend)
    log_step "安装前端依赖..."
    cd "$FRONTEND_DIR"
    if [ ! -d "node_modules" ]; then
        log_info "安装前端 npm 包..."
        npm install --silent
        log_success "前端依赖安装完成"
    else
        log_success "前端依赖已存在"
    fi
    
    # Node.js dependencies (Scraper backend)
    log_step "安装 Scraper 后端依赖..."
    cd "$SCRAPER_DIR"
    if [ ! -d "node_modules" ]; then
        log_info "安装 Scraper 后端 npm 包..."
        npm install --silent
        log_success "Scraper 后端依赖安装完成"
    else
        log_success "Scraper 后端依赖已存在"
    fi
    
    # Go dependencies
    log_step "检查 Go 依赖..."
    cd "$BACKEND_DIR"
    if command_exists go && [ -f "go.mod" ]; then
        log_info "下载 Go 模块..."
        go mod download
        log_success "Go 依赖已就绪"
    fi
}

# ==================== Step 5: Check ports ====================
check_ports() {
    log_section "步骤 5/6: 检查端口占用"
    
    local ports=(3000 3001 5000 5001 5002)
    local port_names=("前端" "Scraper后端" "Python后端" "AutoPipe Go服务" "AI Chat服务")
    local has_conflict=false
    
    for i in "${!ports[@]}"; do
        local port=${ports[$i]}
        local name=${port_names[$i]}
        if ! check_port $port; then
            log_warning "$name 端口 $port 已被占用"
            has_conflict=true
        else
            log_success "$name 端口 $port 可用"
        fi
    done
    
    if [ "$has_conflict" = true ]; then
        log_warning "部分端口被占用，启动时可能会失败"
        read -p "是否继续? (y/n) " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            exit 1
        fi
    fi
}

# ==================== Step 6: Start all services ====================
start_all_services() {
    log_section "步骤 6/6: 启动所有服务"
    
    cd "$PROJECT_ROOT"
    
    # Environment variables
    export JWT_SECRET_KEY="${JWT_SECRET_KEY:-change-me-in-production}"
    export FLASK_ENV=development
    export FLASK_DEBUG=1
    
    log_info "使用启动脚本: $BACKEND_DIR/start_services_optimized.sh"
    
    if [ -f "$BACKEND_DIR/start_services_optimized.sh" ]; then
        # Start backend services (Python + Scraper + Go)
        log_step "启动后端服务..."
        cd "$BACKEND_DIR"
        bash start_services_optimized.sh &
        BACKEND_PID=$!
        log_success "后端服务启动脚本已执行 (PID: $BACKEND_PID)"
        
        # Wait for backend startup
        sleep 5
        
        # Start frontend service
        log_step "启动前端服务..."
        cd "$FRONTEND_DIR"
        if [ -f "package.json" ]; then
            log_info "启动 React 前端 (端口: 3000)..."
            npm start > /tmp/frontend.log 2>&1 &
            FRONTEND_PID=$!
            log_success "前端服务已启动 (PID: $FRONTEND_PID)"
        else
            log_error "前端 package.json 不存在"
        fi
        
        # Print service status
        sleep 3
        log_section "服务启动完成"
        echo ""
        log_success "所有服务已启动！"
        echo ""
        echo "服务访问地址:"
        echo "  🌐 前端:        http://localhost:3000"
        echo "  🔧 Python后端:  http://localhost:5000"
        echo "  📱 Scraper:     http://localhost:3001"
        echo "  ⚙️  AutoPipe:    http://localhost:5001"
        echo "  🤖 AI Chat:     http://localhost:5002"
        echo ""
        echo "日志文件:"
        echo "  前端日志: tail -f /tmp/frontend.log"
        echo "  后端日志: tail -f /tmp/go_runner.log"
        echo ""
        echo "按 Ctrl+C 停止所有服务"
        echo ""
        
        # Block until user interrupt
        wait
    else
        log_error "启动脚本不存在: $BACKEND_DIR/start_services_optimized.sh"
        exit 1
    fi
}

# ==================== Main ====================
main() {
    clear
    echo -e "${CYAN}"
    echo "╔════════════════════════════════════════════════════════╗"
    echo "║                                                        ║"
    echo "║         AppsFlyer RAWDATA 项目启动脚本                ║"
    echo "║                                                        ║"
    echo "╚════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
    echo ""
    
    # Run all steps
    check_system_dependencies
    check_and_setup_databases
    init_databases
    install_project_dependencies
    check_ports
    start_all_services
}

# Signal handlers
trap 'echo ""; log_warning "正在停止所有服务..."; pkill -P $$; exit 0' INT TERM

# Entry point
main "$@"

