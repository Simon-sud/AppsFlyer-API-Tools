# AppsFlyer RAWDATA Workbench

一体化数据工作台：账户配置、原始数据查询、Dashboard、AutoPipe 调度、Dispatch 令牌、行业 Benchmark、App 下载估算（App Estimator）、应用发现（Apps Finder）及内置 AI 助手 Gochat。

部署不依赖 Git，将项目目录拷贝/rsync 到服务器即可。

---

## 功能模块

| 路由 | 模块 | 后端 |
|------|------|------|
| `/` | Appsflyer Query | Flask `:5000` |
| `/dashboard` | Dashboard | Go `:5001` |
| `/autopipe` | AutoPipe | Go `:5001` |
| `/dispatch-access` | Dispatch Access | Flask + Go |
| `/benchmark` | Benchmark Explorer | Go `:5001` |
| `/app-estimator` | App Estimator | Go `:5001`（OpenClaw SQLite） |
| `/apps` | Apps Finder | Scraper `:3001`（可选） |
| `/account` | Account | Flask `:5000` |
| `/docs` | 产品文档 | 静态页 |
| 顶栏抽屉 | Gochat | Go `:5002` |

Gochat 为全局侧栏助手（无独立路由），启用时需 PostgreSQL 存储会话。

---

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | React 19、TypeScript、CRA、Tailwind、D3、Recharts |
| 主 API | Python Flask — **5000** |
| 任务 / 分析 API | Go `autopipe_runner`（tag: `autopipe`）— **5001** |
| AI 对话 | Go `ai_chat_service`（tag: `!autopipe`）— **5002** |
| 商店抓取 | Node Scraper-backend — **3001**（可选） |
| 主库 | MySQL 8+ |
| 对话库 | PostgreSQL 15+（Gochat） |
| 入口 | Nginx → `frontend/build` + 反向代理 |

---

## 端口

| 端口 | 服务 |
|------|------|
| `80` / `443` | Nginx |
| `3000` | 前端开发服（仅本地） |
| `3001` | Scraper |
| `5000` | Flask |
| `5001` | AutoPipe Runner（Dashboard / AutoPipe / Benchmark / App Estimator） |
| `5002` | Gochat |

---

## 目录结构

```text
├── frontend/
│   ├── src/pages/
│   ├── src/lib/appEstimator/
│   ├── build/              # npm run build 产出
│   └── Scraper-backend/
├── backend/
│   ├── app.py / auth.py
│   ├── autopipe_runner.go
│   ├── app_estimator*.go
│   ├── ai_chat_service.go
│   ├── scripts/            # Estimator 流水线脚本
│   ├── database/
│   ├── systemd/
│   ├── start_services_optimized.sh
│   └── restart_backend.sh
├── nginx_server.conf
├── scripts/update_nginx.sh
├── start.sh
├── DEPLOY.md
├── ENVIRONMENT.md
└── README.md
```

---

## 本地开发

**依赖**：Node 18+、Python 3.9+、Go 1.21+、MySQL 8+；（Gochat）PostgreSQL 15+

```bash
# 安装依赖
cd frontend && npm install
cd ../backend && python3 -m venv venv && source venv/bin/activate && pip install -r requirements.txt
go mod download

# 一键启动（检查 DB、拉起后端 + 前端）
cd .. && bash start.sh
```

**分服务启动**：

```bash
cd frontend && npm start
cd backend && source venv/bin/activate && python app.py
go build -tags autopipe -o autopipe_runner . && AUTOPIPE_PORT=:5001 ./autopipe_runner
go build -tags '!autopipe' -o ai_chat_service . && AI_CHAT_PORT=:5002 ./ai_chat_service
```

**健康检查**：

```bash
curl -s http://127.0.0.1:5000/health
curl -s http://127.0.0.1:5001/health
curl -s http://127.0.0.1:5001/api/app-estimator/health
curl -s http://127.0.0.1:5002/api/health
```

---

## 环境变量（摘要）

生产环境统一使用 **`/etc/appsflyer/backend.env`**（见 `backend/systemd/README.md`）。

| 变量 | 用途 |
|------|------|
| `JWT_SECRET_KEY` | Flask / Go5001 / Go5002 共用 |
| `DB_*` | MySQL |
| `PG_*` | PostgreSQL（Gochat） |
| `MIIMO_*` | Gochat 上游（可选） |
| `APP_ESTIMATOR_*` | Estimator SQLite 路径与内置流水线 |
| `CORS_ORIGIN` / `CORS_ORIGINS` | 生产跨域来源 |
| `REDIS_ADDR` | Benchmark 缓存（可选） |

配置模板见 **[ENVIRONMENT.md](./ENVIRONMENT.md)**（本地 vs 服务器完整说明）及 `backend/.env.example`。

---

## 生产部署

完整步骤见 **[DEPLOY.md](./DEPLOY.md)**。

```bash
sudo bash backend/init_db_server.sh --env-file /etc/appsflyer/backend.env --with-pg
cd frontend && npm ci && npm run build
cd backend && sudo bash restart_backend.sh
sudo bash scripts/update_nginx.sh
```

产品说明见应用内 **`/docs`**。
