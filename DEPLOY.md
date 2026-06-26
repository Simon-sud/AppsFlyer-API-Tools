<div align="center">

# Production Deployment Guide

### AppsFlyer-API-Tools

Deploy via directory copy, rsync, or archive — **no Git required on the server**.

<br />

**English** · [**简体中文**](./DEPLOY.zh-CN.md)

<br />

[**README**](./README.md) · [**Environment**](./ENVIRONMENT.md) · [**GitHub Guide**](./GITHUB.md)

<br />

<p><code>$PROJ</code> denotes the project root, e.g. <code>/opt/appsflyer</code></p>

</div>

---

<div align="center">

## 1. Deliverables

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

<p>Do <strong>not</strong> upload: <code>node_modules</code>, <code>venv</code>, <code>__pycache__</code></p>
<p>Nginx <code>root</code> must point to <strong><code>$PROJ/frontend/build</code></strong></p>

</div>

---

<div align="center">

## 2. Routes & APIs

<table>
<thead>
<tr>
<th align="center">Route</th>
<th align="center">Capability</th>
<th align="center">Upstream</th>
</tr>
</thead>
<tbody>
<tr>
<td align="center"><code>/</code></td>
<td align="center">Raw data query</td>
<td align="center">Flask <code>:5000</code></td>
</tr>
<tr>
<td align="center"><code>/dashboard</code></td>
<td align="center">Aggregated charts</td>
<td align="center">Go <code>:5001</code> <code>/api/dashboard/</code></td>
</tr>
<tr>
<td align="center"><code>/autopipe</code></td>
<td align="center">Scheduled tasks</td>
<td align="center">Go <code>:5001</code> <code>/api/autopipe/</code></td>
</tr>
<tr>
<td align="center"><code>/dispatch-access</code></td>
<td align="center">Token import / Track API</td>
<td align="center">Flask + Go</td>
</tr>
<tr>
<td align="center"><code>/benchmark</code></td>
<td align="center">AppsFlyer public Benchmark</td>
<td align="center">Go <code>:5001</code> <code>/api/dashboard/benchmark/</code></td>
</tr>
<tr>
<td align="center"><code>/app-estimator</code></td>
<td align="center">Ratings → download estimates</td>
<td align="center">Go <code>:5001</code> <code>/api/app-estimator/</code></td>
</tr>
<tr>
<td align="center"><code>/apps</code></td>
<td align="center">Store app search</td>
<td align="center">Scraper <code>:3001</code></td>
</tr>
<tr>
<td align="center"><code>/account</code></td>
<td align="center">Account &amp; teams</td>
<td align="center">Flask <code>:5000</code></td>
</tr>
<tr>
<td align="center">Gochat drawer</td>
<td align="center">MiMo chat</td>
<td align="center">Go <code>:5002</code></td>
</tr>
</tbody>
</table>

</div>

---

<div align="center">

## 3. Nginx Routing

<p>See <code>nginx_server.conf</code> (more specific <code>location</code> blocks first)</p>

<table>
<thead>
<tr>
<th align="center">Path prefix</th>
<th align="center">Port</th>
<th align="center">Notes</th>
</tr>
</thead>
<tbody>
<tr>
<td align="center"><code>/api/dashboard/</code>, <code>/api/autopipe/</code></td>
<td align="center">5001</td>
<td align="center">AutoPipe Runner</td>
</tr>
<tr>
<td align="center"><code>/api/app-estimator</code></td>
<td align="center">5001</td>
<td align="center">App Estimator</td>
</tr>
<tr>
<td align="center"><code>/api/conversations</code>, <code>/api/chat/</code></td>
<td align="center">5002</td>
<td align="center">Gochat</td>
</tr>
<tr>
<td align="center"><code>/api/appstore/</code>, <code>/api/app/</code>, <code>/api/apps/</code></td>
<td align="center">3001</td>
<td align="center">Scraper (optional)</td>
</tr>
<tr>
<td align="center"><code>/api/</code>, <code>/socket.io/</code></td>
<td align="center">5000</td>
<td align="center">Flask fallback</td>
</tr>
<tr>
<td align="center"><code>/</code></td>
<td align="center">—</td>
<td align="center"><code>frontend/build</code> SPA static</td>
</tr>
</tbody>
</table>

