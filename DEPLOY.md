# 生产部署指南

通过目录拷贝、rsync 或压缩包部署，**服务器上无需 Git**。

下文 **`$PROJ`** 表示项目根目录，例如 `~/AppsFlyer_RAWDATA_WEB2_Update_Develop`。

环境变量（本地 / 服务器）详见 **[ENVIRONMENT.md](./ENVIRONMENT.md)**。

---

## 1. 交付物

```text
$PROJ/
├── frontend/          # npm ci && npm run build → frontend/build
├── backend/
├── nginx_server.conf
├── scripts/update_nginx.sh
├── DEPLOY.md
└── ENVIRONMENT.md
```

勿上传：`node_modules`、`venv`、`__pycache__`。Nginx `root` 必须指向 **`$PROJ/frontend/build`**。

---

## 2. 功能与 API 对照

| 页面路由 | 能力 | 上游 |
|----------|------|------|
| `/` | 原始数据查询 | Flask `:5000` |
| `/dashboard` | 聚合图表 | Go `:5001` `/api/dashboard/` |
| `/autopipe` | 定时任务 | Go `:5001` `/api/autopipe/` |
| `/dispatch-access` | 令牌导入 / Track API | Flask + Go |
| `/benchmark` | AppsFlyer 公开 Benchmark | Go `:5001` `/api/dashboard/benchmark/` |
| `/app-estimator` | 评分 → 下载估算 | Go `:5001` `/api/app-estimator/` |
| `/apps` | 商店应用检索 | Scraper `:3001` |
| `/account` | 账户与团队 | Flask `:5000` |
| Gochat 抽屉 | MiMo 对话 | Go `:5002` |

---

## 3. Nginx 路由

详见 `nginx_server.conf`（更具体的 `location` 在前）。

| 路径前缀 | 端口 | 说明 |
|----------|------|------|
| `/api/dashboard/`、`/api/autopipe/` | 5001 | AutoPipe Runner |
| `/api/app-estimator` | 5001 | App Estimator |
| `/api/conversations`、`/api/chat/` | 5002 | Gochat |
| `/api/appstore/`、`/api/app/`、`/api/apps/` 等 | 3001 | Scraper（可选） |
| `/api/`、`/socket.io/` | 5000 | Flask 兜底 |
| `/` | — | `frontend/build` 静态 SPA |

上线前修改：`server_name`、`root`、CORS（如需要）。

```bash
cd "$PROJ" && sudo bash scripts/update_nginx.sh
```

---

## 4. 环境变量

创建 **`/etc/appsflyer/backend.env`** 并 `chmod 600`：

```env
# 核心
JWT_SECRET_KEY=<强随机密钥>
DB_HOST=127.0.0.1
DB_USER=root
DB_PASSWORD=<mysql密码>
DB_NAME=appsflyer_rawdata
IS_LOCAL=false
FLASK_ENV=production
FLASK_DEBUG=0

# Gochat
PG_HOST=127.0.0.1
PG_PORT=5432
PG_USER=postgres
PG_PASSWORD=<pg密码>
PG_DB=gochat_db

# Gochat 上游（可选，默认见 gochat_config.go）
# MIIMO_API_KEY=
# MIIMO_BASE_URL=

# CORS（生产环境）
# CORS_ORIGIN=https://your.domain.example
# CORS_ORIGINS=https://your.domain.example,http://localhost:3000

# App Estimator（按服务器实际路径修改）
APP_ESTIMATOR_DB_PATH=/opt/openclaw/skills/app-download-estimator/data/app_estimator.db
APP_ESTIMATOR_SKILL_ROOT=/opt/openclaw/skills/app-download-estimator
APP_ESTIMATOR_SCRIPTS_DIR=$PROJ/backend/scripts
APP_ESTIMATOR_PIPELINE_ENABLED=true
APP_ESTIMATOR_PIPELINE_INTERVAL_SEC=300

# Benchmark 缓存（可选）
# REDIS_ADDR=127.0.0.1:6379
```

Flask、`:5001`、`:5002` 必须使用相同 **`JWT_SECRET_KEY`**。细则：`backend/systemd/README.md`。

---

## 5. 部署流程

