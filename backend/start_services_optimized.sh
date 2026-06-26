#!/bin/bash

# Optimized startup: Python + Scraper (App Store + Google Play)
# Avoids duplicate processes and port conflicts
# Usage:
#   ./start_services_optimized.sh          - start all services (incl. Go)
#   ./start_services_optimized.sh --skip-go - Python + Scraper only, skip Go (dev)

set -e  # exit on error

# JWT_SECRET_KEY (default if unset); shared by Flask and Go backends
# Flask default: 'change-me-in-production'
export JWT_SECRET_KEY="${JWT_SECRET_KEY:-change-me-in-production}"

# Parse CLI args
SKIP_GO=false
for arg in "$@"; do
    case $arg in
        --skip-go)
            SKIP_GO=true
            shift
            ;;
    esac
done

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Log helpers
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if port is in use
check_port() {
    local port=$1
    local service_name=$2
    
    if lsof -i :$port > /dev/null 2>&1; then
        log_warning "$service_name 端口 $port 已被占用"
        return 1
    fi
    return 0
}

# Check if process is already running
check_process() {
    local service_name=$1
    local pid_file=$2
    
    if [ -f "$pid_file" ]; then
        local pid=$(cat "$pid_file")
        if ps -p $pid > /dev/null 2>&1; then
            log_warning "$service_name 已在运行 (PID: $pid)"
            return 1
        else
            # Stale PID file — remove
            rm -f "$pid_file"
        fi
    fi
    return 0
}

# Stop service bound to port
stop_port_service() {
    local port=$1
    local service_name=$2
    
    local pids=$(lsof -ti :$port)
    if [ ! -z "$pids" ]; then
        log_info "停止占用端口 $port 的 $service_name 服务..."
        echo $pids | xargs kill -9
        sleep 2
    fi
}

# Check prerequisites
check_requirements() {
    log_info "检查系统要求..."
    
    # Python
    if ! command -v python3 &> /dev/null; then
        log_error "Python3 未安装"
        exit 1
    fi
    
    # Node.js
    if ! command -v node &> /dev/null; then
        log_error "Node.js 未安装"
        exit 1
    fi
    
    # npm
    if ! command -v npm &> /dev/null; then
        log_error "npm 未安装"
        exit 1
    fi
    
    # lsof
    if ! command -v lsof &> /dev/null; then
        log_error "lsof 未安装"
        exit 1
    fi

    # Go (optional; AutoPipe runner)
    if ! command -v go &> /dev/null; then
        # Try user-local Go install
        if [ -x "$HOME/go-install/go/bin/go" ]; then
            export PATH="$HOME/go-install/go/bin:$PATH"
            log_info "检测到用户目录 Go 安装，已临时加入 PATH"
        else
            log_warning "未检测到 Go，将跳过 AutoPipe 任务执行器（Go）启动"
        fi
    fi
    
    log_success "系统要求检查通过"
}

# Script directory
get_script_dir() {
    cd "$(dirname "${BASH_SOURCE[0]}")"
    pwd
}

