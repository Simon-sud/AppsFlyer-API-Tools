<div align="center">

# 生产部署指南

### AppsFlyer-API-Tools

通过目录拷贝、rsync 或压缩包部署，**服务器上无需 Git**。

<br />

[**English**](./DEPLOY.md) · **简体中文**

<br />

[**README**](./README.zh-CN.md) · [**环境配置**](./ENVIRONMENT.zh-CN.md) · [**GitHub 指南**](./GITHUB.zh-CN.md)

<br />

<p><code>$PROJ</code> 表示项目根目录，例如 <code>/opt/appsflyer</code></p>

</div>

---

<div align="center">

## 1. 交付物

</div>

```text
$PROJ/
├── frontend/          # npm ci && npm run build → frontend/build
├── backend/
├── nginx_server.conf
├── scripts/update_nginx.sh
├── DEPLOY.md
└── ENVIRONMENT.md
```

<div align="center">

<p>勿上传：<code>node_modules</code>、<code>venv</code>、<code>__pycache__</code></p>
<p>Nginx <code>root</code> 必须指向 <strong><code>$PROJ/frontend/build</code></strong></p>

</div>

---

<div align="center">

## 2. 功能与 API 对照

<table>
<thead>
<tr>
<th align="center">页面路由</th>
<th align="center">能力</th>
<th align="center">上游</th>
</tr>
</thead>
<tbody>
<tr>
<td align="center"><code>/</code></td>
<td align="center">原始数据查询</td>
<td align="center">Flask <code>:5000</code></td>
</tr>
<tr>
<td align="center"><code>/dashboard</code></td>
<td align="center">聚合图表</td>
<td align="center">Go <code>:5001</code> <code>/api/dashboard/</code></td>
</tr>
<tr>
<td align="center"><code>/autopipe</code></td>
<td align="center">定时任务</td>
<td align="center">Go <code>:5001</code> <code>/api/autopipe/</code></td>
</tr>
<tr>
<td align="center"><code>/dispatch-access</code></td>
<td align="center">令牌导入 / Track API</td>
<td align="center">Flask + Go</td>
</tr>
<tr>
<td align="center"><code>/benchmark</code></td>
<td align="center">AppsFlyer 公开 Benchmark</td>
<td align="center">Go <code>:5001</code> <code>/api/dashboard/benchmark/</code></td>
</tr>
<tr>
<td align="center"><code>/app-estimator</code></td>
<td align="center">评分 → 下载估算</td>
<td align="center">Go <code>:5001</code> <code>/api/app-estimator/</code></td>
</tr>
<tr>
<td align="center"><code>/apps</code></td>
<td align="center">商店应用检索</td>
<td align="center">Scraper <code>:3001</code></td>
</tr>
<tr>
<td align="center"><code>/account</code></td>
<td align="center">账户与团队</td>
<td align="center">Flask <code>:5000</code></td>
</tr>
<tr>
<td align="center">Gochat 抽屉</td>
<td align="center">MiMo 对话</td>
<td align="center">Go <code>:5002</code></td>
</tr>
</tbody>
</table>

</div>

---

<div align="center">

## 3. Nginx 路由

<p>详见 <code>nginx_server.conf</code>（更具体的 <code>location</code> 在前）</p>

<table>
<thead>
<tr>
<th align="center">路径前缀</th>
<th align="center">端口</th>
<th align="center">说明</th>
</tr>
</thead>
<tbody>
<tr>
<td align="center"><code>/api/dashboard/</code>、<code>/api/autopipe/</code></td>
<td align="center">5001</td>
<td align="center">AutoPipe Runner</td>
</tr>
<tr>
<td align="center"><code>/api/app-estimator</code></td>
<td align="center">5001</td>
<td align="center">App Estimator</td>
</tr>
<tr>
<td align="center"><code>/api/conversations</code>、<code>/api/chat/</code></td>
<td align="center">5002</td>
<td align="center">Gochat</td>
</tr>
<tr>
<td align="center"><code>/api/appstore/</code>、<code>/api/app/</code>、<code>/api/apps/</code></td>
<td align="center">3001</td>
<td align="center">Scraper（可选）</td>
</tr>
<tr>
<td align="center"><code>/api/</code>、<code>/socket.io/</code></td>
<td align="center">5000</td>
<td align="center">Flask 兜底</td>
</tr>
<tr>
<td align="center"><code>/</code></td>
<td align="center">—</td>
<td align="center"><code>frontend/build</code> 静态 SPA</td>
</tr>
</tbody>
</table>

