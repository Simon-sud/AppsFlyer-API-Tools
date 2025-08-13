# AppsFlyer RawData 项目部署文档

## 目录
1. [系统要求](#系统要求)
2. [部署前准备](#部署前准备)
3. [部署步骤](#部署步骤)
4. [配置说明](#配置说明)
5. [验证部署](#验证部署)
6. [常见问题](#常见问题)
7. [维护指南](#维护指南)

## 系统要求

### 硬件要求
- CPU: 2核或以上
- 内存: 2GB或以上
- 磁盘空间: 10GB或以上

### 软件要求
- 操作系统: Ubuntu 20.04 LTS 或更高版本
- Python: 3.8 或更高版本
- Node.js: 14.x 或更高版本
- MySQL: 8.0 或更高版本
- Nginx: 最新稳定版

## 部署前准备

### 1. 服务器准备
- 确保服务器有公网IP
- 开放必要的端口：
  - 80 (HTTP)
  - 443 (HTTPS，如果配置SSL)
  - 5000 (后端API)
  - 3306 (数据库)

### 2. 域名准备（可选）
- 准备域名
- 配置域名解析到服务器IP
- 申请SSL证书（如果使用HTTPS）

### 3. 代码准备
- 确保代码已提交到版本控制系统
- 准备环境变量配置文件
- 检查依赖包版本

## 部署步骤

### 1. 本地打包
1. 运行打包脚本
```bash
   chmod +x package.sh
   ./package.sh
   ```
   这将生成 `AppsFlyer_RAWDATA_WEB2_Update.tar.gz` 文件

2. 检查打包文件
   - 确认文件大小合理
   - 确认包含所有必要文件

### 2. 上传到服务器
1. 使用 scp 上传
   ```bash
   scp AppsFlyer_RAWDATA_WEB2_Update.tar.gz root@8.222.149.42:/root/
   ```

2. 或使用其他文件传输工具
   - 阿里云控制台上传
   - FTP 工具上传

### 3. 服务器部署
1. 解压文件
```bash
   cd /root
   tar -xzf AppsFlyer_RAWDATA_WEB2_Update.tar.gz
   mv appsflyer_temp AppsFlyer_RAWDATA_WEB2_Update
   cd AppsFlyer_RAWDATA_WEB2_Update
   ```

2. 运行部署脚本
```bash
   chmod +x deploy.sh
   sudo bash deploy.sh
   ```

3. 验证部署
   - 检查服务状态
   - 测试API接口
   - 验证前端访问

### 4. 部署后检查
1. 检查服务状态
```bash
   systemctl status nginx
   systemctl status appsflyer-backend
   ```

2. 检查日志
   ```bash
   tail -f /var/log/nginx/error.log
   tail -f /var/log/appsflyer/backend.log
   ```

3. 测试访问
   - 前端：http://8.222.149.42
   - 后端API：http://8.222.149.42/api/health

## 配置说明

### 1. 后端配置
- 环境变量配置 (`backend/set_env.sh`)
  - 数据库连接信息
  - JWT密钥
  - 日志级别
  - 服务器配置

### 2. 前端配置
- 环境变量配置 (`frontend/set_env.sh`)
  - API地址
  - 环境设置
  - 构建配置

### 3. Nginx配置
- 前端静态文件服务
- 后端API代理
- 基本安全配置

### 4. 数据库配置
- 数据库名：appsflyer_rawdata
- 用户名：root
- 密码：5452831Rpg..

## 验证部署

### 1. 服务检查
```bash
# 检查Nginx状态
systemctl status nginx

# 检查后端服务状态
systemctl status appsflyer-backend

# 检查数据库连接
mysql -u root -p
```

### 2. 接口测试
- 测试登录接口：`http://服务器IP/api/login`
- 测试健康检查：`http://服务器IP/api/health`

### 3. 前端访问
- 访问地址：`http://服务器IP`
- 检查页面加载
- 测试功能模块

## 常见问题

### 1. 后端服务无法启动
- 检查Python环境
- 检查环境变量配置
- 查看日志文件

### 2. 前端访问404
- 检查Nginx配置
- 确认静态文件部署
- 验证路由配置

### 3. 数据库连接失败
- 检查数据库服务状态
- 验证连接信息
- 检查防火墙设置

### 4. API路由问题
- 检查Nginx代理配置
- 验证后端路由定义
- 确认请求路径正确

## 维护指南

### 1. 日常维护
- 定期检查日志
- 监控系统资源
- 备份数据库

### 2. 更新部署
- 拉取最新代码
- 更新依赖包
- 重新构建前端
- 重启服务

### 3. 故障处理
- 查看错误日志
- 检查服务状态
- 必要时回滚版本

### 4. 安全维护
- 定期更新系统
- 检查安全漏洞
- 更新SSL证书
- 维护防火墙规则

## 注意事项

1. 部署前请确保：
   - 所有配置文件已正确设置
   - 数据库已备份（如果存在）
   - 服务器资源充足

2. 部署后请检查：
   - 所有服务是否正常运行
   - 日志是否正常记录
   - 功能是否正常使用

3. 定期维护：
   - 每周检查日志
   - 每月备份数据
   - 每季度更新系统

4. 安全建议：
   - 定期更改密码
   - 及时更新系统
   - 限制访问权限
   - 配置防火墙规则 