# Start Scraper backend (App Store + Google Play)
# Server-ready: absolute paths, no nodemon, file logging, longer readiness wait
start_scraper_service() {
    local script_dir=$(get_script_dir)
    local scraper_dir_candidate="$script_dir/../frontend/Scraper-backend"
    local scraper_dir=""
    local pid_file="/tmp/scraper_backend.pid"
    
    # Resolve absolute path (nohup cwd may differ)
    if [ -d "$scraper_dir_candidate" ]; then
        scraper_dir=$(cd "$scraper_dir_candidate" && pwd)
    fi
    if [ -z "$scraper_dir" ] && [ -d "$script_dir/../frontend/Scraper" ]; then
        scraper_dir=$(cd "$script_dir/../frontend/Scraper" && pwd)
    fi
    
    log_info "启动 Scraper 后端服务 (App Store + Google Play)..."
    log_info "Scraper 目录: ${scraper_dir:-未找到}"
    
    # Check if process is already running
    if ! check_process "Scraper" "$pid_file"; then
        return 1
    fi
    
    # Force-stop Node/Scraper processes
    log_info "强制停止所有Scraper相关进程..."
    pkill -f "node.*server.js" 2>/dev/null || true
    pkill -f "npm.*start" 2>/dev/null || true
    pkill -f "node.*Scraper" 2>/dev/null || true
    sleep 2  # wait for processes to exit

    # Check if port is in use
    if ! check_port 3001 "Scraper"; then
        stop_port_service 3001 "Scraper"
    fi
    
    if [ -z "$scraper_dir" ] || [ ! -d "$scraper_dir" ]; then
        log_error "Scraper 后端目录不存在，请确认 frontend/Scraper-backend 或 frontend/Scraper 已上传: $scraper_dir_candidate"
        return 1
    fi
    
    # PATH may lack node under nohup — try common locations
    if ! command -v node &> /dev/null; then
        [ -f "$HOME/.nvm/nvm.sh" ] && . "$HOME/.nvm/nvm.sh"
        export PATH="/usr/local/bin:/usr/bin:$HOME/.nvm/versions/node/$(ls $HOME/.nvm/versions/node 2>/dev/null | head -1)/bin:$PATH"
    fi
    if ! command -v node &> /dev/null; then
        log_error "未找到 node，请先安装 Node.js 或确认 PATH"
        return 1
    fi
    
    # Save cwd
    local current_dir=$(pwd)
    
    # cd to Scraper dir
    cd "$scraper_dir"
    
    # Install deps if missing
    if [ ! -d "node_modules" ]; then
        log_info "安装 Scraper 后端依赖（首次可能较慢）..."
        npm install
        if [ $? -ne 0 ]; then
            log_error "依赖安装失败"
            cd "$current_dir"
            return 1
        fi
        log_success "依赖安装完成"
    fi
    
    # app-store-scraper
    if ! npm list app-store-scraper > /dev/null 2>&1; then
        log_info "安装 app-store-scraper@0.18.0 依赖..."
        npm install app-store-scraper@0.18.0
        if [ $? -ne 0 ]; then
            log_error "app-store-scraper 安装失败"
            cd "$current_dir"
            return 1
        fi
        log_success "app-store-scraper 安装完成"
    fi
    
    # Start via npm run start (no nodemon); log to file for debugging
    log_info "启动 Scraper 服务 (端口: 3001)，日志: /tmp/scraper.log ..."
    nohup npm run start >> /tmp/scraper.log 2>&1 &
    local scraper_pid=$!
    
    # Save PID (nohup shell; node child follows — kept for compatibility)
    echo $scraper_pid > "$pid_file"
    
    cd "$current_dir"
    
    # Wait for readiness (up to 60s on slow first start)
    local timeout=60
    local count=0
    while [ $count -lt $timeout ]; do
        if curl -s http://localhost:3001/health > /dev/null 2>&1; then
            log_success "Scraper 服务启动成功！"
            return 0
        fi
        sleep 1
        count=$((count + 1))
    done
    
    log_warning "Scraper 服务启动超时，请检查 /tmp/scraper.log"
    return 1
}

# Start Python backend
start_python_service() {
    local script_dir=$(get_script_dir)
    local pid_file="/tmp/python_backend.pid"
    
    log_info "启动 Python 后端服务..."
    
    # Check if process is already running
    if ! check_process "Python" "$pid_file"; then
        return 1
    fi
    
    # Force-stop Python processes
    log_info "强制停止所有Python相关进程..."
    pkill -f "python.*app.py" 2>/dev/null || true
    pkill -f "flask.*run" 2>/dev/null || true
    pkill -f "gunicorn.*app" 2>/dev/null || true
    sleep 2  # wait for processes to exit

    # Check if port is in use
    if ! check_port 5000 "Python"; then
        stop_port_service 5000 "Python"
    fi
    
    # Ensure backend directory
    cd "$script_dir"
    
    # Check venv
    if [ ! -d "venv" ]; then
        log_error "虚拟环境不存在，请先创建: python3 -m venv venv"
        return 1
    fi
    
    log_info "使用虚拟环境: $script_dir/venv"
    
    # Install venv deps
    if [ ! -f "requirements.txt" ]; then
        log_warning "未找到 requirements.txt，跳过依赖检查"
    else
        log_info "检查 Python 依赖..."
        "$script_dir/venv/bin/pip" install -q -r requirements.txt
        if [ $? -ne 0 ]; then
            log_error "依赖安装失败"
            return 1
        fi
    fi
    
    # Check app.py exists
    if [ ! -f "app.py" ]; then
        log_error "未找到 app.py 文件，当前目录: $(pwd)"
        return 1
    fi
    
    # Start service
    log_info "启动 Python 后端服务 (端口: 5000)..."
    log_info "当前工作目录: $(pwd)"
    log_info "使用虚拟环境Python: $script_dir/venv/bin/python"
    
    # Limit Flask-SocketIO worker count via env
    export FLASK_ENV=development
    export FLASK_DEBUG=1
    # JWT_SECRET_KEY — match Go backend
    export JWT_SECRET_KEY="${JWT_SECRET_KEY:-change-me-in-production}"
    
    "$script_dir/venv/bin/python" app.py &
    local python_pid=$!
    
    # Save PID
    echo $python_pid > "$pid_file"
    
    # Wait for startup
    log_info "等待 Python 后端服务启动..."
    local timeout=30
    local count=0
    
    while [ $count -lt $timeout ]; do
        if curl -s http://localhost:5000 > /dev/null 2>&1; then
            log_success "Python 后端服务启动成功！"
            return 0
        fi
        sleep 1
        count=$((count + 1))
    done
    
    log_warning "Python 后端服务启动超时"
    return 1
}