<p>上线前修改：<code>server_name</code>、<code>root</code>、CORS（如需要）</p>

</div>

```bash
cd "$PROJ" && sudo bash scripts/update_nginx.sh
```

---

<div align="center">

## 4. 环境变量

<p>创建 <strong><code>/etc/appsflyer/backend.env</code></strong> 并 <code>chmod 600</code></p>
<p>完整说明：<a href="./ENVIRONMENT.zh-CN.md">ENVIRONMENT.zh-CN.md</a></p>

</div>

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

# Gochat 上游（生产必填，代码无默认 Key）
# MIIMO_API_KEY=
# MIIMO_BASE_URL=

# CORS（生产环境）
# CORS_ORIGIN=https://your.domain.example
# CORS_ORIGINS=https://your.domain.example

# App Estimator（按服务器实际路径修改）
APP_ESTIMATOR_DB_PATH=/opt/openclaw/skills/app-download-estimator/data/app_estimator.db
APP_ESTIMATOR_SKILL_ROOT=/opt/openclaw/skills/app-download-estimator
APP_ESTIMATOR_SCRIPTS_DIR=$PROJ/backend/scripts
APP_ESTIMATOR_PIPELINE_ENABLED=true
APP_ESTIMATOR_PIPELINE_INTERVAL_SEC=300

# Benchmark 缓存（可选）
# REDIS_ADDR=127.0.0.1:6379
```

<div align="center">

<p>Flask、<code>:5001</code>、<code>:5002</code> 必须使用相同 <strong><code>JWT_SECRET_KEY</code></strong></p>
<p>细则：<code>backend/systemd/README.md</code></p>

</div>

---

<div align="center">

## 5. 部署流程

</div>

```bash
export PROJ=/opt/appsflyer

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

<div align="center">

### 代码更新后重启

</div>

```bash
cd "$PROJ/backend" && sudo bash restart_backend.sh
```

<div align="center">

<p>脚本会编译 <code>autopipe_runner</code>、<code>ai_chat_service</code>，重启两个 systemd 单元，并等待 <code>:5001/health</code></p>

<p><code>:5001</code> 仍异常时：</p>

</div>

```bash
sudo bash start_autopipe.sh && tail -80 /tmp/go_runner.log
```

---

<div align="center">

## 6. 进程模型

<table>
<thead>
<tr>
<th align="center">systemd 单元</th>
<th align="center">内容</th>
<th align="center">端口</th>
</tr>
</thead>
<tbody>
<tr>
<td align="center"><code>appsflyer-backend</code></td>
<td align="center"><code>start_services_optimized.sh</code></td>
<td align="center">5001 → 3001 → 5000</td>
</tr>
<tr>
<td align="center"><code>appsflyer-ai-chat</code></td>
<td align="center"><code>ai_chat_service</code></td>
<td align="center">5002</td>
</tr>
</tbody>
</table>

<p><strong><code>start_services_optimized.sh</code> 启动顺序：</strong></p>

<p>1. Go <code>:5001</code> 优先 — Dashboard / AutoPipe / Benchmark / App Estimator<br />
2. Scraper <code>:3001</code> — 失败仅告警，不阻断<br />
3. Flask <code>:5000</code> — 失败则脚本退出</p>

<p>日志：<code>journalctl -u appsflyer-backend -f</code> · Go 详情：<code>/tmp/go_runner.log</code></p>

