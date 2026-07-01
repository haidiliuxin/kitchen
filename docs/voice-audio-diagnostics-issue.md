# 语音识别诊断版问题记录

更新时间：2026-07-01

当前诊断分支：`codex/voice-audio-diagnostics`

最新诊断 APK：

`android/app/build/outputs/apk/debug/xiaobai-kitchen-speech-popup-diagnostic-20260701.apk`

## 已加入的诊断能力

- 在做菜页的语音控制区加入“语音服务状态”诊断面板。
- 支持刷新 Android 原生语音服务状态。
- 支持“测试监听 8 秒”，用于验证后台持续监听链路。
- 支持“测试朗读”，用于验证 TTS 文字朗读链路。
- 支持“系统弹窗测试”，通过 Android 系统语音识别弹窗验证系统语音服务是否可用。
- 对 `checkPermissions()`、`requestPermissions()`、`SpeechRecognition.start()` 加入超时提示，避免界面一直停留在“测试中”。

## 当前测试现象

用户在实体 Android 手机上测试时，诊断面板显示：

- 运行环境：Android 原生
- 识别模式：`native`
- `available`：`{"available":true}`
- 权限曾出现 `{"speechRecognition":"prompt"}`，说明系统仍处于待授权状态，未稳定进入 `granted`
- `getSupportedLanguages()` 失败，错误为 `Could not get list of languages`
- TTS 文字朗读此前已验证可用
- 后台持续监听没有收到 `partialResults`
- 用户反馈状态栏没有出现麦克风正在使用提示

## 初步判断

目前问题更像是 Android 系统语音识别服务或运行时权限链路没有真正进入收音阶段，而不是后端、AI 接口或 TTS 的问题。

关键依据：

- 后端和 AI 服务无关，因为语音识别在本地原生插件阶段就没有产生文本。
- `available=true` 只能说明系统存在语音识别能力，不代表当前服务可以正常返回结果。
- `speechRecognition=prompt` 表明应用还没有稳定拿到可用的语音识别权限。
- 没有状态栏麦克风提示，说明系统很可能没有真正启动录音输入。

## 下一步排查建议

1. 安装最新诊断 APK 后，先点“刷新状态”，再点“系统弹窗测试”。
2. 如果系统弹出语音识别窗口并能识别“下一步”，说明系统语音服务可用，后续应重点修持续监听模式。
3. 如果系统弹窗测试也无法弹出或无法识别，说明手机系统语音识别服务、语音助手或麦克风权限层存在问题。
4. 在手机系统设置中检查“小白下厨”的麦克风权限是否允许。
5. 检查系统是否安装并启用了语音识别/语音输入服务，例如系统语音助手、Google/Vivo/小米语音服务等。
6. 如仍失败，需要连接 Android Studio 或 `adb logcat` 获取原生错误码，例如 `ERROR_CLIENT`、`ERROR_AUDIO`、`ERROR_INSUFFICIENT_PERMISSIONS`、`ERROR_NO_MATCH` 等。

## 当前代码状态

已提交到 GitHub 分支：

`codex/voice-audio-diagnostics`

相关提交：

- `5db7e04 test: add voice audio diagnostics`
- `57c20df test: surface speech recognition startup timeouts`
- `c559d29 test: add speech recognition popup probe`
