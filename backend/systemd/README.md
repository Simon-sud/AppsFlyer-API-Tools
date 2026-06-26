# Systemd 服务说明

生产环境使用两个 unit，配置统一由 **`/etc/appsflyer/backend.env`** 注入，密钥不入库。

| Unit | 命令 | 端口 |
|------|------|------|
| `appsflyer-backend` | `start_services_optimized.sh` | 5001 → 3001 → 5000 |
| `appsflyer-ai-chat` | `ai_chat_service` | 5002（Gochat） |

---

## 1. 环境文件

```bash
sudo mkdir -p /etc/appsflyer
sudo nano /etc/appsflyer/backend.env
sudo chmod 600 /etc/appsflyer/backend.env
```

**最低配置：**

```env
JWT_SECRET_KEY=<密钥>
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=<密码>
DB_NAME=appsflyer_rawdata
IS_LOCAL=false
FLASK_ENV=production
FLASK_DEBUG=0
```

**Gochat（PostgreSQL）：**

```env
PG_HOST=127.0.0.1
PG_PORT=5432
PG_USER=postgres
PG_PASSWORD=<密码>
PG_DB=gochat_db
```

**App Estimator（按服务器路径修改）：**

```env
APP_ESTIMATOR_DB_PATH=/opt/openclaw/skills/app-download-estimator/data/app_estimator.db
APP_ESTIMATOR_SKILL_ROOT=/opt/openclaw/skills/app-download-estimator
APP_ESTIMATOR_SCRIPTS_DIR=/opt/appsflyer/backend/scripts
APP_ESTIMATOR_PIPELINE_ENABLED=true
APP_ESTIMATOR_PIPELINE_INTERVAL_SEC=300
```

**Benchmark 缓存（可选）：** `REDIS_ADDR=127.0.0.1:6379`

---

## 2. 安装与启动

按需修改 service 文件中的 `User`、`WorkingDirectory`：

```bash
cd /path/to/backend
sudo cp systemd/*.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable appsflyer-backend appsflyer-ai-chat
```

首次建库：

```bash
sudo bash init_db_server.sh --env-file /etc/appsflyer/backend.env --with-pg
```

编译并重启：

```bash
sudo bash restart_backend.sh
```

---

## 3. 运维命令

| 操作 | 命令 |
|------|------|
| 状态 | `sudo systemctl status appsflyer-backend appsflyer-ai-chat` |
| 更新后重启 | `cd backend && sudo bash restart_backend.sh` |
| 日志 | `sudo journalctl -u appsflyer-backend -f` |
| Go 日志 | `tail -f /tmp/go_runner.log` |
| 仅拉起 :5001 | `sudo bash start_autopipe.sh` |

---

## 4. 注册邮件（SMTP）

写入 `backend.env` 后执行 `sudo systemctl restart appsflyer-backend`。

**SendGrid（推荐）**

```env
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USE_SSL=0
SMTP_USER=apikey
SMTP_PASSWORD=<API Key>
SMTP_FROM=<已验证发件人>
```

**Gmail（需应用专用密码）**

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_USE_SSL=1
SMTP_USER=<邮箱>
SMTP_PASSWORD=<应用密码>
SMTP_FROM=<邮箱>
```

---

## 5. 行为说明

- **`appsflyer-backend`**：先起 Go `:5001`（Dashboard / AutoPipe / Benchmark / App Estimator），再起 Scraper（失败不退出），最后 Flask（失败则退出）。
- **`appsflyer-ai-chat`**：独立进程，共用 `JWT_SECRET_KEY` 与 `backend.env`。
- 日志输出到 **journald**（`journalctl -u <unit> -f`）。

完整部署流程见根目录 **[DEPLOY.md](../../DEPLOY.md)**。
