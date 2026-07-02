# Fallback 策略说明

## 1. 视频证据不足

当 OCR 证据不足时，系统不要求大模型硬编。

策略：

- Prompt 明确要求返回 `status: "evidence_insufficient"`；
- 后端返回明确失败态或 fallback 态；
- 前端可以提示“证据不足，无法生成可靠菜谱”；
- 不把证据不足伪装成真实解析成功。

相关代码：

- `src/video-recipe/localVideoAnalyze.ts`
- `src/llm/prompts.ts`

## 2. 大模型调用失败

当 DeepSeek / Lanxin / MiniMax 调用失败、超时、未配置时：

- 返回可解释错误；
- 演示模式可以使用兜底菜谱；
- 必须在响应中标记 `fallback` 或在 evidence 中说明 `usedLLM: false`；
- 不应隐藏模型失败事实。

相关代码：

- `src/llm/llm-client.ts`
- `src/video-recipe/demoAnalyze.ts`
- `src/video-recipe/localVideoAnalyze.ts`

## 3. AI 教练失败

当前步骤 AI 教练失败时，页面不能崩溃。

策略：

- 使用当前步骤 `instruction`、`tips`、`commonMistakes` 生成本地模板回答；
- 对常见问题如“水淀粉是什么”“锅糊了怎么办”“太咸怎么办”有本地兜底；
- 返回 `status: "fallback"`。

相关代码：

- `src/ai-coach/current-step-coach.ts`

## 4. ASR 失败

ASR 失败时：

- 提示用户重新说；
- 保留手动按钮；
- 不阻塞做菜主流程；
- 高频命令仍可以通过屏幕按钮完成。

相关代码：

- `src/voice/asr-adapter.ts`
- `src/voice/intent-parser.ts`

## 5. 完成页复盘

完成页复盘当前为本地模板逻辑，不调用大模型。

原因：

- 更稳定；
- 不需要额外等待；
- 只基于真实 session 事件，不编造用户没有做过的行为。

相关代码：

- `src/ai-coach/session-review.ts`