# Show service status
show_service_status() {
    echo
    log_info "📊 服务状态:"
    echo "=================================================="
    
    # Scraper status
    if [ -f "/tmp/scraper_backend.pid" ]; then
        local pid=$(cat "/tmp/scraper_backend.pid")
        if ps -p $pid > /dev/null 2>&1; then
            log_success "Scraper 服务运行中 (PID: $pid)"
        else
            log_error "Scraper 服务已停止"
        fi
    else
        log_error "Scraper 服务未启动"
    fi
    
    # Python status
    if [ -f "/tmp/python_backend.pid" ]; then
        local pid=$(cat "/tmp/python_backend.pid")
        if ps -p $pid > /dev/null 2>&1; then
            log_success "Python 后端服务运行中 (PID: $pid)"
        else
            log_error "Python 后端服务已停止"
        fi
    else
        log_error "Python 后端服务未启动"
    fi
    
    # Go status
    if [ -f "/tmp/go_runner.pid" ]; then
        local pid=$(cat "/tmp/go_runner.pid")
        if ps -p $pid > /dev/null 2>&1; then
            log_success "AutoPipe 任务执行器运行中 (PID: $pid)"
            # Vendor mode?
            local script_dir=$(get_script_dir)
            if [ -d "$script_dir/vendor" ]; then
                log_info "  → 依赖模式: Vendor（完全本地化）"
            else
                log_info "  → 依赖模式: Module（标准模式）"
            fi
        else
            log_error "AutoPipe 任务执行器已停止"
        fi
    else
        log_warning "AutoPipe 任务执行器未启动"
    fi
    
    echo "=================================================="
    log_info "🌐 服务访问地址:"
    echo "   Python 后端: http://localhost:5000"
    echo "   Scraper 后端: http://localhost:3001"
    echo "   Scraper 健康检查: http://localhost:3001/health"
    echo "   AutoPipe 任务执行器(Go): http://localhost:5001/health"
    echo "   App Store API: http://localhost:3001/api/appstore/"
    echo "   Google Play API: http://localhost:3001/api/"
    echo "   统一 API: http://localhost:3001/api/unified/"
    echo
    log_info "💡 提示:"
    echo "   - 停止服务: ./stop_services.sh 或 Ctrl+C"
    
    if [ -f "/tmp/go_runner.pid" ]; then
        echo "   - Go 日志: tail -f /tmp/go_runner.log"
    fi
    
    # Vendor / hot-reload hints
    local script_dir=$(get_script_dir)
    if [ "$SKIP_GO" = true ]; then
        echo "   - 启动Go热重载: cd backend && make dev-vendor (或 make dev)"
    elif [ ! -d "$script_dir/vendor" ]; then
        echo "   - 启用本地化依赖: cd backend && make vendor"
    fi
    echo "=================================================="
}

