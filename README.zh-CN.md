<div align="center">

# AppsFlyer-API-Tools

### AppsFlyer 一体化数据工作台

账户配置 · 原始数据查询 · Dashboard · AutoPipe 调度 · Dispatch 令牌 · 行业 Benchmark · App 下载估算 · 应用发现 · 内置 AI 助手 Gochat

<br />

[**English**](./README.md) · **简体中文**

<br />

[**环境配置**](./ENVIRONMENT.zh-CN.md) · [**生产部署**](./DEPLOY.zh-CN.md) · [**GitHub 指南**](./GITHUB.zh-CN.md)

<br />

部署不依赖 Git，将项目目录拷贝或 rsync 到服务器即可。

<br />

</div>

---

<div align="center">

## 功能模块

<table>
<thead>
<tr>
<th align="center">路由</th>
<th align="center">模块</th>
<th align="center">后端</th>
</tr>
</thead>
<tbody>
<tr>
<td align="center"><code>/</code></td>
<td align="center">Appsflyer Query</td>
<td align="center">Flask <code>:5000</code></td>
</tr>
<tr>
<td align="center"><code>/dashboard</code></td>
<td align="center">Dashboard</td>
<td align="center">Go <code>:5001</code></td>
</tr>
<tr>
<td align="center"><code>/autopipe</code></td>
<td align="center">AutoPipe</td>
<td align="center">Go <code>:5001</code></td>
</tr>
<tr>
<td align="center"><code>/dispatch-access</code></td>
<td align="center">Dispatch Access</td>
<td align="center">Flask + Go</td>
</tr>
<tr>
<td align="center"><code>/benchmark</code></td>
<td align="center">Benchmark Explorer</td>
<td align="center">Go <code>:5001</code></td>
</tr>
<tr>
<td align="center"><code>/app-estimator</code></td>
<td align="center">App Estimator</td>
<td align="center">Go <code>:5001</code>（OpenClaw SQLite）</td>
</tr>
<tr>
<td align="center"><code>/apps</code></td>
<td align="center">Apps Finder</td>
<td align="center">Scraper <code>:3001</code>（可选）</td>
</tr>
<tr>
<td align="center"><code>/account</code></td>
<td align="center">Account</td>
<td align="center">Flask <code>:5000</code></td>
</tr>
<tr>
<td align="center"><code>/docs</code></td>
<td align="center">产品文档</td>
<td align="center">静态页</td>
</tr>
<tr>
<td align="center">顶栏抽屉</td>
<td align="center">Gochat</td>
<td align="center">Go <code>:5002</code></td>
</tr>
</tbody>
</table>

<p><sub>Gochat 为全局侧栏助手（无独立路由），启用时需 PostgreSQL 存储会话。</sub></p>

</div>

---

<div align="center">

## 技术栈

<table>
<thead>
<tr>
<th align="center">层级</th>
<th align="center">技术</th>
</tr>
</thead>
<tbody>
<tr>
<td align="center">前端</td>
<td align="center">React 19、TypeScript、CRA、Tailwind、D3、Recharts</td>
</tr>
<tr>
<td align="center">主 API</td>
<td align="center">Python Flask — <strong>5000</strong></td>
</tr>
<tr>
<td align="center">任务 / 分析 API</td>
<td align="center">Go <code>autopipe_runner</code>（tag: <code>autopipe</code>）— <strong>5001</strong></td>
</tr>
<tr>
<td align="center">AI 对话</td>
<td align="center">Go <code>ai_chat_service</code>（tag: <code>!autopipe</code>）— <strong>5002</strong></td>
</tr>
<tr>
<td align="center">商店抓取</td>
<td align="center">Node Scraper-backend — <strong>3001</strong>（可选）</td>
</tr>
<tr>
<td align="center">主库</td>
<td align="center">MySQL 8+</td>
</tr>
<tr>
<td align="center">对话库</td>
<td align="center">PostgreSQL 15+（Gochat）</td>
</tr>
<tr>
<td align="center">入口</td>
<td align="center">Nginx → <code>frontend/build</code> + 反向代理</td>
</tr>
</tbody>
</table>

</div>

---

<div align="center">

## 端口