<p>Before go-live: update <code>server_name</code>, <code>root</code>, CORS if needed</p>

</div>

```bash
cd "$PROJ" && sudo bash scripts/update_nginx.sh
```

---

<div align="center">

## 4. Environment Variables

<p>Create <strong><code>/etc/appsflyer/backend.env</code></strong> and <code>chmod 600</code></p>
<p>Full reference: <a href="./ENVIRONMENT.md">ENVIRONMENT.md</a></p>

</div>

```env
# Core
JWT_SECRET_KEY=<strong-random-secret>
DB_HOST=127.0.0.1
DB_USER=root
DB_PASSWORD=<mysql-password>
DB_NAME=appsflyer_rawdata
IS_LOCAL=false
FLASK_ENV=production
FLASK_DEBUG=0

# Gochat
PG_HOST=127.0.0.1
PG_PORT=5432
PG_USER=postgres
PG_PASSWORD=<pg-password>
PG_DB=gochat_db

# Gochat upstream (required in production — no default key in code)
# MIIMO_API_KEY=
# MIIMO_BASE_URL=

# CORS (production)
# CORS_ORIGIN=https://your.domain.example
# CORS_ORIGINS=https://your.domain.example

# App Estimator (adjust paths for your server)
APP_ESTIMATOR_DB_PATH=/opt/openclaw/skills/app-download-estimator/data/app_estimator.db
APP_ESTIMATOR_SKILL_ROOT=/opt/openclaw/skills/app-download-estimator
APP_ESTIMATOR_SCRIPTS_DIR=$PROJ/backend/scripts
APP_ESTIMATOR_PIPELINE_ENABLED=true
APP_ESTIMATOR_PIPELINE_INTERVAL_SEC=300

# Benchmark cache (optional)
# REDIS_ADDR=127.0.0.1:6379
```

<div align="center">

<p>Flask, <code>:5001</code>, and <code>:5002</code> must share the same <strong><code>JWT_SECRET_KEY</code></strong></p>
<p>systemd &amp; SMTP: <code>backend/systemd/README.md</code></p>

</div>

---

<div align="center">

## 5. Deployment Steps

</div>

```bash
export PROJ=/opt/appsflyer

# 1. System deps: Node 18+, Python 3.9+, Go 1.21+, MySQL, (Gochat) PostgreSQL, Nginx

# 2. Python venv
cd "$PROJ/backend"
python3 -m venv venv && source venv/bin/activate && pip install -r requirements.txt

# 3. Database (first time)
sudo bash init_db_server.sh --env-file /etc/appsflyer/backend.env --with-pg
python3 check_db_schema.py

# 4. Frontend build
cd "$PROJ/frontend" && npm ci && npm run build

# 5. systemd + compile Go
cd "$PROJ/backend"
sudo cp systemd/*.service /etc/systemd/system/   # adjust User / WorkingDirectory
sudo systemctl daemon-reload
sudo systemctl enable appsflyer-backend appsflyer-ai-chat
sudo bash restart_backend.sh

# 6. Nginx
cd "$PROJ" && sudo bash scripts/update_nginx.sh
```

<div align="center">

### After code updates

</div>

```bash
cd "$PROJ/backend" && sudo bash restart_backend.sh
```

<div align="center">

<p>Rebuilds <code>autopipe_runner</code> &amp; <code>ai_chat_service</code>, restarts both units, waits for <code>:5001/health</code></p>

<p>If <code>:5001</code> still fails:</p>

</div>

```bash
sudo bash start_autopipe.sh && tail -80 /tmp/go_runner.log
```

---

<div align="center">

## 6. Process Model

<table>
<thead>
<tr>
<th align="center">systemd unit</th>
<th align="center">Contents</th>
<th align="center">Port</th>
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

<p><strong><code>start_services_optimized.sh</code> order:</strong></p>

