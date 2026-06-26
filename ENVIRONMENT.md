<div align="center">

# Environment Variables Guide

### AppsFlyer-API-Tools

How to configure environment variables for **local development** and **production**.

<br />

**English** · [**简体中文**](./ENVIRONMENT.zh-CN.md)

<br />

[**README**](./README.md) · [**Deployment**](./DEPLOY.md) · [**GitHub Guide**](./GITHUB.md)

<br />

<table>
<thead>
<tr>
<th align="center">Environment</th>
<th align="center">Config file</th>
<th align="center">Notes</th>
</tr>
</thead>
<tbody>
<tr>
<td align="center"><strong>Local</strong></td>
<td align="center"><code>backend/.env</code></td>
<td align="center">Copy from <code>backend/.env.example</code>; never commit</td>
</tr>
<tr>
<td align="center"><strong>Production</strong></td>
<td align="center"><code>/etc/appsflyer/backend.env</code></td>
<td align="center">Single source of truth; <code>chmod 600</code>; loaded by systemd</td>
</tr>
</tbody>
</table>

<p>Flask (<code>:5000</code>), AutoPipe Runner (<code>:5001</code>), and Gochat (<code>:5002</code>) must share the same <strong><code>JWT_SECRET_KEY</code></strong></p>

</div>

---

<div align="center">

## 1. Local Development

### 1.1 Setup

</div>

```bash
cp backend/.env.example backend/.env
# Edit backend/.env (see recommended values below)

cd backend
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
bash init_db_server.sh          # reads backend/.env
# For Gochat:
bash init_db_server.sh --with-pg

cd .. && bash start.sh          # one-command: DB check + all services + frontend
```

<div align="center">

### 1.2 Recommended <code>backend/.env</code> (local)

</div>

```env
IS_LOCAL=true
FLASK_ENV=development
FLASK_DEBUG=1
LOG_LEVEL=DEBUG

JWT_SECRET_KEY=dev-only-change-me

DB_HOST=127.0.0.1
DB_USER=root
DB_PASSWORD=<your-mysql-password>
DB_NAME=appsflyer_rawdata

PG_HOST=127.0.0.1
PG_PORT=5432
PG_USER=postgres
PG_PASSWORD=<your-pg-password>
PG_DB=gochat_db

CORS_ORIGIN_LOCAL=http://localhost:3000
CORS_ORIGINS=http://localhost:3000,http://127.0.0.1:3000

MIIMO_API_KEY=tp-<your-key>
APP_ESTIMATOR_DB_PATH=/path/to/app_estimator.db
APP_ESTIMATOR_SKILL_ROOT=/path/to/app-download-estimator
APP_ESTIMATOR_SCRIPTS_DIR=/path/to/backend/scripts
APP_ESTIMATOR_PIPELINE_ENABLED=true
APP_ESTIMATOR_PIPELINE_INTERVAL_SEC=300
```

<div align="center">

### 1.3 Local frontend

<p>Dev mode (<code>npm start</code>) defaults to localhost ports — usually no <code>frontend/.env</code> needed</p>

<table>
<thead>
<tr>
<th align="center">Service</th>
<th align="center">Default URL</th>
</tr>
</thead>
<tbody>
<tr><td align="center">Flask</td><td align="center"><code>http://localhost:5000</code></td></tr>
<tr><td align="center">AutoPipe / Dashboard / Estimator</td><td align="center"><code>http://localhost:5001</code></td></tr>
<tr><td align="center">Gochat</td><td align="center"><code>http://localhost:5002</code></td></tr>
<tr><td align="center">Scraper</td><td align="center"><code>http://localhost:3001</code></td></tr>
</tbody>
</table>

### 1.4 Feature requirements (local)