# Cleanup on exit
cleanup() {
    log_info "正在清理..."
    
    # Force-stop all related processes
    log_info "停止所有相关进程..."
    pkill -f "python.*app.py" 2>/dev/null || true
    pkill -f "flask.*run" 2>/dev/null || true
    pkill -f "gunicorn.*app" 2>/dev/null || true
    pkill -f "node.*server.js" 2>/dev/null || true
    pkill -f "npm.*start" 2>/dev/null || true
    pkill -f "autopipe_runner" 2>/dev/null || true
    pkill -f "go.*autopipe" 2>/dev/null || true
    sleep 2  # wait for processes to exit
    
    # Remove temp PID files
    rm -f /tmp/scraper_backend.pid
    rm -f /tmp/python_backend.pid
    rm -f /tmp/go_runner.pid
    
    # Remove Go build artifacts
    local script_dir=$(get_script_dir)
    rm -f "$script_dir/autopipe_runner"
    rm -f "$script_dir/autopipe_runner.exe"
    rm -rf "$script_dir/tmp"  # Go temp build dir
    rm -f "$script_dir/build-errors.log"
    
    # Remove log files
    rm -f /tmp/go_runner.log
    rm -f /tmp/flask.log
    rm -f /tmp/scraper.log
    
    log_success "清理完成"
}

# Start AutoPipe Go runner (vendor-aware)
start_go_runner() {
    local script_dir=$(get_script_dir)
    local pid_file="/tmp/go_runner.pid"
    local binary="$script_dir/autopipe_runner"

    # Prefer /usr/local/go (1.21+); systemd PATH may have stale Go and break vendor/slices build
    if [ -x "/usr/local/go/bin/go" ]; then
        export PATH="/usr/local/go/bin:$PATH"
        log_info "使用 Go: $(/usr/local/go/bin/go version)"
    fi

    # Skip if Go not installed
    if ! command -v go &> /dev/null; then
        log_warning "Go 未安装，跳过 AutoPipe 任务执行器启动"
        return 0
    fi

    log_info "启动 AutoPipe 任务执行器 (Go)..."

    # Check if process is already running
    if ! check_process "Go Runner" "$pid_file"; then
        return 1
    fi

    # Force-stop Go processes
    log_info "强制停止所有Go相关进程..."
    pkill -f "autopipe_runner" 2>/dev/null || true
    pkill -f "go.*autopipe" 2>/dev/null || true
    pkill -f "go run.*autopipe" 2>/dev/null || true
    sleep 2  # wait for processes to exit

    # Check port
    if ! check_port 5001 "Go Runner"; then
        stop_port_service 5001 "Go Runner"
    fi

    cd "$script_dir"

    local use_vendor=false
    local build_cmd="go build"
    if [ -d "vendor" ]; then
        use_vendor=true
        build_cmd="go build -mod=vendor"
    fi

    # Skip rebuild if restart_backend.sh binary is fresh (modernc.org/sqlite compile is slow, OOM-prone)
    local need_rebuild=true
    if [ -x "$binary" ]; then
        need_rebuild=false
        while IFS= read -r -d '' gofile; do
            if [ "$gofile" -nt "$binary" ]; then
                need_rebuild=true
                break
            fi
        done < <(find "$script_dir" -maxdepth 1 -name '*.go' -print0 2>/dev/null)
    fi

    if [ "$need_rebuild" = true ]; then
        if [ "$use_vendor" = true ]; then
            log_info "编译 AutoPipe（Vendor 模式，首次/源码变更后较慢，请耐心等待）..."
        else
            log_info "编译 AutoPipe（Module 模式）..."
        fi
        rm -f "$binary" "$script_dir/autopipe_runner.exe"
        if ! $build_cmd -tags autopipe -ldflags="-s -w" -o autopipe_runner .; then
            log_error "编译失败，查看上方 go 输出"
            return 1
        fi
        log_success "编译成功 ($(du -h "$binary" | cut -f1))"
    else
        log_success "复用已有 autopipe_runner（跳过编译，$(du -h "$binary" | cut -f1)）"
    fi

    # Run compiled binary
    log_info "启动 AutoPipe 任务执行器 (端口: 5001)..."
    AUTOPIPE_PORT=":5001" \
    APP_ESTIMATOR_DB_PATH="${APP_ESTIMATOR_DB_PATH:-}" \
    APP_ESTIMATOR_SKILL_ROOT="${APP_ESTIMATOR_SKILL_ROOT:-}" \
    APP_ESTIMATOR_PIPELINE_ENABLED="${APP_ESTIMATOR_PIPELINE_ENABLED:-true}" \
    APP_ESTIMATOR_PIPELINE_INTERVAL_SEC="${APP_ESTIMATOR_PIPELINE_INTERVAL_SEC:-300}" \
    APP_ESTIMATOR_SCRIPTS_DIR="${APP_ESTIMATOR_SCRIPTS_DIR:-$script_dir/scripts}" \
    DB_HOST="${DB_HOST:-127.0.0.1}" \
    DB_USER="${DB_USER:-root}" \
    DB_PASSWORD="${DB_PASSWORD:-}" \
    DB_NAME="${DB_NAME:-appsflyer_rawdata}" \
    JWT_SECRET_KEY="${JWT_SECRET_KEY:-change-me-in-production}" \
    "$binary" >>/tmp/go_runner.log 2>&1 &
    local go_pid=$!

    echo $go_pid > "$pid_file"

    # Health wait (large sqlite driver may slow first start)
    log_info "等待 AutoPipe 任务执行器启动..."
    local timeout=120
    local count=0
    while [ $count -lt $timeout ]; do
        if curl -s http://localhost:5001/health > /dev/null 2>&1; then
            log_success "AutoPipe 任务执行器启动成功！(PID: $go_pid)"
            return 0
        fi
        if ! ps -p $go_pid > /dev/null 2>&1; then
            log_error "AutoPipe 进程已退出，最近日志:"
            tail -30 /tmp/go_runner.log 2>/dev/null || true
            return 1
        fi
        sleep 1
        count=$((count + 1))
    done
    log_warning "AutoPipe 任务执行器启动超时，最近日志:"
    tail -30 /tmp/go_runner.log 2>/dev/null || true
    return 1
}

