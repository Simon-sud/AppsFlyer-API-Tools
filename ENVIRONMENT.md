# 环境变量配置说明

本文说明 **本地开发** 与 **服务器生产** 两套环境下，如何配置 AppsFlyer Workbench 的环境变量。

| 环境 | 配置文件位置 | 说明 |
|------|--------------|------|
| **本地开发** | `backend/.env` | 复制 `backend/.env.example` 后修改；勿提交 git |
| **生产服务器** | `/etc/appsflyer/backend.env` | 唯一可信来源；`chmod 600`；由 systemd 注入 |

Flask（`:5000`）、AutoPipe Runner（`:5001`）、Gochat（`:5002`）**必须共用同一个 `JWT_SECRET_KEY`**。

---

## 一、本地开发环境

### 1.1 准备步骤

```bash
# 1. 复制模板
cp backend/.env.example backend/.env

# 2. 编辑 backend/.env（见下方推荐值）

# 3. 初始化数据库（首次）
cd backend
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
bash init_db_server.sh          # 读取 backend/.env
# 若使用 Gochat：
bash init_db_server.sh --with-pg

# 4. 启动（任选其一）
cd .. && bash start.sh          # 一键：检查依赖 + 拉起多服务 + 前端
# 或分终端手动起 5000 / 5001 / 5002 / 3000（见 README）
```

### 1.2 推荐 `backend/.env`（本地）

```env
# --- 运行模式 ---
IS_LOCAL=true
FLASK_ENV=development
FLASK_DEBUG=1
LOG_LEVEL=DEBUG

# --- 鉴权（三端 Go/Python 必须一致）---
JWT_SECRET_KEY=dev-only-change-me

# --- MySQL（按本机实际填写）---
DB_HOST=127.0.0.1
DB_USER=root
DB_PASSWORD=你的本地MySQL密码
DB_NAME=appsflyer_rawdata

# --- PostgreSQL（仅启用 Gochat 时需要）---
PG_HOST=127.0.0.1
PG_PORT=5432
PG_USER=postgres
PG_PASSWORD=你的本地PG密码
PG_DB=gochat_db

# --- CORS（本地一般不用改）---
CORS_ORIGIN_LOCAL=http://localhost:3000
CORS_ORIGINS=http://localhost:3000,http://127.0.0.1:3000

# --- Gochat / MiMo（要用 AI 助手时必填）---
MIIMO_API_KEY=tp-你的密钥
# MIIMO_BASE_URL=https://token-plan-cn.xiaomimimo.com/v1
# MIIMO_MODEL=mimo-v2.5-pro

# --- App Estimator（要用估算页时必填）---
APP_ESTIMATOR_DB_PATH=/你的路径/app_estimator.db
APP_ESTIMATOR_SKILL_ROOT=/你的路径/app-download-estimator
APP_ESTIMATOR_SCRIPTS_DIR=/你的路径/backend/scripts
APP_ESTIMATOR_PIPELINE_ENABLED=true
APP_ESTIMATOR_PIPELINE_INTERVAL_SEC=300

# --- 可选 ---
# REDIS_ADDR=127.0.0.1:6379
# BENCHMARK_OPENCLAW_ROOT=/tmp/benchmark-export
```

### 1.3 本地前端

开发模式（`npm start`）**默认**直连各端口，通常**不需要** `frontend/.env`：

| 服务 | 开发默认地址 |
|------|----------------|
| Flask | `http://localhost:5000` |
| AutoPipe / Dashboard / Estimator | `http://localhost:5001` |
| Gochat | `http://localhost:5002` |
| Scraper | `http://localhost:3001` |

若端口或域名不同，可在 `frontend/.env` 中覆盖：

```env
REACT_APP_API_BASE_URL=http://localhost:5000
REACT_APP_AUTOPIPE_URL=http://localhost:5001
REACT_APP_AI_CHAT_URL=http://localhost:5002
REACT_APP_APPSTORE_API_URL=http://localhost:3001
REACT_APP_GOOGLEPLAY_API_URL=http://localhost:3001
```

