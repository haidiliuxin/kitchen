# Kitchen 实时语音架构

生产语音只有一条路径：Android 本地唤醒 → Kitchen WebSocket → 豆包 ASR 2.0 → 本地确定性意图或 DeepSeek V4 Flash → Kitchen SSE → 豆包 TTS V3 → Android `AudioTrack`。vivo 只保留视频 OCR，Whisper 只保留视频转写，二者不参与语音。

## 运行约束

- 默认不监听。用户主动开启后才请求麦克风权限。
- KWS 前音频只在设备内存中流转；ASR 音频也只在内存中转发，不落文件、数据库或日志。
- `VoiceController` reducer 是唯一语音状态来源。generation 会使旧网络回调、final、TTS 完成事件和计时器失效；final 用 generation + 规范化文本幂等。
- TTS 期间停止录音；页面离开、App 后台、停止按钮或新请求会同步中止网络和原生播放。
- 短对话窗口只运行本地 RMS VAD，检测到人声后才创建收费 ASR 会话。
- 系统 `SpeechRecognizer` 只能由用户点击“系统识别”启动，不承担持续唤醒。

## KWS 发布阻断

sherpa-onnx 代码/AAR 固定为 `1.13.5`，AAR 期望 SHA-256 为 `6419cd8bc983e0c4fab06067f0fe0313fdc0f7103818ac1e7a08d50787b7a82b`。候选模型权重和词表没有明确的模型专属再分发许可，因此仓库、构建缓存和 APK 都不包含模型。

Android 插件会检查 `assets/kws/model-manifest.json`、清单文件和 sherpa runtime。任何一项缺失均返回 `MODEL_MISSING`/`MODEL_INVALID`/`RUNTIME_MISSING`，不崩溃、不伪造唤醒。获得书面授权或换成自有合规模型后，再实现真实 spotter 初始化、清单 SHA 全量校验和真机阈值网格验收。

## 服务边界

- `/api/voice/session-ticket` 必须带现有 Bearer token、合法 Origin 和稳定 device ID；票据一次性、30 秒失效。
- `/api/voice/asr` 只接受 `pcm_s16le`、16 kHz、单声道。单帧不超过 6400 字节，总量不超过 640000 字节。
- 每用户和每设备只允许一个活动会话；服务总并发默认 2；每用户/设备每分钟默认 6 次。
- 上游地址在服务端硬编码为豆包/DeepSeek 官方域名，客户端不能传入 URL。
- `data/voice-usage.json` 只保存日期和数值用量，损坏时 fail-closed。默认日软预算 ¥5。

协议单元测试使用本地构造的帧，不调用付费服务。真实调用必须由所有者先确认 ASR 2.0、BigTTS、Vivi 2.0 权限和控制台 SKU。
