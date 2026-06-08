# 小白下厨 Kitchen Helper

小白下厨是一款面向厨房新手的 AI 做饭陪练应用。项目把“选菜、备菜、跟做、求助、记录、推荐”串成一条完整链路，让用户不只是浏览菜谱，而是在厨房里一步一步把一道菜做完。

当前仓库包含 Web 前端、Node.js 后端、SQLite 数据库、链接导入与视频转攻略能力、本地 Whisper 转写服务，以及 Capacitor Android 工程。

## 核心能力

- 菜谱浏览、搜索、难度/时长筛选与热门菜品展示。
- 备菜模式：选择人数后自动换算食材数量，支持标记缺少食材并跳转买菜平台搜索。
- 跟做模式：一步一屏展示做法、计时器、状态判断、常见失误和补救建议。
- AI 厨房教练：围绕当前菜谱和当前步骤回答“做到什么程度算好”“太咸怎么办”等问题。
- 语音交互：支持“下一步”“上一步”“重复朗读”“计时 3 分钟”等免手触操作。
- 视频/文章导入：粘贴 B 站、抖音等链接后，后端提取标题、正文、字幕/ASR，并生成结构化菜谱。
- 可靠视频时间轴：优先使用平台字幕、章节或 Whisper ASR 时间戳，为每个步骤匹配可播放片段。
- 用户体系：支持登录 token、私有菜谱、公开菜谱、官方菜谱隔离。
- Android App：通过 Capacitor 封装，可在同 WiFi 下连接本机后端进行真机演示。

## 技术栈

前端：

- React 19
- TypeScript
- Vite
- Capacitor

后端：

- Node.js
- Express 5
- SQLite
- `yt-dlp`
- 本地 Whisper / faster-whisper 转写服务

AI：

- 蓝心大模型兼容接口
- MiniMax / 其他兼容模型可通过环境变量切换
- 本地规则兜底回复

Android：

- Capacitor Android
- `@capacitor-community/speech-recognition`
- `@capacitor-community/text-to-speech`

## 项目结构

```text
.
├─ src/                         Web 前端源码
│  ├─ features/kitchen/          核心业务页面与状态逻辑
│  └─ lib/                       API、助手函数
├─ server/                      Express 后端、数据库、AI、导入器
├─ tools/whisper-service/        本地 Whisper 转写服务
├─ data/                        SQLite 数据库与工具缓存
├─ public/                      静态资源
├─ android/                     Capacitor Android 工程
├─ docs/                        展示文档、路线图、截图资源
└─ README.md
```

## 核心流程

### 流程 1：从菜谱到做菜

1. 用户在首页搜索或筛选菜谱。
2. 进入菜谱详情，查看食材、步骤、替代方案和风险点。
3. 进入备菜页，选择几人份，系统换算食材数量。
4. 用户确认食材是否齐全，缺少食材时可跳转买菜平台搜索。
5. 进入跟做模式，按步骤推进。
6. 做饭过程中可语音切换步骤、朗读步骤、启动计时或向 AI 提问。
7. 完成后写入历史记录，并推荐下一道菜。

### 流程 2：从视频/文章生成做饭攻略

1. 用户粘贴 B 站、抖音或文章链接。
2. 后端使用页面解析、`yt-dlp`、字幕抓取和 Whisper ASR 获取内容。
3. AI 根据标题、正文、字幕、时间戳和视频元信息生成结构化菜谱。
4. 系统尽量为每个步骤匹配真实视频片段时间。
5. 用户保存生成结果，并像普通菜谱一样进入备菜和跟做。

## 本地开发

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

复制模板：

```bash
cp .env.example .env
```

常用配置：

```env
PORT=8787
HOST=0.0.0.0
AI_PROVIDER=lanxin
LANXIN_MODEL=Doubao-Seed-2.0-mini
VIDEO_TRANSCRIPT_WEBHOOK_URL=http://127.0.0.1:8790/transcribe
YT_DLP_BINARY_PATH=E:\kitchen-helper\data\tools\yt-dlp.exe
VITE_API_BASE_URL=http://你的电脑局域网IP:8787
```

