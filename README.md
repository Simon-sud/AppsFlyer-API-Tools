# AppsFlyer RAWDATA WEB2 前端项目

## 📋 项目简介

这是一个基于React和Ant Design的前端管理系统，用于管理AppsFlyer账户配置和报表数据。

## 🏗️ 项目结构

```
frontend/
├── src/
│   ├── components/     # 公共组件
│   ├── pages/         # 页面组件
│   ├── contexts/      # React Context
│   ├── utils/         # 工具函数
│   └── App.tsx        # 主应用组件
├── public/            # 静态资源
├── package.json       # 依赖配置
└── vite.config.ts     # Vite配置
```

## 🚀 快速开始

### 环境要求
- Node.js >= 16.0.0
- npm >= 8.0.0

### 安装依赖
```bash
cd frontend
npm install
```

### 开发环境运行
```bash
npm run dev
```

### 构建生产版本
```bash
npm run build
```

## 🔧 技术栈

- **前端框架**: React 18
- **构建工具**: Vite
- **UI组件库**: Ant Design
- **状态管理**: React Context + Hooks
- **路由**: React Router
- **HTTP客户端**: Axios
- **样式**: CSS-in-JS + 自定义CSS

## 📦 部署

### GitLab CI/CD 自动部署

项目已配置GitLab CI/CD，支持自动化构建和部署：

1. **推送代码到GitLab**
2. **自动触发构建流程**
3. **手动触发部署**（生产环境需要手动确认）

### 部署环境

- **测试环境**: develop分支自动部署
- **生产环境**: main分支手动部署

## 🔐 环境变量

在GitLab项目设置中配置以下环境变量：

### 生产环境
- `SSH_PRIVATE_KEY`: SSH私钥
- `DEPLOY_USER`: 部署用户名
- `DEPLOY_HOST`: 部署服务器地址
- `DEPLOY_PATH`: 部署路径
- `DEPLOY_URL`: 部署后的访问地址

### 测试环境
- `SSH_PRIVATE_KEY_STAGING`: 测试环境SSH私钥
- `DEPLOY_USER_STAGING`: 测试环境部署用户名
- `DEPLOY_HOST_STAGING`: 测试环境服务器地址
- `DEPLOY_PATH_STAGING`: 测试环境部署路径
- `DEPLOY_URL_STAGING`: 测试环境访问地址

## 📝 开发规范

- 使用TypeScript进行类型检查
- 遵循ESLint代码规范
- 组件使用函数式组件 + Hooks
- 样式优先使用Ant Design组件，必要时自定义CSS

## 🤝 贡献指南

1. Fork项目
2. 创建功能分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 创建Pull Request

## 📄 许可证

本项目采用MIT许可证 - 查看 [LICENSE](LICENSE) 文件了解详情
