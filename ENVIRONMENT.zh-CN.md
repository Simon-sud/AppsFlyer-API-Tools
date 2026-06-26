<div align="center">

# 环境变量配置说明

### AppsFlyer-API-Tools

说明 **本地开发** 与 **服务器生产** 两套环境下的环境变量配置。

<br />

[**English**](./ENVIRONMENT.md) · **简体中文**

<br />

[**README**](./README.zh-CN.md) · [**生产部署**](./DEPLOY.zh-CN.md) · [**GitHub 指南**](./GITHUB.zh-CN.md)

<br />

<table>
<thead>
<tr>
<th align="center">环境</th>
<th align="center">配置文件位置</th>
<th align="center">说明</th>
</tr>
</thead>
<tbody>
<tr>
<td align="center"><strong>本地开发</strong></td>
<td align="center"><code>backend/.env</code></td>
<td align="center">复制 <code>backend/.env.example</code> 后修改；勿提交 git</td>
</tr>
<tr>
<td align="center"><strong>生产服务器</strong></td>
<td align="center"><code>/etc/appsflyer/backend.env</code></td>
<td align="center">唯一可信来源；<code>chmod 600</code>；由 systemd 注入</td>
</tr>
</tbody>
</table>

<p>Flask（<code>:5000</code>）、AutoPipe Runner（<code>:5001</code>）、Gochat（<code>:5002</code>）<strong>必须共用同一个 <code>JWT_SECRET_KEY</code></strong></p>

</div>

---

<div align="center">

## 一、本地开发环境

### 1.1 准备步骤

</div>

```bash
cp backend/.env.example backend/.env

cd backend
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
bash init_db_server.sh
bash init_db_server.sh --with-pg   # 使用 Gochat 时

cd .. && bash start.sh
```

<div align="center">

### 1.2 推荐 <code>backend/.env</code>（本地）

</div>

```env
IS_LOCAL=true
FLASK_ENV=development
FLASK_DEBUG=1
LOG_LEVEL=DEBUG

JWT_SECRET_KEY=dev-only-change-me

DB_HOST=127.0.0.1
DB_USER=root
DB_PASSWORD=你的本地MySQL密码
DB_NAME=appsflyer_rawdata

PG_HOST=127.0.0.1
PG_PORT=5432
PG_USER=postgres
PG_PASSWORD=你的本地PG密码
PG_DB=gochat_db

CORS_ORIGIN_LOCAL=http://localhost:3000
CORS_ORIGINS=http://localhost:3000,http://127.0.0.1:3000

MIIMO_API_KEY=tp-你的密钥
APP_ESTIMATOR_DB_PATH=/你的路径/app_estimator.db
APP_ESTIMATOR_SKILL_ROOT=/你的路径/app-download-estimator
APP_ESTIMATOR_SCRIPTS_DIR=/你的路径/backend/scripts
APP_ESTIMATOR_PIPELINE_ENABLED=true
APP_ESTIMATOR_PIPELINE_INTERVAL_SEC=300
```

<div align="center">

### 1.3 本地前端

<p>开发模式（<code>npm start</code>）默认直连各端口，通常不需要 <code>frontend/.env</code></p>

<table>
<thead>
<tr>
<th align="center">服务</th>
<th align="center">开发默认地址</th>
</tr>
</thead>
<tbody>
<tr><td align="center">Flask</td><td align="center"><code>http://localhost:5000</code></td></tr>
<tr><td align="center">AutoPipe / Dashboard / Estimator</td><td align="center"><code>http://localhost:5001</code></td></tr>
<tr><td align="center">Gochat</td><td align="center"><code>http://localhost:5002</code></td></tr>
<tr><td align="center">Scraper</td><td align="center"><code>http://localhost:3001</code></td></tr>
</tbody>
</table>

### 1.4 本地功能与变量对照

