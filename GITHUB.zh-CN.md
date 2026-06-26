<div align="center">

# 推送到 GitHub 操作指南

### AppsFlyer-API-Tools

将本项目安全推送到 GitHub 的分步说明。

<br />

[**English**](./GITHUB.md) · **简体中文**

<br />

[**README**](./README.zh-CN.md) · [**环境配置**](./ENVIRONMENT.zh-CN.md) · [**生产部署**](./DEPLOY.zh-CN.md)

<br />

<p>工作目录：项目根目录</p>

</div>

---

<div align="center">

## 1. 推送前应包含的文件

<table>
<thead>
<tr>
<th align="center">类别</th>
<th align="center">路径</th>
<th align="center">说明</th>
</tr>
</thead>
<tbody>
<tr><td align="center">文档</td><td align="center"><code>README.md</code>、<code>DEPLOY.md</code>、<code>ENVIRONMENT.md</code></td><td align="center">部署与环境说明</td></tr>
<tr><td align="center">启动脚本</td><td align="center"><code>start.sh</code>、<code>scripts/</code></td><td align="center">本地/生产脚本</td></tr>
<tr><td align="center">Nginx</td><td align="center"><code>nginx_server.conf</code></td><td align="center">模板（已占位化域名）</td></tr>
<tr><td align="center">后端 Python</td><td align="center"><code>backend/*.py</code>、<code>database/</code>、<code>migrations/</code></td><td align="center">业务与 schema</td></tr>
<tr><td align="center">后端 Go</td><td align="center"><code>backend/*.go</code>、<code>go.mod</code>、<code>go.sum</code></td><td align="center">源码与依赖锁定</td></tr>
<tr><td align="center">配置模板</td><td align="center"><code>backend/.env.example</code></td><td align="center"><strong>仅模板，无密钥</strong></td></tr>
<tr><td align="center">前端</td><td align="center"><code>frontend/src/</code>、<code>package.json</code></td><td align="center">不含 <code>build/</code></td></tr>
<tr><td align="center">Scraper</td><td align="center"><code>frontend/Scraper-backend/</code></td><td align="center">不含 <code>node_modules/</code></td></tr>
</tbody>
</table>

</div>

---

<div align="center">

## 2. 切勿推送的文件

<table>
<thead>
<tr>
<th align="center">路径</th>
<th align="center">原因</th>
</tr>
</thead>
<tbody>
<tr><td align="center"><code>backend/.env</code>、<code>frontend/.env</code></td><td align="center">含密码、API Key</td></tr>
<tr><td align="center"><code>**/node_modules/</code></td><td align="center">体积大，用 <code>npm ci</code> 安装</td></tr>
<tr><td align="center"><code>frontend/build/</code></td><td align="center">构建产物，服务器上 <code>npm run build</code></td></tr>
<tr><td align="center"><code>backend/vendor/</code></td><td align="center">~200MB，部署时 <code>go mod download</code></td></tr>
<tr><td align="center"><code>backend/bin/</code>、编译二进制</td><td align="center">Go 构建产物</td></tr>
<tr><td align="center"><code>__pycache__/</code>、<code>.DS_Store</code></td><td align="center">缓存与本机文件</td></tr>
</tbody>
</table>

<p>已由根目录 <code>.gitignore</code> 排除（推送前确认该文件存在）</p>

</div>

---

<div align="center">

## 3. 推送前检查（必做）

</div>

```bash
cd /path/to/AppsFlyer_RAWDATA_WEB2_Update_Develop

test -f .gitignore && echo "OK: .gitignore"
git check-ignore -v backend/.env frontend/.env 2>/dev/null || true
git status
```

<div align="center">

<p><strong>安全提醒：</strong>勿在 remote URL 中嵌入 Token；GitHub 建议使用 SSH 或凭据管理器</p>

</div>

---

<div align="center">

## 4. 在 GitHub 创建空仓库

<p>1. 打开 <a href="https://github.com/new">github.com/new</a><br />
2. Repository name：<code>AppsFlyer-API-Tools</code><br />
3. <strong>不要</strong>勾选 README / .gitignore<br />
4. 记下：<code>https://github.com/&lt;用户名&gt;/&lt;仓库名&gt;.git</code></p>

</div>

---

<div align="center">

## 5. 提交并推送

</div>

```bash
git add .
git commit -m "feat: AppsFlyer workbench with Go services and deployment docs"

git remote add github https://github.com/Simon-sud/AppsFlyer-API-Tools.git
git push -u github main
```

<div align="center">

<p>若 <code>github</code> 远程已存在：<code>git push github main</code></p>

</div>

---

<div align="center">

## 6. 推送后验证

<table>
<thead>
<tr>
<th align="center">检查项</th>
<th align="center">预期</th>
</tr>
</thead>
<tbody>
<tr><td align="center">文档齐全</td><td align="center">有 <code>ENVIRONMENT.md</code>、<code>DEPLOY.md</code>、<code>backend/.env.example</code></td></tr>
<tr><td align="center">无敏感文件</td><td align="center">无 <code>.env</code>、<code>node_modules</code>、<code>vendor</code></td></tr>
<tr><td align="center">Nginx 配置</td><td align="center">仅为占位域名</td></tr>
</tbody>
</table>

</div>

```bash
git clone https://github.com/Simon-sud/AppsFlyer-API-Tools.git test-clone
ls test-clone/backend/.env.example
# 不应存在 backend/.env
```

---

<div align="center">

## 7. 新环境克隆后安装

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

<p>完整说明见 <a href="./ENVIRONMENT.zh-CN.md">ENVIRONMENT.zh-CN.md</a>、<a href="./README.zh-CN.md">README.zh-CN.md</a></p>

<br />

<sub>AppsFlyer-API-Tools · GitHub 工作流</sub>

</div>
