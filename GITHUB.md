<div align="center">

# GitHub Push Guide

### AppsFlyer-API-Tools

Step-by-step guide to push this project to GitHub safely.

<br />

**English** · [**简体中文**](./GITHUB.zh-CN.md)

<br />

[**README**](./README.md) · [**Environment**](./ENVIRONMENT.md) · [**Deployment**](./DEPLOY.md)

<br />

<p>Working directory: project root</p>

</div>

---

<div align="center">

## 1. Files to Include

<table>
<thead>
<tr>
<th align="center">Category</th>
<th align="center">Paths</th>
<th align="center">Notes</th>
</tr>
</thead>
<tbody>
<tr><td align="center">Docs</td><td align="center"><code>README.md</code>, <code>DEPLOY.md</code>, <code>ENVIRONMENT.md</code></td><td align="center">Deployment &amp; env guides</td></tr>
<tr><td align="center">Scripts</td><td align="center"><code>start.sh</code>, <code>scripts/</code></td><td align="center">Local / production</td></tr>
<tr><td align="center">Nginx</td><td align="center"><code>nginx_server.conf</code></td><td align="center">Placeholder domains</td></tr>
<tr><td align="center">Backend Python</td><td align="center"><code>backend/*.py</code>, <code>database/</code>, <code>migrations/</code></td><td align="center">Business logic &amp; schema</td></tr>
<tr><td align="center">Backend Go</td><td align="center"><code>backend/*.go</code>, <code>go.mod</code>, <code>go.sum</code></td><td align="center">Source &amp; lockfile</td></tr>
<tr><td align="center">Config templates</td><td align="center"><code>backend/.env.example</code></td><td align="center"><strong>No secrets</strong></td></tr>
<tr><td align="center">Frontend</td><td align="center"><code>frontend/src/</code>, <code>package.json</code></td><td align="center">Exclude <code>build/</code></td></tr>
<tr><td align="center">Scraper</td><td align="center"><code>frontend/Scraper-backend/</code></td><td align="center">Exclude <code>node_modules/</code></td></tr>
</tbody>
</table>

</div>

---

<div align="center">

## 2. Never Push

<table>
<thead>
<tr>
<th align="center">Path</th>
<th align="center">Reason</th>
</tr>
</thead>
<tbody>
<tr><td align="center"><code>backend/.env</code>, <code>frontend/.env</code></td><td align="center">Passwords, API keys</td></tr>
<tr><td align="center"><code>**/node_modules/</code></td><td align="center">Large — use <code>npm ci</code></td></tr>
<tr><td align="center"><code>frontend/build/</code></td><td align="center">Build on server</td></tr>
<tr><td align="center"><code>backend/vendor/</code></td><td align="center">~200MB — use <code>go mod download</code></td></tr>
<tr><td align="center"><code>backend/bin/</code>, binaries</td><td align="center">Compiled artifacts</td></tr>
<tr><td align="center"><code>__pycache__/</code>, <code>.DS_Store</code></td><td align="center">Cache / local files</td></tr>
</tbody>
</table>

<p>Excluded by root <code>.gitignore</code> — confirm it exists before pushing</p>

</div>

---

<div align="center">

## 3. Pre-Push Checklist

</div>

```bash
cd /path/to/AppsFlyer_RAWDATA_WEB2_Update_Develop

test -f .gitignore && echo "OK: .gitignore"
git check-ignore -v backend/.env frontend/.env 2>/dev/null || true
git status
git diff --cached --stat   # after git add
```

<div align="center">

<p><strong>Security:</strong> Do not embed tokens in remote URLs. Use SSH or a credential manager for GitHub.</p>

</div>

---

<div align="center">

## 4. Create GitHub Repository

<p>1. Open <a href="https://github.com/new">github.com/new</a><br />
2. Name e.g. <code>AppsFlyer-API-Tools</code><br />
3. Do <strong>not</strong> add README / .gitignore (local copies exist)<br />
4. Note URL: <code>https://github.com/&lt;user&gt;/&lt;repo&gt;.git</code></p>

</div>

---

<div align="center">

## 5. Commit &amp; Push

</div>

```bash
git add .
git commit -m "feat: AppsFlyer workbench with Go services and deployment docs"

git remote add github https://github.com/Simon-sud/AppsFlyer-API-Tools.git
git push -u github main
```

<div align="center">

<p>If <code>github</code> remote exists: <code>git push github main</code></p>

</div>

---

<div align="center">

## 6. Post-Push Verification

<table>
<thead>
<tr>
<th align="center">Check</th>
<th align="center">Expected</th>
</tr>
</thead>
<tbody>
<tr><td align="center">Docs present</td><td align="center"><code>ENVIRONMENT.md</code>, <code>DEPLOY.md</code>, <code>backend/.env.example</code></td></tr>
<tr><td align="center">Secrets absent</td><td align="center">No <code>.env</code>, <code>node_modules</code>, <code>vendor</code></td></tr>
<tr><td align="center">Nginx config</td><td align="center">Placeholder domains only</td></tr>
</tbody>
</table>

</div>

```bash
cd /tmp
git clone https://github.com/Simon-sud/AppsFlyer-API-Tools.git test-clone
ls test-clone/backend/.env.example
# backend/.env should NOT exist
```

---

<div align="center">

## 7. Clone &amp; Install (new machine)

</div>

```bash
git clone https://github.com/Simon-sud/AppsFlyer-API-Tools.git
cd AppsFlyer-API-Tools

cp backend/.env.example backend/.env
cd backend && python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt && go mod download

cd ../frontend && npm ci
```

<div align="center">

<p>See <a href="./ENVIRONMENT.md">ENVIRONMENT.md</a> and <a href="./README.md">README.md</a> for full setup</p>

<br />

<sub>AppsFlyer-API-Tools · GitHub Workflow</sub>

</div>