### 1.4 本地启动 Go 服务时的环境

`start.sh` / `start_services_optimized.sh` 会读取当前 shell 与 `backend/.env`（Go 进程继承环境）。单独启动示例：

```bash
cd backend
source venv/bin/activate
set -a && source .env && set +a

go build -tags autopipe -o autopipe_runner .
AUTOPIPE_PORT=:5001 ./autopipe_runner

go build -tags '!autopipe' -o ai_chat_service .
AI_CHAT_PORT=:5002 ./ai_chat_service
```

### 1.5 本地功能与变量对照

| 功能 | 最低要求 |
|------|----------|
| 登录 / 查询 / Account | MySQL + `JWT_SECRET_KEY` |
| Dashboard / AutoPipe | 同上 + Go `:5001` 运行 |
| Gochat | 同上 + PostgreSQL + `MIIMO_API_KEY` + Go `:5002` |
| Apps Finder | Scraper `:3001` |
| App Estimator | Go `:5001` + `APP_ESTIMATOR_DB_PATH` 等 |
| Benchmark 缓存加速 | `REDIS_ADDR`（可选） |
| 注册邮件验证码 | `SMTP_*`（未配置时仅打日志，开发可跳过） |

---

## 二、生产服务器环境

### 2.1 准备步骤

```bash
export PROJ=/opt/appsflyer   # 你的项目根目录

# 1. 创建环境文件（仅 root / 运行用户可读）
sudo mkdir -p /etc/appsflyer
sudo nano /etc/appsflyer/backend.env
sudo chmod 600 /etc/appsflyer/backend.env

# 2. 初始化数据库（首次）
cd $PROJ/backend
sudo bash init_db_server.sh --env-file /etc/appsflyer/backend.env --with-pg

# 3. 构建前端
cd $PROJ/frontend && npm ci && npm run build

# 4. 安装 systemd 并启动（见 DEPLOY.md）
sudo cp systemd/*.service /etc/systemd/system/   # 修改 WorkingDirectory 等路径
sudo systemctl daemon-reload
sudo systemctl enable appsflyer-backend appsflyer-ai-chat
sudo bash restart_backend.sh

# 5. Nginx（修改 server_name、root 后）
sudo bash scripts/update_nginx.sh
```

### 2.2 推荐 `/etc/appsflyer/backend.env`（生产）

```env
# --- 运行模式 ---
IS_LOCAL=false
FLASK_ENV=production
FLASK_DEBUG=0
LOG_LEVEL=INFO

# --- 鉴权（强随机，三端一致）---
JWT_SECRET_KEY=请替换为长随机字符串

# --- MySQL ---
DB_HOST=127.0.0.1
DB_USER=root
DB_PASSWORD=请替换
DB_NAME=appsflyer_rawdata

# --- PostgreSQL（Gochat）---
PG_HOST=127.0.0.1
PG_PORT=5432
PG_USER=postgres
PG_PASSWORD=请替换
PG_DB=gochat_db

# --- CORS / 公网访问 ---
CORS_ORIGIN=https://你的域名
CORS_ORIGINS=https://你的域名,https://www.你的域名

# --- Gochat（必填，代码中无默认 Key）---
MIIMO_API_KEY=tp-请替换
# MIIMO_BASE_URL=https://token-plan-cn.xiaomimimo.com/v1
# MIIMO_MODEL=mimo-v2.5-pro

# --- App Estimator ---
APP_ESTIMATOR_DB_PATH=/opt/openclaw/skills/app-download-estimator/data/app_estimator.db
APP_ESTIMATOR_SKILL_ROOT=/opt/openclaw/skills/app-download-estimator
APP_ESTIMATOR_SCRIPTS_DIR=/opt/appsflyer/backend/scripts
APP_ESTIMATOR_PIPELINE_ENABLED=true
APP_ESTIMATOR_PIPELINE_INTERVAL_SEC=300
# APP_ESTIMATOR_PIPELINE_TZ=Asia/Shanghai

# --- 可选：Benchmark Redis 缓存 ---
# REDIS_ADDR=127.0.0.1:6379
# REDIS_PASSWORD=
# REDIS_DB=0

# --- 可选：Benchmark OpenClaw 导出目录 ---
# BENCHMARK_OPENCLAW_ROOT=/var/lib/appsflyer/benchmark-export

# --- 注册邮件（开启 Signup 验证码时）---
# SMTP_HOST=smtp.sendgrid.net
# SMTP_PORT=587
# SMTP_USE_SSL=0
# SMTP_USER=apikey
# SMTP_PASSWORD=SendGrid的API_Key
# SMTP_FROM=noreply@你的域名
```

