# 小白下厨 Kitchen Helper

面向厨房新手的全栈做饭陪练项目，提供菜谱浏览、分步跟做、AI 厨房教练、做菜历史记录、推荐菜谱，以及 Android App 封装能力。

这个仓库当前已经包含：

- Web 前端
- Node.js 后端 API
- SQLite 本地数据库
- DeepSeek 对话接入与降级兜底
- Capacitor Android 工程
- 可随包发布的离线步骤演示媒体资源

## 项目目标

这个项目希望解决“新手知道菜名，但不知道每一步到底做到什么程度”的问题。相比传统菜谱站，它更强调：

- 一步一屏的跟做体验
- 面向当前步骤的 AI 问答
- 语音辅助操作和朗读
- 历史记录与推荐闭环
- Web 与 Android 双端可运行

## 功能概览

当前版本已经实现：

- 菜谱列表、关键词搜索、难度与时长筛选
- 菜谱详情查询
- 跟做模式与步骤切换
- 每一步的提示、补救建议、替代食材说明
- AI 厨房教练问答接口
- 做菜完成记录写入 SQLite
- 基于历史记录的推荐菜谱
- 浏览器端语音识别与语音朗读
- Android 端 Capacitor 封装
- 本地离线媒体演示资源，避免依赖外部视频站

## 技术栈

前端：

- React 19
- TypeScript
- Vite

后端：

- Express 5
- Node.js

数据与 AI：

- SQLite
- DeepSeek Chat API
- 本地 Whisper 转写服务（可选，用于视频链接 ASR）

移动端：

- Capacitor Android
- `@capacitor-community/speech-recognition`
- `@capacitor-community/text-to-speech`

## 项目结构

```text
.
├─ src/                 前端源码
├─ server/              后端源码
├─ server-dist/         后端构建产物
├─ dist/                前端构建产物
├─ data/                SQLite 数据与种子内容
├─ public/media/        离线步骤演示媒体资源
├─ android/             Capacitor Android 工程
├─ docs/                补充文档
└─ README.md
```

## 核心页面与流程

主要用户流程如下：

1. 浏览菜谱并筛选出适合自己的菜
2. 进入跟做模式，一步一步推进
3. 随时询问“这一步做到什么程度算好”等问题
4. 通过语音或按钮切换步骤、朗读内容
5. 完成做菜后写入历史记录
6. 系统根据历史记录继续推荐下一道菜

## 本地开发

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

先复制一份环境变量模板：

```bash
cp .env.example .env
```

常用变量如下：

```bash
DEEPSEEK_API_KEY=your_key
DEEPSEEK_MODEL=deepseek-chat
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_TIMEOUT_MS=180000
PORT=8787
HOST=0.0.0.0
```

如果没有配置 DeepSeek Key，后端仍然可以启动，并回退到本地规则型回复逻辑。

### 3. 启动开发环境

```bash
npm run dev
```

这个命令会同时启动：

- 前端开发服务器：`http://localhost:5173`
- 后端开发服务器：`http://localhost:8787`

开发时前端通过 Vite 代理访问 `/api`。

## 生产构建与运行

### 构建

```bash
npm run build
```

会生成：

- 前端静态资源：`dist/`
- 后端产物：`server-dist/`

### 启动

```bash
npm run start
```

默认服务地址：

- `http://localhost:8787`

健康检查接口：

- `GET /api/health`

## 主要接口

当前后端提供这些核心接口：

- `GET /api/health`
- `GET /api/recipes`
- `GET /api/recipes/:recipeId`
- `GET /api/history`
- `POST /api/history`
- `GET /api/recommendations`
- `POST /api/assistant/reply`
- `POST /api/imports/from-link`

其中：

- `/api/recipes` 支持搜索、难度和时长筛选
- `/api/assistant/reply` 用于当前步骤的 AI 教练问答
- `/api/imports/from-link` 用于把文章或视频链接整理成菜谱
- `/api/health` 会返回数据库路径、AI 提供方、模型和时间戳

## 视频转攻略与 Whisper

如果你想让 B 站、抖音这类“平台字幕不稳定”的视频也尽量提取出完整步骤，建议启动本地 Whisper 转写服务。

仓库已经包含一套本地服务脚本，目录在：

- `tools/whisper-service/`

### 1. 安装 Whisper 服务依赖

```powershell
npm run whisper:setup
```

### 2. 启动 Whisper 服务

