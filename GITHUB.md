# 推送到 GitHub 操作指南

按顺序执行。工作目录均为项目根目录：

```bash
cd /Users/Zhuanz/Documents/AppsFlyer_RAWDATA_WEB2_Update_Develop
```

---

## 1. 推送前应包含的文件

| 类别 | 路径 | 说明 |
|------|------|------|
| 文档 | `README.md`、`DEPLOY.md`、`ENVIRONMENT.md`、`GITHUB.md` | 部署与环境说明 |
| 启动脚本 | `start.sh`、`scripts/` | 本地/生产脚本 |
| Nginx | `nginx_server.conf` | 模板（已占位化域名） |
| 后端 Python | `backend/*.py`、`backend/database/`、`backend/migrations/`、`backend/config/` | 业务与 schema |
| 后端 Go | `backend/*.go`、`backend/go.mod`、`backend/go.sum` | 源码与依赖锁定 |
| 后端脚本 | `backend/scripts/`、`backend/*.sh`、`backend/systemd/`、`backend/Makefile` | 初始化与运维 |
| 配置模板 | `backend/.env.example`、`frontend/Scraper-backend/env.example` | **仅模板，无密钥** |
| 前端 | `frontend/src/`、`frontend/public/`、`frontend/package.json`、`frontend/package-lock.json` 等 | 不含 `build/` |
| Scraper | `frontend/Scraper-backend/*.js`、`package.json`、`README.md` | 不含 `node_modules/` |
| 根依赖 | `package.json`、`package-lock.json`（可选） | 根目录少量共享依赖 |
| 类型 | `pyrightconfig.json`、`typings/`（如有） | 开发辅助 |

---

## 2. 切勿推送的文件

| 路径 | 原因 |
|------|------|
| `backend/.env`、`frontend/.env` | 含密码、API Key |
| `**/node_modules/` | 体积大，用 `npm ci` 安装 |
| `frontend/build/` | 构建产物，服务器上 `npm run build` |
| `backend/vendor/` | ~237MB，部署时 `go mod download` |
| `backend/bin/`、`backend/autopipe_runner` | 编译二进制 |
| `**/__pycache__/`、`backend/temp/` | 缓存与临时文件 |
| `.DS_Store`、`.vscode/` | 本机环境 |

已由根目录 `.gitignore` 排除（推送前确认该文件存在）。

---

## 3. 推送前检查（必做）

```bash
cd /Users/Zhuanz/Documents/AppsFlyer_RAWDATA_WEB2_Update_Develop

# 确认 .gitignore 存在
test -f .gitignore && echo "OK: .gitignore"

# 确认敏感 env 不会被加入
git check-ignore -v backend/.env frontend/.env 2>/dev/null || true

# 预览将要提交的内容（不应出现 .env、node_modules、vendor、build）
git status

# 若曾误 add 过大目录，先取消跟踪：
# git rm -r --cached backend/vendor frontend/node_modules frontend/build 2>/dev/null || true
```

**安全提醒：** 当前 `git remote -v` 里若 `origin` 带有 GitLab Token，请勿把该 URL 提交到公开仓库；建议在 GitLab 轮换 Token，GitHub 使用 SSH 或凭据管理器。

---

## 4. 在 GitHub 创建空仓库

1. 打开 https://github.com/new  
2. Repository name：例如 `AppsFlyer-RAWDATA-Workbench`  
3. **不要**勾选 “Add a README” / “Add .gitignore”（本地已有）  
4. 创建后记下：`https://github.com/<你的用户名>/<仓库名>.git`

---

## 5. 提交本地更改

```bash
cd /Users/Zhuanz/Documents/AppsFlyer_RAWDATA_WEB2_Update_Develop

# 加入所有应跟踪文件（.gitignore 会自动排除禁止项）
git add .

# 再次确认 staged 列表无敏感文件
git diff --cached --stat

# 提交（按实际改动调整说明）
git commit -m "$(cat <<'EOF'
feat: workbench modules, deploy docs, and env configuration guide

Add App Estimator, Gochat, Benchmark, AutoPipe; sanitize secrets; document local and production env setup.
EOF
)"
```

若提示 `nothing to commit`，说明已提交过，可跳到第 6 步。

---

## 6. 添加 GitHub 远程并推送

**方式 A：保留 GitLab `origin`，新增 `github` 远程（推荐）**

```bash
git remote add github https://github.com/<你的用户名>/<仓库名>.git
# 或使用 SSH：
# git remote add github git@github.com:<你的用户名>/<仓库名>.git

git push -u github main
```

**方式 B：仅用 GitHub 作为主远程**

```bash
git remote rename origin gitlab    # 可选：保留旧 GitLab 地址
git remote add origin https://github.com/<你的用户名>/<仓库名>.git
git push -u origin main
```

首次推送若 GitHub 默认分支为 `master` 而本地为 `main`：

```bash
git push -u github main:main
```

---

## 7. 推送后验证

在 GitHub 网页上确认：

- [ ] 有 `ENVIRONMENT.md`、`DEPLOY.md`、`backend/.env.example`
- [ ] **没有** `backend/.env`、`frontend/.env`
- [ ] **没有** `node_modules/`、`frontend/build/`、`backend/vendor/`
- [ ] `nginx_server.conf` 中为占位域名，非真实生产 IP

克隆验证（另一目录）：

```bash
cd /tmp
git clone https://github.com/<你的用户名>/<仓库名>.git test-clone
cd test-clone
ls backend/.env.example ENVIRONMENT.md
# 不应存在 backend/.env
```

---

## 8. 新环境从 GitHub 拉取后的安装

```bash
git clone https://github.com/<你的用户名>/<仓库名>.git
cd <仓库名>

cp backend/.env.example backend/.env    # 本地开发再编辑
cd backend && python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
go mod download

cd ../frontend && npm ci
cd Scraper-backend && npm ci   # Apps Finder 需要时

# 详见 ENVIRONMENT.md、README.md
```

---

## 9. 相关文档

- 环境变量：[ENVIRONMENT.md](./ENVIRONMENT.md)
- 生产部署：[DEPLOY.md](./DEPLOY.md)
- 项目概览：[README.md](./README.md)