修改环境后重启：

```bash
sudo systemctl restart appsflyer-backend appsflyer-ai-chat
# 或
cd $PROJ/backend && sudo bash restart_backend.sh
```

### 2.3 生产前端构建

Nginx **同源反代**时（推荐），构建阶段**一般不需要**设置 `REACT_APP_*`，留空即可由相对路径走 Nginx：

```bash
cd frontend
npm ci
npm run build
```

仅当 API 与静态站**不同域**时，在构建前创建 `frontend/.env.production`：

```env
REACT_APP_AUTOPIPE_URL=https://api.example.com
REACT_APP_AI_CHAT_URL=https://chat.example.com
REACT_APP_APPSTORE_API_URL=https://scraper.example.com
REACT_APP_GOOGLEPLAY_API_URL=https://scraper.example.com
```

同时确保 Nginx `server_name`、`root` 指向 `$PROJ/frontend/build`（见 `nginx_server.conf`）。

### 2.4 systemd 如何加载变量

| Unit | 读取方式 |
|------|----------|
| `appsflyer-backend` | `EnvironmentFile=/etc/appsflyer/backend.env` + 启动 `start_services_optimized.sh` |
| `appsflyer-ai-chat` | 同上 + `AI_CHAT_PORT=:5002`（写在 unit 内） |

`appsflyer-backend.service` / `appsflyer-ai-chat.service` 中的 `WorkingDirectory`、`User` 需与服务器实际路径一致。

---

## 三、变量速查表

### 3.1 核心（必填）

| 变量 | 消费方 | 说明 |
|------|--------|------|
| `JWT_SECRET_KEY` | Flask, Go5001, Go5002 | 会话 JWT 签名；**必须三端相同** |
| `DB_HOST` | Flask, Go5001, Go5002 | MySQL 主机 |
| `DB_USER` | 同上 | MySQL 用户 |
| `DB_PASSWORD` | 同上 | MySQL 密码 |
| `DB_NAME` | 同上 | 库名，默认 `appsflyer_rawdata` |

### 3.2 运行模式

| 变量 | 默认 | 说明 |
|------|------|------|
| `IS_LOCAL` | `false` | `true` 时偏本地 CORS / 连接行为 |
| `FLASK_ENV` | — | `development` / `production` |
| `FLASK_DEBUG` | — | 生产务必 `0` |
| `LOG_LEVEL` | `INFO` | Python 日志级别 |

### 3.3 Gochat（PostgreSQL + MiMo）

| 变量 | 消费方 | 说明 |
|------|--------|------|
| `PG_HOST` | Go5002 | PostgreSQL 主机 |
| `PG_PORT` | Go5002 | 默认 `5432` |
| `PG_USER` | Go5002 | 默认 `postgres` |
| `PG_PASSWORD` | Go5002 | 密码 |
| `PG_DB` | Go5002 | 默认 `gochat_db` |
| `MIIMO_API_KEY` | Go5002 | MiMo `tp-` 密钥；**无代码内默认值** |
| `MIIMO_BASE_URL` | Go5002 | 默认小米 Token Plan 国内端点 |
| `MIIMO_MODEL` | Go5002 | 如 `mimo-v2.5-pro` |
| `AI_CHAT_PORT` | Go5002 | 默认 `:5002`（多在 unit 中设置） |

别名（任选其一）：`XIAOMIMIMO_API_KEY`、`MIMO_API_KEY`、`GOCHAT_API_KEY`。

