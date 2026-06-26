<div align="center">

# AppsFlyer-API-Tools

### All-in-one AppsFlyer data workbench

Account setup · raw data query · dashboards · AutoPipe pipelines · Dispatch tokens · industry benchmarks · app download estimator · store discovery · built-in AI chat (Gochat)

<br />

**English** · [**简体中文**](./README.zh-CN.md)

<br />

[**Environment**](./ENVIRONMENT.md) · [**Deployment**](./DEPLOY.md) · [**GitHub Guide**](./GITHUB.md)

<br />

Production deploys do **not** require Git — copy or rsync the project directory to your server.

<br />

</div>

---

<div align="center">

## Modules

<table>
<thead>
<tr>
<th align="center">Route</th>
<th align="center">Module</th>
<th align="center">Backend</th>
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
<td align="center">Go <code>:5001</code> (OpenClaw SQLite)</td>
</tr>
<tr>
<td align="center"><code>/apps</code></td>
<td align="center">Apps Finder</td>
<td align="center">Scraper <code>:3001</code> (optional)</td>
</tr>
<tr>
<td align="center"><code>/account</code></td>
<td align="center">Account</td>
<td align="center">Flask <code>:5000</code></td>
</tr>
<tr>
<td align="center"><code>/docs</code></td>
<td align="center">Product docs</td>
<td align="center">Static</td>
</tr>
<tr>
<td align="center">Top bar drawer</td>
<td align="center">Gochat</td>
<td align="center">Go <code>:5002</code></td>
</tr>
</tbody>
</table>

<p><sub>Gochat is a global sidebar assistant (no dedicated route). PostgreSQL is required for session storage.</sub></p>

</div>

---

<div align="center">

## Tech Stack

<table>
<thead>
<tr>
<th align="center">Layer</th>
<th align="center">Technology</th>
</tr>
</thead>
<tbody>
<tr>
<td align="center">Frontend</td>
<td align="center">React 19, TypeScript, CRA, Tailwind, D3, Recharts</td>
</tr>
<tr>
<td align="center">Primary API</td>
<td align="center">Python Flask — <strong>5000</strong></td>
</tr>
<tr>
<td align="center">Tasks / analytics API</td>
<td align="center">Go <code>autopipe_runner</code> (tag: <code>autopipe</code>) — <strong>5001</strong></td>
</tr>
<tr>
<td align="center">AI chat</td>
<td align="center">Go <code>ai_chat_service</code> (tag: <code>!autopipe</code>) — <strong>5002</strong></td>
</tr>
<tr>
<td align="center">Store scraper</td>
<td align="center">Node Scraper-backend — <strong>3001</strong> (optional)</td>
</tr>
<tr>
<td align="center">Primary DB</td>
<td align="center">MySQL 8+</td>
</tr>
<tr>
<td align="center">Chat DB</td>
<td align="center">PostgreSQL 15+ (Gochat)</td>
</tr>
<tr>
<td align="center">Entry</td>
<td align="center">Nginx → <code>frontend/build</code> + reverse proxy</td>
</tr>
</tbody>
</table>

</div>

---

<div align="center">

## Ports

<table>
<thead>
<tr>
<th align="center">Port</th>
<th align="center">Service</th>
</tr>
</thead>
<tbody>
<tr>
<td align="center"><code>80</code> / <code>443</code></td>
<td align="center">Nginx</td>
</tr>
<tr>
<td align="center"><code>3000</code></td>
<td align="center">Frontend dev server (local only)</td>
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
<td align="center">AutoPipe Runner (Dashboard / AutoPipe / Benchmark / App Estimator)</td>
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

## Project Layout

</div>

```text
├── frontend/
│   ├── src/pages/
│   ├── src/lib/appEstimator/
│   ├── build/              # npm run build output
│   └── Scraper-backend/
├── backend/
│   ├── app.py / auth.py
│   ├── autopipe_runner.go
│   ├── app_estimator*.go
│   ├── ai_chat_service.go
│   ├── scripts/            # Estimator pipeline scripts
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

## Local Development

<p><strong>Requirements:</strong> Node 18+, Python 3.9+, Go 1.21+, MySQL 8+; PostgreSQL 15+ for Gochat</p>

</div>

```bash
# Install dependencies
cd frontend && npm install
cd ../backend && python3 -m venv venv && source venv/bin/activate && pip install -r requirements.txt
go mod download

# One-command start (checks DB, launches backends + frontend)
cd .. && bash start.sh
```

<div align="center">

<p><strong>Start services individually</strong></p>

</div>

```bash
cd frontend && npm start
cd backend && source venv/bin/activate && python app.py
go build -tags autopipe -o autopipe_runner . && AUTOPIPE_PORT=:5001 ./autopipe_runner
go build -tags '!autopipe' -o ai_chat_service . && AI_CHAT_PORT=:5002 ./ai_chat_service
```

<div align="center">

<p><strong>Health checks</strong></p>

</div>

```bash
curl -s http://127.0.0.1:5000/health
curl -s http://127.0.0.1:5001/health
curl -s http://127.0.0.1:5001/api/app-estimator/health
curl -s http://127.0.0.1:5002/api/health
```

---

<div align="center">

## Environment Variables (summary)

<p>Production: <code>/etc/appsflyer/backend.env</code> — see <code>backend/systemd/README.md</code></p>

<table>
<thead>
<tr>
<th align="center">Variable</th>
<th align="center">Purpose</th>
</tr>
</thead>
<tbody>
<tr>
<td align="center"><code>JWT_SECRET_KEY</code></td>
<td align="center">Shared by Flask / Go :5001 / Go :5002</td>
</tr>
<tr>
<td align="center"><code>DB_*</code></td>
<td align="center">MySQL</td>
</tr>
<tr>
<td align="center"><code>PG_*</code></td>
<td align="center">PostgreSQL (Gochat)</td>
</tr>
<tr>
<td align="center"><code>MIIMO_*</code></td>
<td align="center">Gochat upstream (required in production)</td>
</tr>
<tr>
<td align="center"><code>APP_ESTIMATOR_*</code></td>
<td align="center">Estimator SQLite path &amp; pipeline</td>
</tr>
<tr>
<td align="center"><code>CORS_ORIGIN</code> / <code>CORS_ORIGINS</code></td>
<td align="center">Allowed origins in production</td>
</tr>
<tr>
<td align="center"><code>REDIS_ADDR</code></td>
<td align="center">Benchmark cache (optional)</td>
</tr>
</tbody>
</table>

<p>Full guide: <a href="./ENVIRONMENT.md"><strong>ENVIRONMENT.md</strong></a> · <a href="./ENVIRONMENT.zh-CN.md">中文</a> · template: <code>backend/.env.example</code></p>

</div>

---

<div align="center">

## Production Deployment

<p>Full steps: <a href="./DEPLOY.md"><strong>DEPLOY.md</strong></a> · <a href="./DEPLOY.zh-CN.md">中文</a></p>

</div>

```bash
sudo bash backend/init_db_server.sh --env-file /etc/appsflyer/backend.env --with-pg
cd frontend && npm ci && npm run build
cd backend && sudo bash restart_backend.sh
sudo bash scripts/update_nginx.sh
```

<div align="center">

<p>In-app product documentation: <code>/docs</code></p>

<p><strong>License:</strong> Proprietary — display &amp; non-commercial use only. See <a href="./LICENSE">LICENSE</a>.</p>

<br />

<sub>AppsFlyer-API-Tools · React · Flask · Go</sub>

</div>
