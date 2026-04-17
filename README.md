# 小白下厨 Full Stack MVP

面向厨房新手的做饭陪练 Web App，当前已经升级为前后端完整版本：

- 前端：React + TypeScript + Vite
- 后端：Express
- 数据库：SQLite（Node 24 内置 `node:sqlite`，数据库文件会落到 `data/kitchen.sqlite`）
- 接口：真实 REST API
- 大模型：DeepSeek Chat API
- 安卓壳：Capacitor

## 已实现能力

- 通过后端接口搜索和筛选菜谱
- 从数据库读取完整菜谱详情、步骤、补救建议和替代方案
- 一步一屏跟做模式
- 每一步的短视频教程位
- 浏览器语音朗读与语音翻步骤
- AI 教练问答接口
- 完成做菜后写入数据库历史记录
- 基于历史记录返回推荐菜谱

## 开发运行

```bash
npm install
npm run dev
```

`npm run dev` 会同时启动：

- 前端开发服务器：Vite
- 后端开发服务器：Express + SQLite

前端通过 Vite 代理访问 `/api`。

## 安卓应用

项目已经生成了 Capacitor Android 工程：

- Android 工程目录：`android/`
- Capacitor 配置：`capacitor.config.ts`

安卓包里的前端页面不会直接运行 Node 后端，所以你需要给前端配置一个可访问的后端地址。

### 安卓打包前需要配置

在本地环境里设置：

```bash
VITE_API_BASE_URL=https://你的后端域名
```

示例模板见：

- `.env.android.example`

如果你只是本机调试模拟器，也可以先临时用：

```bash
VITE_API_BASE_URL=http://10.0.2.2:8787
```

`10.0.2.2` 是 Android 模拟器访问宿主机 localhost 的地址。

### 安卓同步与打开

```bash
npm run android:sync
npm run android:open
```

这会：

1. 重新构建前端
2. 把 Web 资源同步进 `android/`
3. 打开 Android Studio 工程

然后你可以在 Android Studio 里：

- 运行到模拟器或真机
- 生成 APK 或 AAB

详细正式出包步骤见：

- [android-release-guide.md](E:/厨房助手/docs/android-release-guide.md)

### 重要说明

- 当前安卓 App 打包的是前端壳，后端仍然需要你单独部署
- 生产环境推荐用 `HTTPS` 后端地址
- 我已经为原型打开了 `cleartextTraffic`，方便你本地 HTTP 联调；正式发布前建议只保留 HTTPS

## 大模型配置

项目会从 `.env` 读取 DeepSeek 配置：

```bash
DEEPSEEK_API_KEY=your_key
DEEPSEEK_MODEL=deepseek-chat
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_TIMEOUT_MS=20000
```

如果 DeepSeek 接口异常，后端会自动退回本地规则型回复，保证做饭引导不中断。

## 生产构建与启动

```bash
npm run build
npm run start
```

构建后会生成：

- 前端静态文件：`dist/`
- 后端产物：`server-dist/`

## 主要接口

- `GET /api/health`
- `GET /api/recipes`
- `GET /api/recipes/:recipeId`
- `GET /api/history`
- `POST /api/history`
- `GET /api/recommendations`
- `POST /api/assistant/reply`

`GET /api/health` 里会返回当前 AI 提供方、模型和是否已配置密钥。

## 数据文件

- SQLite 数据库：`data/kitchen.sqlite`

后端首次启动时会自动建表并把当前菜谱种子数据写入数据库。

## 适合下一步继续接入的能力

- 用户登录与多用户隔离
- 真实大模型服务替代规则型 AI 回复
- 拍照识别当前步骤状态
- 菜谱 CMS 后台
- 收藏、购物清单、个性化推荐和成长体系
- Android 端语音识别改成原生插件以提升稳定性