### 3.4 App Estimator

| 变量 | 消费方 | 说明 |
|------|--------|------|
| `APP_ESTIMATOR_DB_PATH` | Go5001 | SQLite 只读库路径 |
| `APP_ESTIMATOR_SKILL_ROOT` | Go5001 | OpenClaw skill 根目录 |
| `APP_ESTIMATOR_SCRIPTS_DIR` | Go5001 | 流水线 Python 脚本目录 |
| `APP_ESTIMATOR_PIPELINE_ENABLED` | Go5001 | `true` / `false` |
| `APP_ESTIMATOR_PIPELINE_INTERVAL_SEC` | Go5001 | 调度间隔（秒），默认 `300` |
| `APP_ESTIMATOR_PIPELINE_TZ` | 脚本 | 默认 `Asia/Shanghai` |
| `APP_ESTIMATOR_PYTHON` | Go5001 | 指定 Python 解释器（可选） |

### 3.5 CORS

| 变量 | 消费方 | 说明 |
|------|--------|------|
| `CORS_ORIGIN` | Flask / auth | 单源；生产设为 `https://域名` |
| `CORS_ORIGINS` | Flask / auth | 逗号分隔多源 |
| `CORS_ORIGIN_LOCAL` | auth | `IS_LOCAL=true` 时使用 |

### 3.6 可选：Redis / Benchmark / SMTP

| 变量 | 说明 |
|------|------|
| `REDIS_ADDR` | 如 `127.0.0.1:6379`；Benchmark 与 Home 缓存 |
| `REDIS_PASSWORD` | Redis 密码 |
| `REDIS_DB` | 默认 `0` |
| `BENCHMARK_OPENCLAW_ROOT` | Benchmark 导出落盘目录 |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASSWORD` / `SMTP_FROM` / `SMTP_USE_SSL` | 注册验证码邮件 |

### 3.7 端口（通常用默认值）

| 变量 | 默认 | 服务 |
|------|------|------|
| `AUTOPIPE_PORT` | `:5001` | AutoPipe Runner |
| `AI_CHAT_PORT` | `:5002` | Gochat |

### 3.8 前端构建时（`REACT_APP_*`）

| 变量 | 何时需要 |
|------|----------|
| `REACT_APP_AUTOPIPE_URL` | 生产且 API 不同源 |
| `REACT_APP_AI_CHAT_URL` | 同上 |
| `REACT_APP_APPSTORE_API_URL` | Scraper 不同源 |
| `REACT_APP_GOOGLEPLAY_API_URL` | 同上 |
| `REACT_APP_API_BASE_URL` | 极少使用；开发见 `api.ts` |

---

## 四、健康检查

配置完成后在服务器上验证：

```bash
curl -sf http://127.0.0.1:5000/health
curl -sf http://127.0.0.1:5001/health
curl -sf http://127.0.0.1:5001/api/app-estimator/health
curl -sf http://127.0.0.1:5002/api/health
```

---

## 五、常见问题

| 现象 | 检查项 |
|------|--------|
| 登录后 Dashboard 401 | `JWT_SECRET_KEY` 是否在 Flask 与 Go 间一致 |
| Gochat 无响应 | `MIIMO_API_KEY`、`PG_*`、`:5002` 是否正常 |
| App Estimator 空 | `APP_ESTIMATOR_DB_PATH` 文件是否存在、pipeline 是否启用 |
| 跨域错误 | 生产 `CORS_ORIGIN` / `CORS_ORIGINS` 与浏览器访问域名一致 |
| 改 env 不生效 | systemd 需 `restart`；确认改的是 `/etc/appsflyer/backend.env` 而非旧 `.env` |

---

## 六、相关文档

- 部署流程：[DEPLOY.md](./DEPLOY.md)
- systemd 与 SMTP：[backend/systemd/README.md](./backend/systemd/README.md)
- 数据库初始化：[backend/database/README.md](./backend/database/README.md)
- 配置模板：[backend/.env.example](./backend/.env.example)