```bash
export PROJ=~/AppsFlyer_RAWDATA_WEB2_Update_Develop

# 1. 系统依赖：Node 18+、Python 3.9+、Go 1.21+、MySQL、（Gochat）PostgreSQL、Nginx

# 2. Python 虚拟环境
cd "$PROJ/backend"
python3 -m venv venv && source venv/bin/activate && pip install -r requirements.txt

# 3. 数据库（首次）
sudo bash init_db_server.sh --env-file /etc/appsflyer/backend.env --with-pg
python3 check_db_schema.py

# 4. 前端构建
cd "$PROJ/frontend" && npm ci && npm run build

# 5. systemd + 编译 Go
cd "$PROJ/backend"
sudo cp systemd/*.service /etc/systemd/system/   # 按需改 User / WorkingDirectory
sudo systemctl daemon-reload
sudo systemctl enable appsflyer-backend appsflyer-ai-chat
sudo bash restart_backend.sh

# 6. Nginx
cd "$PROJ" && sudo bash scripts/update_nginx.sh
```

### 代码更新后重启

```bash
cd "$PROJ/backend" && sudo bash restart_backend.sh
```

脚本会编译 `autopipe_runner`、`ai_chat_service`，重启两个 systemd 单元，并等待 `:5001/health`（含 `/api/app-estimator/health` 探测）。

`:5001` 仍异常时：

```bash
sudo bash start_autopipe.sh && tail -80 /tmp/go_runner.log
```

---

## 6. 进程模型

| systemd 单元 | 内容 | 端口 |
|--------------|------|------|
| `appsflyer-backend` | `start_services_optimized.sh` | 5001 → 3001 → 5000 |
| `appsflyer-ai-chat` | `ai_chat_service` | 5002 |

**`start_services_optimized.sh` 启动顺序（已更新）：**

1. **Go `:5001` 优先** — Dashboard / AutoPipe / Benchmark / App Estimator  
2. Scraper `:3001` — 失败仅告警，不阻断后续服务  
3. Flask `:5000` — 失败则脚本退出  

日志：`journalctl -u appsflyer-backend -f` · Go 详情：`/tmp/go_runner.log`

无 Scraper 时：Apps Finder 不可用，其余模块正常。可手动起三端口：

```bash
nohup ./venv/bin/python app.py >> /tmp/python_backend.log 2>&1 &
nohup env AUTOPIPE_PORT=:5001 ./autopipe_runner >> /tmp/go_runner.log 2>&1 &
nohup env AI_CHAT_PORT=:5002 ./ai_chat_service >> /tmp/ai_chat.log 2>&1 &
```

生产环境建议使用 systemd，而非 `nohup`。

---

## 7. App Estimator

- 数据：只读 SQLite（`APP_ESTIMATOR_DB_PATH`），由 OpenClaw skill / 脚本写入。  
- 内置流水线（`APP_ESTIMATOR_PIPELINE_ENABLED=true`）：采集 → Velocity → K 校准 → 批量估算。  
- 状态：`GET /api/app-estimator/pipeline`  
- 部署前确认 skill 目录与 DB 文件在服务器上存在。

---

## 8. 健康检查

```bash
curl -sf http://127.0.0.1:5000/health
curl -sf http://127.0.0.1:5001/health
curl -sf http://127.0.0.1:5001/api/app-estimator/health
curl -sf http://127.0.0.1:5002/api/health
curl -sf http://127.0.0.1:3001/health    # 启用 Scraper 时
```

经 Nginx：登录、Dashboard、App Estimator Overview、Gochat 收发。

---

## 9. 上线检查清单

| # | 项 |
|---|-----|
| 1 | `$PROJ`、Nginx `root`、systemd `WorkingDirectory` 一致 |
| 2 | `frontend/build` 已生成 |
| 3 | `backend.env` 已配置；`JWT_SECRET_KEY` 三端一致 |
| 4 | `check_db_schema.py` 通过；（Gochat）PostgreSQL 正常 |
| 5 | `:5000` / `:5001` / `:5002` 健康检查通过 |
| 6 | Estimator SQLite 路径有效（若启用） |
| 7 | Scraper `:3001` 正常（仅 Apps Finder 需要） |
| 8 | SMTP 已配置（若开启注册邮件验证） |

---

## 10. 常见问题

| 现象 | 排查 |
|------|------|
| Dashboard / AutoPipe 502 | `curl :5001/health` · `tail /tmp/go_runner.log` · `restart_backend.sh` |
| App Estimator 无数据 | `APP_ESTIMATOR_DB_PATH` · pipeline API · 手动跑 `batch_estimate_downloads.py` |
| Gochat 失败 | `:5002` 健康 · PostgreSQL · `MIIMO_*` |
| Apps Finder 失败 | `:3001` · `Scraper-backend` 依赖 |
| 登录后 API 401 | Flask 与 Go 的 `JWT_SECRET_KEY` 不一致 |

数据库：`backend/database/README.md` · 邮件：`backend/systemd/README.md` §4。