```powershell
npm run whisper:start
```

默认监听地址：

- `http://127.0.0.1:8790`

### 3. 主项目对接

根目录 `.env` 已支持这个配置：

```env
VIDEO_TRANSCRIPT_WEBHOOK_URL=http://127.0.0.1:8790/transcribe
```

当这个地址可用时，后端导入器会优先：

1. 把视频链接发给本地 Whisper 服务
2. 由 Whisper 服务用 `yt-dlp` 抓取音频
3. 做 ASR 转写
4. 把字幕和元信息返回给主项目
5. 再由主项目生成结构化做饭攻略

这样做的好处是：

- 不依赖平台是否公开字幕
- 对 B 站、抖音视频更稳
- Android 端以后也能直接复用这条后端能力

## 数据存储

SQLite 数据库文件位于：

- `data/kitchen.sqlite`

后端首次启动时会自动：

- 创建数据库和表结构
- 写入当前菜谱种子数据

## Android 支持

仓库已包含完整的 Android 工程：

- Android 工程目录：`android/`
- Capacitor 配置文件：`capacitor.config.ts`

### Android 打包前配置

Android 端不会直接运行 Node.js 后端，所以你需要让前端指向一个手机能访问到的 API 地址。

示例：

```bash
VITE_API_BASE_URL=http://你的局域网IP:8787
```

可参考：

- `.env.android.example`
- `.env.android`

### 同步 Android 资源

```bash
npm run android:sync
```

这个命令会：

1. 使用 Android 环境变量重新构建前端
2. 把构建结果同步进 Capacitor Android 工程

### 打开 Android Studio

```bash
npm run android:open
```

之后你可以在 Android Studio 中：

- 安装到真机或模拟器
- 构建 Debug APK
- 生成 Signed APK / AAB

### 当前 Android 侧已处理的兼容项

- Android Gradle Plugin 版本兼容问题已调整
- Gradle Wrapper 下载缓存问题可手动处理
- 允许本地开发阶段通过 HTTP 访问局域网后端
- 已加入录音权限与基础语音插件支持

## 离线媒体资源

为了避免外部视频站点在移动端被拦截或加载失败，项目已经把步骤演示升级为仓库内置的离线媒体资源。

当前资源目录：

- `public/media/`

这意味着：

- Web 端可以直接加载随项目发布的媒体
- Android 打包后也会把媒体一起带入安装包
- 不再依赖第三方视频页面跳转

## 语音能力说明

项目目前包含两类语音能力：

- 语音识别：用于说“下一步”“重复一遍”或直接提问
- 语音朗读：用于朗读当前步骤与 AI 提示

当前状态：

- Web 端语音识别与朗读已接入
- Android 端已接入 Capacitor 插件
- 不同手机厂商对系统语音服务的支持差异较大，部分设备仍可能出现识别服务不可用

如果 Android 真机语音识别失败，通常优先检查：

- 系统是否启用了语音输入服务
- 麦克风权限是否已授予
- Google 语音服务或厂商语音服务是否可用

## 已知优点

- 目标用户明确，场景聚焦
- 具备真实后端、数据库和 AI 闭环，不是纯静态原型
- Web 和 Android 两端共享主业务逻辑，迭代成本较低
- 已考虑外网不稳定场景，加入离线媒体和 AI 降级策略

## 当前限制

- 用户体系、多端同步、登录鉴权尚未实现
- Android 语音识别稳定性依赖系统服务
- 离线媒体资源目前更偏演示型，还不是完整真人教学素材库
- AI 厨房教练仍以步骤问答为主，缺少更强的状态感知
- 尚未做正式发布前的安全、日志和监控体系

## 推荐的下一步方向

- 补充用户登录、收藏、成长记录和多用户隔离
- 引入更完整的菜谱 CMS 或内容管理后台
- 扩展离线媒体资源，建立每道菜多步骤素材库
- 增强 Android 原生能力，提升语音与多媒体稳定性
- 引入图片识别，支持“我现在炒到这个样子对不对”
- 增加部署文档、CI/CD 与更完整的发布流程

## 常用命令

```bash
npm run dev
npm run build
npm run start
npm run android:sync
npm run android:open
npm run lint
```

## 文档

可进一步参考：

- `docs/android-release-guide.md`

## License

当前仓库未单独声明开源许可证。如需公开发布，建议补充明确的 License 文件。
