# 豆包与 DeepSeek 账户配置

1. 在火山控制台开通豆包流式 ASR 2.0 时长版，资源 ID 为 `volc.seedasr.sauc.duration`。
2. 开通 BigTTS，并在应用内确认 Vivi 2.0 `zh_female_vv_uranus_bigtts` 已授权。当前计划资源 ID 为 `volc.service_type.10029`；如果控制台提示音色与 SKU 不匹配，停止真实调用并按账户实际 SKU 重新审批，不在代码里轮询资源 ID。
3. 新控制台 ASR 将 `X-Api-Key` 写入 `DOUBAO_ASR_API_KEY`；否则配置 `DOUBAO_SPEECH_APP_ID` 与 `DOUBAO_SPEECH_ACCESS_TOKEN`。TTS 使用后两项。
4. 配置 DeepSeek `DEEPSEEK_API_KEY`，模型保持 `deepseek-v4-flash`。代码强制 `thinking: { type: "disabled" }`。
5. 将 Web、Express 和 Capacitor 的准确 Origin 写入 `VOICE_ALLOWED_ORIGINS`，禁止 `*`。
6. 现有 vivo OCR 值由所有者在本机复制到 `OCR_VIVO_APP_ID`/`OCR_VIVO_APP_KEY`，不要把 Secret 发到聊天或提交 Git。
7. 开发期保持 `.env.example` 的日限额与总软预算 ¥5；不启用自动充值，不购买大额资源包。

当前实现不会自动调用真实服务做验收。先用测试验证协议，再由所有者在控制台确认权限、余额和告警后手动测试。
