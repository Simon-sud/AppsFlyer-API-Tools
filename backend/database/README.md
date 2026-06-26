# 数据库初始化

用于**全新** MySQL（及可选 PostgreSQL）环境。App Estimator 使用独立 SQLite，不在此目录管理。

---

## 存储分工

| 引擎 | 用途 | 必需 |
|------|------|------|
| **MySQL** | 用户、团队、账户、查询、任务、Dispatch、Benchmark 缓存表 | 是 |
| **PostgreSQL** | Gochat 会话与消息 | 仅 Gochat |
| **SQLite** | App Estimator（`APP_ESTIMATOR_DB_PATH`） | 仅 Estimator |

---

## 一键初始化（推荐）

前提：MySQL 已运行；凭证在 `/etc/appsflyer/backend.env`。

```bash
cd backend
sudo bash init_db_server.sh --env-file /etc/appsflyer/backend.env
```

| 参数 | 作用 |
|------|------|
| `--with-pg` | 创建 `gochat_db` 并导入 `gochat_schema.sql` |
| `--migrations` | 对已有库执行 `migrations/*.sql`（升级用） |

验证：

```bash
python3 check_db_schema.py
```

---

## 手动导入

**MySQL**

```bash
mysql -h <host> -u <user> -p -e "CREATE DATABASE IF NOT EXISTS appsflyer_rawdata CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
mysql -h <host> -u <user> -p appsflyer_rawdata < database/schema.sql
```

**PostgreSQL（Gochat）**

```bash
createdb -h <host> -U <user> gochat_db
psql -h <host> -U <user> -d gochat_db -f database/gochat_schema.sql
```

---

## 文件说明

| 文件 | 内容 |
|------|------|
| `schema.sql` | MySQL 主业务表 |
| `gochat_schema.sql` | PostgreSQL Gochat 表 |
| `db.py` | 运行时连接（`database/db.py`） |

`migrations/` 供**已有库**增量升级；新环境只需 `schema.sql`（+ `--with-pg` 时的 `gochat_schema.sql`）。

---

## 常见问题

| 问题 | 处理 |
|------|------|
| 连接失败 | 检查服务、主机端口、防火墙 |
| 重复执行 | `IF NOT EXISTS`，可安全重跑，不删数据 |
| 升级旧库 | `--migrations` 或按序执行 `migrations/*.sql` |

环境变量与 systemd：`backend/systemd/README.md` · 部署：`DEPLOY.md`。