<p>无 Scraper 时：Apps Finder 不可用，其余模块正常。生产环境建议使用 systemd。</p>

</div>

---

<div align="center">

## 7. App Estimator

<p>数据：只读 SQLite（<code>APP_ESTIMATOR_DB_PATH</code>），由 OpenClaw skill / 脚本写入</p>
<p>内置流水线（<code>APP_ESTIMATOR_PIPELINE_ENABLED=true</code>）：采集 → Velocity → K 校准 → 批量估算</p>
<p>状态：<code>GET /api/app-estimator/pipeline</code></p>
<p>部署前确认 skill 目录与 DB 文件在服务器上存在</p>

</div>

---

<div align="center">

## 8. 健康检查

</div>

```bash
curl -sf http://127.0.0.1:5000/health
curl -sf http://127.0.0.1:5001/health
curl -sf http://127.0.0.1:5001/api/app-estimator/health
curl -sf http://127.0.0.1:5002/api/health
curl -sf http://127.0.0.1:3001/health    # 启用 Scraper 时
```

<div align="center">

<p>经 Nginx：登录、Dashboard、App Estimator Overview、Gochat 收发</p>

</div>

---

<div align="center">

## 9. 上线检查清单

<table>
<thead>
<tr>
<th align="center">#</th>
<th align="center">项</th>
</tr>
</thead>
<tbody>
<tr><td align="center">1</td><td align="center"><code>$PROJ</code>、Nginx <code>root</code>、systemd <code>WorkingDirectory</code> 一致</td></tr>
<tr><td align="center">2</td><td align="center"><code>frontend/build</code> 已生成</td></tr>
<tr><td align="center">3</td><td align="center"><code>backend.env</code> 已配置；<code>JWT_SECRET_KEY</code> 三端一致</td></tr>
<tr><td align="center">4</td><td align="center"><code>check_db_schema.py</code> 通过；（Gochat）PostgreSQL 正常</td></tr>
<tr><td align="center">5</td><td align="center"><code>:5000</code> / <code>:5001</code> / <code>:5002</code> 健康检查通过</td></tr>
<tr><td align="center">6</td><td align="center">Estimator SQLite 路径有效（若启用）</td></tr>
<tr><td align="center">7</td><td align="center">Scraper <code>:3001</code> 正常（仅 Apps Finder 需要）</td></tr>
<tr><td align="center">8</td><td align="center">SMTP 已配置（若开启注册邮件验证）</td></tr>
</tbody>
</table>

</div>

---

<div align="center">

## 10. 常见问题

<table>
<thead>
<tr>
<th align="center">现象</th>
<th align="center">排查</th>
</tr>
</thead>
<tbody>
<tr>
<td align="center">Dashboard / AutoPipe 502</td>
<td align="center"><code>curl :5001/health</code> · <code>tail /tmp/go_runner.log</code> · <code>restart_backend.sh</code></td>
</tr>
<tr>
<td align="center">App Estimator 无数据</td>
<td align="center"><code>APP_ESTIMATOR_DB_PATH</code> · pipeline API · <code>batch_estimate_downloads.py</code></td>
</tr>
<tr>
<td align="center">Gochat 失败</td>
<td align="center"><code>:5002</code> 健康 · PostgreSQL · <code>MIIMO_*</code></td>
</tr>
<tr>
<td align="center">Apps Finder 失败</td>
<td align="center"><code>:3001</code> · <code>Scraper-backend</code> 依赖</td>
</tr>
<tr>
<td align="center">登录后 API 401</td>
<td align="center">Flask 与 Go 的 <code>JWT_SECRET_KEY</code> 不一致</td>
</tr>
</tbody>
</table>

<p>数据库：<code>backend/database/README.md</code> · 邮件：<code>backend/systemd/README.md</code> §4</p>

<br />

<sub>AppsFlyer-API-Tools · 生产部署</sub>

</div>