<table>
<thead>
<tr>
<th align="center">功能</th>
<th align="center">最低要求</th>
</tr>
</thead>
<tbody>
<tr><td align="center">登录 / 查询 / Account</td><td align="center">MySQL + <code>JWT_SECRET_KEY</code></td></tr>
<tr><td align="center">Dashboard / AutoPipe</td><td align="center">同上 + Go <code>:5001</code></td></tr>
<tr><td align="center">Gochat</td><td align="center">同上 + PostgreSQL + <code>MIIMO_API_KEY</code> + Go <code>:5002</code></td></tr>
<tr><td align="center">Apps Finder</td><td align="center">Scraper <code>:3001</code></td></tr>
<tr><td align="center">App Estimator</td><td align="center">Go <code>:5001</code> + <code>APP_ESTIMATOR_*</code></td></tr>
<tr><td align="center">Benchmark 缓存</td><td align="center"><code>REDIS_ADDR</code>（可选）</td></tr>
<tr><td align="center">注册邮件验证码</td><td align="center"><code>SMTP_*</code>（开发可跳过）</td></tr>
</tbody>
</table>

</div>

---

<div align="center">

## 二、生产服务器环境

### 2.1 准备步骤

</div>

```bash
export PROJ=/opt/appsflyer

sudo mkdir -p /etc/appsflyer
sudo nano /etc/appsflyer/backend.env
sudo chmod 600 /etc/appsflyer/backend.env

cd $PROJ/backend
sudo bash init_db_server.sh --env-file /etc/appsflyer/backend.env --with-pg

cd $PROJ/frontend && npm ci && npm run build

sudo cp systemd/*.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable appsflyer-backend appsflyer-ai-chat
sudo bash restart_backend.sh

sudo bash scripts/update_nginx.sh
```

<div align="center">

### 2.2 推荐 <code>/etc/appsflyer/backend.env</code>（生产）

</div>

```env
IS_LOCAL=false
FLASK_ENV=production
FLASK_DEBUG=0
LOG_LEVEL=INFO

JWT_SECRET_KEY=请替换为长随机字符串

DB_HOST=127.0.0.1
DB_USER=root
DB_PASSWORD=请替换
DB_NAME=appsflyer_rawdata

PG_HOST=127.0.0.1
PG_PORT=5432
PG_USER=postgres
PG_PASSWORD=请替换
PG_DB=gochat_db

CORS_ORIGIN=https://你的域名
CORS_ORIGINS=https://你的域名,https://www.你的域名

MIIMO_API_KEY=tp-请替换

APP_ESTIMATOR_DB_PATH=/opt/openclaw/skills/app-download-estimator/data/app_estimator.db
APP_ESTIMATOR_SKILL_ROOT=/opt/openclaw/skills/app-download-estimator
APP_ESTIMATOR_SCRIPTS_DIR=/opt/appsflyer/backend/scripts
APP_ESTIMATOR_PIPELINE_ENABLED=true
APP_ESTIMATOR_PIPELINE_INTERVAL_SEC=300
```

<div align="center">

<p>修改环境后：<code>sudo systemctl restart appsflyer-backend appsflyer-ai-chat</code></p>

### 2.3 systemd 如何加载变量

<table>
<thead>
<tr>
<th align="center">Unit</th>
<th align="center">读取方式</th>
</tr>
</thead>
<tbody>
<tr>
<td align="center"><code>appsflyer-backend</code></td>
<td align="center"><code>EnvironmentFile=/etc/appsflyer/backend.env</code> + <code>start_services_optimized.sh</code></td>
</tr>
<tr>
<td align="center"><code>appsflyer-ai-chat</code></td>
<td align="center">同上 + <code>AI_CHAT_PORT=:5002</code>（写在 unit 内）</td>
</tr>
</tbody>
</table>

</div>

---

<div align="center">

## 三、变量速查表

### 3.1 核心（必填）

<table>
<thead>
<tr>
<th align="center">变量</th>
<th align="center">消费方</th>
<th align="center">说明</th>
</tr>
</thead>
<tbody>
<tr><td align="center"><code>JWT_SECRET_KEY</code></td><td align="center">Flask, Go5001, Go5002</td><td align="center">会话 JWT 签名；<strong>必须三端相同</strong></td></tr>
<tr><td align="center"><code>DB_HOST</code></td><td align="center">同上</td><td align="center">MySQL 主机</td></tr>
<tr><td align="center"><code>DB_USER</code></td><td align="center">同上</td><td align="center">MySQL 用户</td></tr>
<tr><td align="center"><code>DB_PASSWORD</code></td><td align="center">同上</td><td align="center">MySQL 密码</td></tr>
<tr><td align="center"><code>DB_NAME</code></td><td align="center">同上</td><td align="center">默认 <code>appsflyer_rawdata</code></td></tr>
</tbody>
</table>