<table>
<thead>
<tr>
<th align="center">Feature</th>
<th align="center">Minimum</th>
</tr>
</thead>
<tbody>
<tr><td align="center">Login / Query / Account</td><td align="center">MySQL + <code>JWT_SECRET_KEY</code></td></tr>
<tr><td align="center">Dashboard / AutoPipe</td><td align="center">Above + Go <code>:5001</code></td></tr>
<tr><td align="center">Gochat</td><td align="center">Above + PostgreSQL + <code>MIIMO_API_KEY</code> + Go <code>:5002</code></td></tr>
<tr><td align="center">Apps Finder</td><td align="center">Scraper <code>:3001</code></td></tr>
<tr><td align="center">App Estimator</td><td align="center">Go <code>:5001</code> + <code>APP_ESTIMATOR_*</code></td></tr>
<tr><td align="center">Benchmark cache</td><td align="center"><code>REDIS_ADDR</code> (optional)</td></tr>
<tr><td align="center">Signup email OTP</td><td align="center"><code>SMTP_*</code> (optional in dev)</td></tr>
</tbody>
</table>

</div>

---

<div align="center">

## 2. Production Server

### 2.1 Setup

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

### 2.2 Recommended <code>/etc/appsflyer/backend.env</code> (production)

</div>

```env
IS_LOCAL=false
FLASK_ENV=production
FLASK_DEBUG=0
LOG_LEVEL=INFO

JWT_SECRET_KEY=<long-random-secret>

DB_HOST=127.0.0.1
DB_USER=root
DB_PASSWORD=<replace>
DB_NAME=appsflyer_rawdata

PG_HOST=127.0.0.1
PG_PORT=5432
PG_USER=postgres
PG_PASSWORD=<replace>
PG_DB=gochat_db

CORS_ORIGIN=https://your.domain
CORS_ORIGINS=https://your.domain,https://www.your.domain

MIIMO_API_KEY=tp-<replace>

APP_ESTIMATOR_DB_PATH=/opt/openclaw/skills/app-download-estimator/data/app_estimator.db
APP_ESTIMATOR_SKILL_ROOT=/opt/openclaw/skills/app-download-estimator
APP_ESTIMATOR_SCRIPTS_DIR=/opt/appsflyer/backend/scripts
APP_ESTIMATOR_PIPELINE_ENABLED=true
APP_ESTIMATOR_PIPELINE_INTERVAL_SEC=300
```

<div align="center">

<p>After changes: <code>sudo systemctl restart appsflyer-backend appsflyer-ai-chat</code></p>

### 2.3 systemd loading

<table>
<thead>
<tr>
<th align="center">Unit</th>
<th align="center">How env is loaded</th>
</tr>
</thead>
<tbody>
<tr>
<td align="center"><code>appsflyer-backend</code></td>
<td align="center"><code>EnvironmentFile=/etc/appsflyer/backend.env</code> + <code>start_services_optimized.sh</code></td>
</tr>
<tr>
<td align="center"><code>appsflyer-ai-chat</code></td>
<td align="center">Same + <code>AI_CHAT_PORT=:5002</code> in unit file</td>
</tr>
</tbody>
</table>

</div>

---

<div align="center">

## 3. Variable Reference

### 3.1 Core (required)

<table>
<thead>
<tr>
<th align="center">Variable</th>
<th align="center">Consumers</th>
<th align="center">Description</th>
</tr>
</thead>
<tbody>
<tr><td align="center"><code>JWT_SECRET_KEY</code></td><td align="center">Flask, Go5001, Go5002</td><td align="center">JWT signing — <strong>must match all three</strong></td></tr>
<tr><td align="center"><code>DB_HOST</code></td><td align="center">All backends</td><td align="center">MySQL host</td></tr>
<tr><td align="center"><code>DB_USER</code></td><td align="center">All backends</td><td align="center">MySQL user</td></tr>
<tr><td align="center"><code>DB_PASSWORD</code></td><td align="center">All backends</td><td align="center">MySQL password</td></tr>
<tr><td align="center"><code>DB_NAME</code></td><td align="center">All backends</td><td align="center">Default <code>appsflyer_rawdata</code></td></tr>
</tbody>
</table>

### 3.2 Gochat (PostgreSQL + MiMo)

