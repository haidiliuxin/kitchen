# Whisper 转写服务

这个目录提供一个本地 `Whisper / faster-whisper` 转写服务，专门给主项目的 `VIDEO_TRANSCRIPT_WEBHOOK_URL` 使用。

## 能力

- 接收一个视频链接
- 使用 `yt-dlp` 抓取音频和元信息
- 使用本地 Whisper 做 ASR 转写
- 返回主项目能直接消费的 JSON：
  - `transcript`
  - `language`
  - `notes`
  - `title`
  - `description`
  - `content`

## 启动步骤

### 1. 安装依赖

在仓库根目录运行：

```powershell
npm run whisper:setup
```

### 2. 启动服务

```powershell
npm run whisper:start
```

默认地址：

```text
http://127.0.0.1:8790
```

健康检查：

```text
http://127.0.0.1:8790/health
```

## 主项目对接

把根目录 `.env` 里的：

```env
VIDEO_TRANSCRIPT_WEBHOOK_URL=http://127.0.0.1:8790/transcribe
```

配置好后，视频导入就会优先调用这个 Whisper 服务拿字幕。

## 可选环境变量

```env
WHISPER_MODEL_SIZE=small
WHISPER_DEVICE=cpu
WHISPER_COMPUTE_TYPE=int8
WHISPER_BEAM_SIZE=5
WHISPER_VAD_FILTER=true
YT_DLP_BINARY_PATH=E:\kitchen-helper\data\tools\yt-dlp.exe
WHISPER_CACHE_DIR=E:\kitchen-helper\tools\whisper-service\.cache
```

## 建议

- 第一次启动会下载 Whisper 模型，时间会比较长。
- 如果你主要跑中文做饭视频，`small` 是一个比较稳的起点。
- 如果之后觉得太慢，可以试 `base`；如果想要更高质量，可以试 `medium`。
