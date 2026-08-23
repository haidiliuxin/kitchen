# 实时语音隐私与日志

- 唤醒前音频不离开 Android 设备。
- ASR PCM 和 TTS PCM 只在内存中流转，不写磁盘、SQLite、预算文件或日志。
- 日志只允许随机 request ID、状态、耗时、字节数、token/字符数和错误类别；禁止记录密钥、票据、完整转写、问题、回答或上游原始响应。
- `data/voice-usage.json` 仅含日期、ASR 毫秒、DeepSeek token、TTS 字符和估算费用。
- App 后台、页面离开、权限撤销、音频焦点丢失或用户停止时必须释放 `AudioRecord`、`AudioTrack` 和上下游连接。
- 发现凭据、音频或日常完整转写泄漏时，立即停止验证并由所有者撤销相关凭据。