不要把真实 API Key 提交到仓库。`.env.example` 只保留占位示例。

### 3. 启动 Web + 后端

```bash
npm run dev
```

默认地址：

- 前端：`http://localhost:5173`
- 后端：`http://localhost:8787`
- 健康检查：`http://localhost:8787/api/health`

## Whisper 视频转写服务

无字幕视频要生成可靠时间轴时，需要启动本地 Whisper 服务。

### 安装

```powershell
npm run whisper:setup
```

### 启动

```powershell
npm run whisper:start
```

默认地址：

- `http://127.0.0.1:8790`
- 健康检查：`http://127.0.0.1:8790/health`

工作方式：

1. 主后端把视频链接发给 Whisper 服务。
2. Whisper 服务使用 `yt-dlp` 抓取音频或媒体流。
3. 使用 faster-whisper 转写并返回带起止时间的 ASR 片段。
4. 主后端把 ASR 时间戳和菜谱步骤对齐，生成视频步骤片段。

## Android 真机演示

Android App 不内置 Node.js 后端，需要连接电脑或服务器上的后端。

### 1. 获取电脑局域网 IP

Windows PowerShell：

```powershell
Get-NetIPAddress -AddressFamily IPv4
```

例如电脑 IP 是 `10.130.125.11`，则 `.env` 中配置：

```env
VITE_API_BASE_URL=http://10.130.125.11:8787
```

手机和电脑必须在同一个 WiFi 下。

### 2. 启动后端

```powershell
$env:HOST="0.0.0.0"
$env:PORT="8787"
npx tsx server/index.ts
```

手机浏览器先测试：

```text
http://10.130.125.11:8787/api/health
```

如果打不开，通常是 Windows 防火墙拦截了 `8787` 端口。

### 3. 同步并打包 APK

```bash
npm run android:sync
```

然后在 Android 目录执行：

```powershell
cd android
.\gradlew.bat assembleDebug
```

Debug APK 路径：

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

## 主要接口

- `GET /api/health`：健康检查，返回数据库、AI、语音配置。
- `POST /api/auth/login`：注册或登录，返回 token。
- `GET /api/auth/me`：获取当前用户。
- `GET /api/recipes`：菜谱列表，支持搜索和筛选。
- `GET /api/recipes/:recipeId`：菜谱详情。
- `POST /api/recipes`：用户创建菜谱。
- `POST /api/recipes/:recipeId/visibility`：公开/私有切换。
- `POST /api/recipes/:recipeId/prep-plan`：按人数生成备菜计划。
- `POST /api/imports/from-link`：从链接导入并生成菜谱。
- `POST /api/imports/analyze`：导入链接并返回前端摘要。
- `POST /api/assistant/reply`：AI 厨房教练问答。
- `POST /api/voice/interpret`：语音文本解析。
- `GET /api/media/proxy`：代理平台视频流，提升 Android WebView 播放稳定性。
- `GET /api/history` / `POST /api/history`：做菜历史记录。

## 数据说明

SQLite 数据库：

```text
data/kitchen.sqlite
```

当前数据库包含：

- 官方菜谱
- 用户菜谱
- 导入菜谱
- 食材、步骤、视频时间轴、历史记录
- 用户、登录 token、公开/私有权限字段

## 当前已知限制

- Android 语音识别依赖系统语音服务，不同手机厂商表现可能不同。
- B 站和抖音视频直链可能过期，演示时建议保持后端在线并重新导入关键视频。
- 无字幕视频需要 Whisper，生成时间会更长。
- 当前买菜平台只做到跳转搜索，不会自动下单。
- 目前更适合比赛展示和原型验证，正式商用仍需要权限、安全、日志、监控和云端部署。

## 常用命令

```bash
npm run dev
npm run build
npm run build:client:android
npm run build:server
npm run android:sync
npm run android:open
npm run whisper:start
npm run lint
```

## 展示资源

`docs/` 目录中包含：

- 技术路线图
- 现有成果图
- PPT 手机截图资源
- 项目流程与展示文档

## License

当前仓库暂未声明开源许可证。如需公开发布或多人协作，建议补充明确的 License 文件。
