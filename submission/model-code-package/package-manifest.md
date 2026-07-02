# package-manifest

## 包含范围

本目录只包含复赛评审需要查看的核心代码和说明：

- LLM 调用封装；
- OCR 证据转结构化菜谱；
- 当前步骤 AI 教练；
- 语音意图解析与 ASR 适配；
- 完成页 session 复盘模板；
- 示例输入输出；
- Prompt、架构、fallback 文档。

## 文件来源

| 代码包文件 | 来源 | 说明 |
|---|---|---|
| `src/llm/llm-client.ts` | `server/llm.ts` | 大模型通用调用，支持 DeepSeek / Lanxin / MiniMax |
| `src/video-recipe/demoAnalyze.ts` | `server/demoAnalyze.ts` | 演示 transcript 结构化菜谱链路 |
| `src/video-recipe/localVideoAnalyze.ts` | `server/localVideoAnalyze.ts` | 本地视频抽帧、OCR 证据、大模型结构化主链路 |
| `src/video-recipe/ocr-evidence.ts` | `server/ocr.ts` | OCR 调用、OCR 结果清洗、证据文本整理 |
| `src/video-recipe/recipe-normalize.ts` | 说明性摘录 | 解释 schema 校验和标准化规则 |
| `src/ai-coach/current-step-coach.ts` | `server/demoCoach.ts` | 当前步骤 AI 教练问答 |
| `src/ai-coach/session-review.ts` | `src/App.tsx` 中完成页逻辑整理 | 本地 session 复盘模板，未伪装成 LLM |
| `src/voice/intent-parser.ts` | `src/features/kitchen/voiceIntent.ts` | ASR 文本到本地动作/问题的规则解析 |
| `src/voice/asr-adapter.ts` | `server/asr.ts` | vivo ASR WebSocket 适配 |
| `src/llm/prompts.ts` | 说明性整理 | Prompt 摘要，便于评委快速阅读 |
| `src/llm/schemas.ts` | 说明性整理 | LLM 输入输出 schema 摘要 |

## 明确排除

- 完整前端 UI；
- 数据库；
- 上传视频和抽帧图片；
- Android 工程和构建产物；
- `node_modules`；
- 真实密钥或 `.env`；
- 旧 DemoFlow 备份文件。