<table>
<thead>
<tr>
<th align="center">Variable</th>
<th align="center">Consumer</th>
<th align="center">Description</th>
</tr>
</thead>
<tbody>
<tr><td align="center"><code>PG_*</code></td><td align="center">Go5002</td><td align="center">PostgreSQL connection</td></tr>
<tr><td align="center"><code>MIIMO_API_KEY</code></td><td align="center">Go5002</td><td align="center">MiMo <code>tp-</code> key — <strong>no default in code</strong></td></tr>
<tr><td align="center"><code>MIIMO_BASE_URL</code></td><td align="center">Go5002</td><td align="center">Token Plan endpoint</td></tr>
<tr><td align="center"><code>MIIMO_MODEL</code></td><td align="center">Go5002</td><td align="center">e.g. <code>mimo-v2.5-pro</code></td></tr>
<tr><td align="center"><code>AI_CHAT_PORT</code></td><td align="center">Go5002</td><td align="center">Default <code>:5002</code></td></tr>
</tbody>
</table>

<p>Aliases: <code>XIAOMIMIMO_API_KEY</code>, <code>MIMO_API_KEY</code>, <code>GOCHAT_API_KEY</code></p>

### 3.3 App Estimator

<table>
<thead>
<tr>
<th align="center">Variable</th>
<th align="center">Description</th>
</tr>
</thead>
<tbody>
<tr><td align="center"><code>APP_ESTIMATOR_DB_PATH</code></td><td align="center">Read-only SQLite path</td></tr>
<tr><td align="center"><code>APP_ESTIMATOR_SKILL_ROOT</code></td><td align="center">OpenClaw skill root</td></tr>
<tr><td align="center"><code>APP_ESTIMATOR_SCRIPTS_DIR</code></td><td align="center">Pipeline Python scripts</td></tr>
<tr><td align="center"><code>APP_ESTIMATOR_PIPELINE_ENABLED</code></td><td align="center"><code>true</code> / <code>false</code></td></tr>
<tr><td align="center"><code>APP_ESTIMATOR_PIPELINE_INTERVAL_SEC</code></td><td align="center">Schedule interval (default 300)</td></tr>
</tbody>
</table>

### 3.4 Optional

<table>
<thead>
<tr>
<th align="center">Variable</th>
<th align="center">Purpose</th>
</tr>
</thead>
<tbody>
<tr><td align="center"><code>CORS_ORIGIN</code> / <code>CORS_ORIGINS</code></td><td align="center">Allowed browser origins</td></tr>
<tr><td align="center"><code>REDIS_ADDR</code></td><td align="center">Benchmark / Home cache</td></tr>
<tr><td align="center"><code>BENCHMARK_OPENCLAW_ROOT</code></td><td align="center">Benchmark export directory</td></tr>
<tr><td align="center"><code>SMTP_*</code></td><td align="center">Signup verification email</td></tr>
<tr><td align="center"><code>REACT_APP_*</code></td><td align="center">Frontend build — only if APIs are on different domains</td></tr>
</tbody>
</table>

</div>

---

<div align="center">

## 4. Health Checks

</div>

```bash
curl -sf http://127.0.0.1:5000/health
curl -sf http://127.0.0.1:5001/health
curl -sf http://127.0.0.1:5001/api/app-estimator/health
curl -sf http://127.0.0.1:5002/api/health
```

---

<div align="center">

## 5. Troubleshooting

<table>
<thead>
<tr>
<th align="center">Symptom</th>
<th align="center">Check</th>
</tr>
</thead>
<tbody>
<tr><td align="center">Dashboard 401 after login</td><td align="center"><code>JWT_SECRET_KEY</code> mismatch Flask ↔ Go</td></tr>
<tr><td align="center">Gochat unresponsive</td><td align="center"><code>MIIMO_API_KEY</code>, <code>PG_*</code>, <code>:5002</code></td></tr>
<tr><td align="center">Estimator empty</td><td align="center"><code>APP_ESTIMATOR_DB_PATH</code>, pipeline enabled</td></tr>
<tr><td align="center">CORS errors</td><td align="center"><code>CORS_ORIGIN</code> matches browser URL</td></tr>
<tr><td align="center">Env changes ignored</td><td align="center">Restart systemd; edit <code>/etc/appsflyer/backend.env</code></td></tr>
</tbody>
</table>

<p>Template: <code>backend/.env.example</code> · Database: <code>backend/database/README.md</code> · systemd: <code>backend/systemd/README.md</code></p>

<br />

<sub>AppsFlyer-API-Tools · Environment Configuration</sub>

</div>
