# Scraper Backend - Unified App Store & Google Play API

一个统一的 Node.js 后端服务，集成了 [app-store-scraper](https://github.com/facundoolano/app-store-scraper) 和 `google-play-scraper` 功能，提供跨平台的应用数据查询服务。

## 🚀 功能特性

- **双平台支持**: 同时支持 iOS App Store 和 Google Play
- **统一API**: 提供跨平台的应用查询接口
- **智能检测**: 自动识别应用所属平台
- **智能 ID 解析**: 自动识别和转换各种格式的应用标识符
- **完整数据**: 支持应用详情、评论、评分、版本历史等
- **限流保护**: 内置请求限流，防止被平台封禁
- **错误重试**: 自动重试机制，提高成功率

## 📦 安装依赖

```bash
npm install
```

## 🏃‍♂️ 启动服务

```bash
# 开发模式
npm run dev

# 生产模式
npm start
```

## 🧪 测试功能

```bash
# 测试 Google Play API
npm test

# 测试 App Store API
npm run test:appstore

# 测试智能 ID 解析功能
npm run test:id-parsing

# 测试所有功能
npm run test:all
```

## 🍎 App Store API 端点

### 智能 ID 解析

后端自动识别和转换各种格式的应用标识符：

- **纯数字 App Store ID**: `1488296980` → 直接查询
- **带前缀的数字 ID**: `id1488296980`, `app1488296980`, `store1488296980` → 提取数字部分查询
- **Bundle ID 格式**: `com.example.app` → 直接查询
- **App Store URL**: `https://apps.apple.com/us/app/bybit-buy-bitcoin-crypto/id1488296980` → 提取 ID 查询
- **短链接**: `https://appsto.re/app/1488296980` → 提取 ID 查询
- **应用名称**: `bybit crypto app` → 执行搜索

### 应用详情
```
GET /api/appstore/app/:identifier
```
- `identifier`: Bundle ID、App Store ID、URL 或应用名称
- `country`: 国家代码 (默认: us)
- `lang`: 语言代码 (默认: en)

### 应用搜索
```
GET /api/appstore/search?term=:term&country=:country&lang=:lang&num=:num
```
- `term`: 搜索关键词
- `country`: 国家代码 (默认: us)
- `lang`: 语言代码 (默认: en)
- `num`: 结果数量 (默认: 20)

### 开发者应用
```
GET /api/appstore/developer/:devId?country=:country&lang=:lang
```
- `devId`: 开发者 ID
- `country`: 国家代码 (默认: us)
- `lang`: 语言代码 (默认: en)

### 应用评论
```
GET /api/appstore/reviews/:identifier?country=:country&page=:page&sort=:sort
```
- `identifier`: Bundle ID 或 App ID
- `country`: 国家代码 (默认: us)
- `page`: 页码 (默认: 1)
- `sort`: 排序方式 (recent/helpful)

### 应用评分
```
GET /api/appstore/ratings/:identifier?country=:country
```
- `identifier`: Bundle ID 或 App ID
- `country`: 国家代码 (默认: us)

### 版本历史
```
GET /api/appstore/version-history/:identifier
```
- `identifier`: Bundle ID 或 App ID

### 搜索建议
```
GET /api/appstore/suggest?term=:term
```
- `term`: 搜索关键词

### 相似应用
```
GET /api/appstore/similar/:identifier?country=:country
```
- `identifier`: Bundle ID 或 App ID
- `country`: 国家代码 (默认: us)

### 隐私信息
```
GET /api/appstore/privacy/:identifier
```
- `identifier`: Bundle ID 或 App ID

## 🤖 Google Play API 端点

原有的 Google Play API 端点保持不变，位于 `/api/` 路径下：

- `GET /api/app/:appId` - 应用详情
- `GET /api/search` - 应用搜索
- `GET /api/developer/:devId` - 开发者应用
- `GET /api/reviews/:appId` - 应用评论
- `GET /api/ratings/:appId` - 应用评分
- `GET /api/categories` - 应用分类
- `GET /api/trends` - 市场趋势

## 🔗 统一 API 端点

### 跨平台应用查询
```
GET /api/unified/app/:identifier?platform=:platform&country=:country&lang=:lang
```
- `identifier`: 应用标识符
- `platform`: 平台 (auto/ios/android，默认: auto)
- `country`: 国家代码 (默认: us)
- `lang`: 语言代码 (默认: en)

**特性**:
- 自动检测平台
- 智能回退机制
- 统一响应格式

## 🌍 支持的国家和语言

### 国家代码
- `us` - 美国
- `cn` - 中国
- `jp` - 日本
- `kr` - 韩国
- `gb` - 英国
- `de` - 德国
- `fr` - 法国
- `ca` - 加拿大
- `au` - 澳大利亚
- `br` - 巴西

### 语言代码
- `en` - 英语
- `zh` - 中文
- `ja` - 日语
- `ko` - 韩语
- `de` - 德语
- `fr` - 法语
- `es` - 西班牙语
- `pt` - 葡萄牙语

## ⚡ 限流设置

- **窗口时间**: 1分钟
- **最大请求数**: 30次/分钟
- **重试机制**: 自动重试2次
- **延迟策略**: 随机延迟0.5-1.5秒

## 🔧 环境变量

创建 `.env` 文件：

```env
PORT=3001
NODE_ENV=development
```

## 📊 响应格式

### 成功响应
```json
{
  "success": true,
  "data": {...},
  "platform": "ios|android",
  "total": 10
}
```

### 错误响应
```json
{
  "success": false,
  "error": "错误描述",
  "platform": "ios|android"
}
```

## 🧪 测试

```bash
npm test
```

## 📝 许可证

MIT License

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📚 相关项目

- [app-store-scraper](https://github.com/facundoolano/app-store-scraper) - iOS App Store 数据抓取
- [google-play-scraper](https://github.com/facundoolano/google-play-scraper) - Google Play 数据抓取