### 3.2 Gochat（PostgreSQL + MiMo）

<table>
<thead>
<tr>
<th align="center">变量</th>
<th align="center">消费方</th>
<th align="center">说明</th>
</tr>
</thead>
<tbody>
<tr><td align="center"><code>PG_*</code></td><td align="center">Go5002</td><td align="center">PostgreSQL 连接</td></tr>
<tr><td align="center"><code>MIIMO_API_KEY</code></td><td align="center">Go5002</td><td align="center">MiMo 密钥；<strong>无代码内默认值</strong></td></tr>
<tr><td align="center"><code>MIIMO_BASE_URL</code></td><td align="center">Go5002</td><td align="center">Token Plan 端点</td></tr>
<tr><td align="center"><code>MIIMO_MODEL</code></td><td align="center">Go5002</td><td align="center">如 <code>mimo-v2.5-pro</code></td></tr>
<tr><td align="center"><code>AI_CHAT_PORT</code></td><td align="center">Go5002</td><td align="center">默认 <code>:5002</code></td></tr>
</tbody>
</table>

### 3.3 App Estimator &amp; 可选项

<table>
<thead>
<tr>
<th align="center">变量</th>
<th align="center">说明</th>
</tr>
</thead>
<tbody>
<tr><td align="center"><code>APP_ESTIMATOR_DB_PATH</code></td><td align="center">SQLite 只读库路径</td></tr>
<tr><td align="center"><code>APP_ESTIMATOR_SKILL_ROOT</code></td><td align="center">OpenClaw skill 根目录</td></tr>
<tr><td align="center"><code>APP_ESTIMATOR_PIPELINE_ENABLED</code></td><td align="center">内置流水线开关</td></tr>
<tr><td align="center"><code>CORS_ORIGIN</code> / <code>CORS_ORIGINS</code></td><td align="center">生产跨域来源</td></tr>
<tr><td align="center"><code>REDIS_ADDR</code></td><td align="center">Benchmark 缓存（可选）</td></tr>
<tr><td align="center"><code>SMTP_*</code></td><td align="center">注册验证码邮件</td></tr>
<tr><td align="center"><code>REACT_APP_*</code></td><td align="center">API 不同源时前端构建变量</td></tr>
</tbody>
</table>

</div>

---

<div align="center">

## 四、健康检查

</div>

```bash
curl -sf http://127.0.0.1:5000/health
curl -sf http://127.0.0.1:5001/health
curl -sf http://127.0.0.1:5001/api/app-estimator/health
curl -sf http://127.0.0.1:5002/api/health
```

---

<div align="center">

## 五、常见问题

<table>
<thead>
<tr>
<th align="center">现象</th>
<th align="center">检查项</th>
</tr>
</thead>
<tbody>
<tr><td align="center">登录后 Dashboard 401</td><td align="center"><code>JWT_SECRET_KEY</code> 是否在 Flask 与 Go 间一致</td></tr>
<tr><td align="center">Gochat 无响应</td><td align="center"><code>MIIMO_API_KEY</code>、<code>PG_*</code>、<code>:5002</code></td></tr>
<tr><td align="center">App Estimator 空</td><td align="center"><code>APP_ESTIMATOR_DB_PATH</code>、pipeline 是否启用</td></tr>
<tr><td align="center">跨域错误</td><td align="center"><code>CORS_ORIGIN</code> 与访问域名一致</td></tr>
<tr><td align="center">改 env 不生效</td><td align="center">systemd 需 restart；确认改的是 <code>/etc/appsflyer/backend.env</code></td></tr>
</tbody>
</table>

<p>配置模板：<code>backend/.env.example</code> · 数据库：<code>backend/database/README.md</code></p>

<br />

<sub>AppsFlyer-API-Tools · 环境变量配置</sub>

</div>