# Signal handler
trap cleanup EXIT

# Main
main() {
    if [ "$SKIP_GO" = true ]; then
        log_info "🚀 启动后端服务 (Python + Scraper)，跳过 Go 服务..."
        log_info "💡 Go 服务可单独启动热重载模式"
    else
        log_info "🚀 启动统一后端服务管理器 (Python + Scraper + Go)..."
    fi
    
    # Log JWT_SECRET_KEY config
    log_info "JWT_SECRET_KEY: ${JWT_SECRET_KEY:0:10}... (长度: ${#JWT_SECRET_KEY})"
    
    # Check prerequisites
    check_requirements

    # Start Go first (Dashboard/AutoPipe/App Estimator need :5001; do not wait for Scraper)
    if [ "$SKIP_GO" = true ]; then
        log_info "⏭️  跳过 Go 服务启动（使用 --skip-go 参数）"
    else
        if start_go_runner; then
            log_success "AutoPipe 任务执行器启动完成"
        else
            log_warning "AutoPipe 任务执行器启动失败，Dashboard 可能 502，请: bash start_autopipe.sh"
        fi
    fi

    # Start Scraper backend (App Store + Google Play)
    if start_scraper_service; then
        log_success "Scraper 服务启动完成"
    else
        log_warning "Scraper 服务启动失败（Apps Finder 抓取受影响），继续运行其他服务"
    fi
    
    # Brief pause for stability
    sleep 2
    
    # Start Python backend
    if start_python_service; then
        log_success "Python 后端服务启动完成"
    else
        log_error "Python 后端服务启动失败"
        exit 1
    fi
    
    # Show service status
    show_service_status
    
    # Keep running; monitor services
    log_info "服务监控中... 按 Ctrl+C 停止所有服务"
    
    while true; do
        sleep 5
        
        # Service health checks
        if [ -f "/tmp/scraper_backend.pid" ]; then
            local pid=$(cat "/tmp/scraper_backend.pid")
            if ! ps -p $pid > /dev/null 2>&1; then
                log_warning "Scraper 服务已停止"
                rm -f "/tmp/scraper_backend.pid"
            fi
        fi
        
        if [ -f "/tmp/python_backend.pid" ]; then
            local pid=$(cat "/tmp/python_backend.pid")
            if ! ps -p $pid > /dev/null 2>&1; then
                log_warning "Python 后端服务已停止"
                rm -f "/tmp/python_backend.pid"
            fi
        fi
        
        # Exit when all services stopped
        if [ "$SKIP_GO" = true ]; then
            # --skip-go: check Python and Scraper only
            if [ ! -f "/tmp/scraper_backend.pid" ] && [ ! -f "/tmp/python_backend.pid" ]; then
                log_error "所有服务已停止"
                break
            fi
        else
            # Check all services
            if [ ! -f "/tmp/scraper_backend.pid" ] && [ ! -f "/tmp/python_backend.pid" ] && [ ! -f "/tmp/go_runner.pid" ]; then
                log_error "所有服务已停止"
                break
            fi
        fi
    done
}

# Run main
main "$@"
