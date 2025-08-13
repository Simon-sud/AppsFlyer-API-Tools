#!/bin/bash

# 设置前端环境变量
echo "正在设置前端环境变量..."

# API配置
export REACT_APP_API_URL="http://8.222.149.42:5000"  # 替换为你的服务器IP
export REACT_APP_ENV="production"

# 构建配置
export GENERATE_SOURCEMAP=false
export NODE_ENV="production"

# 显示环境变量设置结果
echo "环境变量设置完成："
echo "API URL: $REACT_APP_API_URL"
echo "环境: $REACT_APP_ENV"
echo "Node环境: $NODE_ENV"

# 验证环境变量
echo "正在验证环境变量..."
if [ -z "$REACT_APP_API_URL" ]; then
    echo "错误：API URL未设置"
    exit 1
fi

if [ -z "$REACT_APP_ENV" ]; then
    echo "错误：环境未设置"
    exit 1
fi

echo "环境变量验证通过" 