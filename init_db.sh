#!/bin/bash
#脚本执行
# 1. 给脚本添加执行权限：chmod +x init_db.sh

# 2. 本地环境初始化：sudo ./init_db.sh -l

# 3. 生产环境初始化：sudo ./init_db.sh -p
# 显示帮助信息：./init_db.sh -h
# 设置颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# 显示帮助信息
show_help() {
    echo -e "${YELLOW}数据库初始化脚本${NC}"
    echo "用法: $0 [选项]"
    echo "选项:"
    echo "  -l, --local     本地环境初始化"
    echo "  -p, --prod      生产环境初始化"
    echo "  -h, --help      显示帮助信息"
    echo
    echo "示例:"
    echo "  $0 -l    # 本地环境初始化"
    echo "  $0 -p    # 生产环境初始化"
}

# 检查是否以root用户运行
check_root() {
    if [ "$EUID" -ne 0 ]; then 
        echo -e "${RED}请使用root权限运行此脚本${NC}"
        exit 1
    fi
}

# 本地环境初始化
init_local() {
    echo -e "${YELLOW}开始本地环境数据库初始化...${NC}"
    
    # 设置环境变量
    export IS_LOCAL="true"
    export DB_HOST="localhost"
    export DB_USER="root"
    export DB_PASSWORD="5452831Rpg.."
    export DB_NAME="appsflyer_rawdata"
    
    # 重新创建数据库
    echo -e "${YELLOW}重新创建数据库...${NC}"
    mysql -u root -p"5452831Rpg.." << EOF
DROP DATABASE IF EXISTS appsflyer_rawdata;
CREATE DATABASE appsflyer_rawdata;
USE appsflyer_rawdata;
EOF
    
    # 应用数据库初始化文件
    echo -e "${YELLOW}应用数据库初始化文件...${NC}"
    mysql -u root -p"5452831Rpg.." appsflyer_rawdata < backend/init_db.sql
    
    # 验证数据库结构
    echo -e "${YELLOW}验证数据库结构...${NC}"
    mysql -u root -p"5452831Rpg.." << EOF
USE appsflyer_rawdata;
SHOW TABLES;
EOF
    
    echo -e "${GREEN}本地环境数据库初始化完成！${NC}"
}

# 生产环境初始化
init_prod() {
    echo -e "${YELLOW}开始生产环境数据库初始化...${NC}"
    
    # 设置环境变量
    export IS_LOCAL="false"
    export DB_HOST="127.0.0.1"
    export DB_USER="root"
    export DB_PASSWORD="5452831Rpg.."
    export DB_NAME="appsflyer_rawdata"
    
    # 重新创建数据库
    echo -e "${YELLOW}重新创建数据库...${NC}"
    mysql -u root -p"5452831Rpg.." << EOF
DROP DATABASE IF EXISTS appsflyer_rawdata;
CREATE DATABASE appsflyer_rawdata;
USE appsflyer_rawdata;
EOF
    
    # 应用数据库初始化文件
    echo -e "${YELLOW}应用数据库初始化文件...${NC}"
    mysql -u root -p"5452831Rpg.." appsflyer_rawdata < backend/init_db.sql
    
    # 验证数据库结构
    echo -e "${YELLOW}验证数据库结构...${NC}"
    mysql -u root -p"5452831Rpg.." << EOF
USE appsflyer_rawdata;
SHOW TABLES;
EOF
    
    echo -e "${GREEN}生产环境数据库初始化完成！${NC}"
}

# 主函数
main() {
    # 检查参数
    if [ $# -eq 0 ]; then
        show_help
        exit 1
    fi
    
    # 解析参数
    case "$1" in
        -l|--local)
            check_root
            init_local
            ;;
        -p|--prod)
            check_root
            init_prod
            ;;
        -h|--help)
            show_help
            ;;
        *)
            echo -e "${RED}无效的选项: $1${NC}"
            show_help
            exit 1
            ;;
    esac
}

# 执行主函数
main "$@" 