<table>
<thead>
<tr>
<th align="center">端口</th>
<th align="center">服务</th>
</tr>
</thead>
<tbody>
<tr>
<td align="center"><code>80</code> / <code>443</code></td>
<td align="center">Nginx</td>
</tr>
<tr>
<td align="center"><code>3000</code></td>
<td align="center">前端开发服（仅本地）</td>
</tr>
<tr>
<td align="center"><code>3001</code></td>
<td align="center">Scraper</td>
</tr>
<tr>
<td align="center"><code>5000</code></td>
<td align="center">Flask</td>
</tr>
<tr>
<td align="center"><code>5001</code></td>
<td align="center">AutoPipe Runner（Dashboard / AutoPipe / Benchmark / App Estimator）</td>
</tr>
<tr>
<td align="center"><code>5002</code></td>
<td align="center">Gochat</td>
</tr>
</tbody>
</table>

</div>

---

<div align="center">

## 目录结构

</div>

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

<div align="center">

## 本地开发

<p><strong>依赖：</strong>Node 18+、Python 3.9+、Go 1.21+、MySQL 8+；（Gochat）PostgreSQL 15+</p>

</div>

```bash
# 安装依赖
cd frontend && npm install
cd ../backend && python3 -m venv venv && source venv/bin/activate && pip install -r requirements.txt
go mod download

# 一键启动（检查 DB、拉起后端 + 前端）
cd .. && bash start.sh
```

<div align="center">

<p><strong>分服务启动</strong></p>

</div>

```bash
cd frontend && npm start
cd backend && source venv/bin/activate && python app.py
go build -tags autopipe -o autopipe_runner . && AUTOPIPE_PORT=:5001 ./autopipe_runner
go build -tags '!autopipe' -o ai_chat_service . && AI_CHAT_PORT=:5002 ./ai_chat_service
```

<div align="center">

<p><strong>健康检查</strong></p>

</div>

```bash
curl -s http://127.0.0.1:5000/health
curl -s http://127.0.0.1:5001/health
curl -s http://127.0.0.1:5001/api/app-estimator/health
curl -s http://127.0.0.1:5002/api/health
```

---

<div align="center">

## 环境变量（摘要）

<p>生产环境统一使用 <code>/etc/appsflyer/backend.env</code>（见 <code>backend/systemd/README.md</code>）</p>

<table>
<thead>
<tr>
<th align="center">变量</th>
<th align="center">用途</th>
</tr>
</thead>
<tbody>
<tr>
<td align="center"><code>JWT_SECRET_KEY</code></td>
<td align="center">Flask / Go5001 / Go5002 共用</td>
</tr>
<tr>
<td align="center"><code>DB_*</code></td>
<td align="center">MySQL</td>
</tr>
<tr>
<td align="center"><code>PG_*</code></td>
<td align="center">PostgreSQL（Gochat）</td>
</tr>
<tr>
<td align="center"><code>MIIMO_*</code></td>
<td align="center">Gochat 上游（生产必填）</td>
</tr>
<tr>
<td align="center"><code>APP_ESTIMATOR_*</code></td>
<td align="center">Estimator SQLite 路径与内置流水线</td>
</tr>
<tr>
<td align="center"><code>CORS_ORIGIN</code> / <code>CORS_ORIGINS</code></td>
<td align="center">生产跨域来源</td>
</tr>
<tr>
<td align="center"><code>REDIS_ADDR</code></td>
<td align="center">Benchmark 缓存（可选）</td>
</tr>
</tbody>
</table>

<p>完整说明：<a href="./ENVIRONMENT.zh-CN.md"><strong>ENVIRONMENT.zh-CN.md</strong></a> · <a href="./ENVIRONMENT.md">English</a> · 模板：<code>backend/.env.example</code></p>

</div>

---

<div align="center">

## 生产部署

<p>完整步骤：<a href="./DEPLOY.zh-CN.md"><strong>DEPLOY.zh-CN.md</strong></a> · <a href="./DEPLOY.md">English</a></p>

</div>

```bash
sudo bash backend/init_db_server.sh --env-file /etc/appsflyer/backend.env --with-pg
cd frontend && npm ci && npm run build
cd backend && sudo bash restart_backend.sh
sudo bash scripts/update_nginx.sh
```

<div align="center">

<p>产品说明见应用内 <code>/docs</code></p>

<p><strong>许可：</strong>专有许可 — 仅展示与非商业使用。详见 <a href="./LICENSE">LICENSE</a>。</p>

<br />

<sub>AppsFlyer-API-Tools · React · Flask · Go</sub>

</div>