<p>1. Go <code>:5001</code> first — Dashboard / AutoPipe / Benchmark / App Estimator<br />
2. Scraper <code>:3001</code> — failure warns only, does not block<br />
3. Flask <code>:5000</code> — script exits on failure</p>

<p>Logs: <code>journalctl -u appsflyer-backend -f</code> · Go detail: <code>/tmp/go_runner.log</code></p>

<p>Without Scraper: Apps Finder unavailable; other modules work. Use systemd in production, not <code>nohup</code>.</p>

</div>

---

<div align="center">

## 7. App Estimator

<p>Read-only SQLite at <code>APP_ESTIMATOR_DB_PATH</code>, written by OpenClaw skill / scripts</p>
<p>Built-in pipeline (<code>APP_ESTIMATOR_PIPELINE_ENABLED=true</code>): collect → velocity → K calibration → batch estimate</p>
<p>Status: <code>GET /api/app-estimator/pipeline</code></p>
<p>Confirm skill directory and DB file exist on server before deploy</p>

</div>

---

<div align="center">

## 8. Health Checks

</div>

```bash
curl -sf http://127.0.0.1:5000/health
curl -sf http://127.0.0.1:5001/health
curl -sf http://127.0.0.1:5001/api/app-estimator/health
curl -sf http://127.0.0.1:5002/api/health
curl -sf http://127.0.0.1:3001/health    # when Scraper enabled
```

<div align="center">

<p>Via Nginx: login, Dashboard, App Estimator Overview, Gochat send/receive</p>

</div>

---

<div align="center">

## 9. Go-Live Checklist

<table>
<thead>
<tr>
<th align="center">#</th>
<th align="center">Item</th>
</tr>
</thead>
<tbody>
<tr><td align="center">1</td><td align="center"><code>$PROJ</code>, Nginx <code>root</code>, systemd <code>WorkingDirectory</code> aligned</td></tr>
<tr><td align="center">2</td><td align="center"><code>frontend/build</code> generated</td></tr>
<tr><td align="center">3</td><td align="center"><code>backend.env</code> configured; <code>JWT_SECRET_KEY</code> consistent across services</td></tr>
<tr><td align="center">4</td><td align="center"><code>check_db_schema.py</code> passes; PostgreSQL OK for Gochat</td></tr>
<tr><td align="center">5</td><td align="center"><code>:5000</code> / <code>:5001</code> / <code>:5002</code> health checks pass</td></tr>
<tr><td align="center">6</td><td align="center">Estimator SQLite path valid (if enabled)</td></tr>
<tr><td align="center">7</td><td align="center">Scraper <code>:3001</code> OK (Apps Finder only)</td></tr>
<tr><td align="center">8</td><td align="center">SMTP configured (if signup email verification enabled)</td></tr>
</tbody>
</table>

</div>

---

<div align="center">

## 10. Troubleshooting

<table>
<thead>
<tr>
<th align="center">Symptom</th>
<th align="center">Check</th>
</tr>
</thead>
<tbody>
<tr>
<td align="center">Dashboard / AutoPipe 502</td>
<td align="center"><code>curl :5001/health</code> · <code>tail /tmp/go_runner.log</code> · <code>restart_backend.sh</code></td>
</tr>
<tr>
<td align="center">App Estimator empty</td>
<td align="center"><code>APP_ESTIMATOR_DB_PATH</code> · pipeline API · run <code>batch_estimate_downloads.py</code></td>
</tr>
<tr>
<td align="center">Gochat fails</td>
<td align="center"><code>:5002</code> health · PostgreSQL · <code>MIIMO_*</code></td>
</tr>
<tr>
<td align="center">Apps Finder fails</td>
<td align="center"><code>:3001</code> · <code>Scraper-backend</code> deps</td>
</tr>
<tr>
<td align="center">401 after login</td>
<td align="center">Flask vs Go <code>JWT_SECRET_KEY</code> mismatch</td>
</tr>
</tbody>
</table>

<p>Database: <code>backend/database/README.md</code> · Email: <code>backend/systemd/README.md</code> §4</p>

<br />

<sub>AppsFlyer-API-Tools · Production Deployment</sub>

</div>
