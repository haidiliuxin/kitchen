# 小白下厨 · 核心大模型调用代码包

## 1. 代码包用途

这是复赛提交用代码包，用于展示“小白下厨”的核心功能如何调用大模型。它不是完整项目源码，也不能单独代表可运行 App；它聚焦于：

- 视频/OCR 证据如何进入大模型；
- 大模型如何生成结构化菜谱 JSON；
- 当前步骤 AI 教练如何注入上下文并回答用户问题；
- Prompt、schema、fallback、语音意图路由如何设计；
- 哪些能力真实调用大模型，哪些能力是本地规则或兜底逻辑。

## 2. 核心能力总览

| 功能 | 输入 | 大模型任务 | 输出 | 对应文件 |
|---|---|---|---|---|
| 视频解析成菜谱 | OCR 文字证据 + 时间戳 + 关键帧 | 结构化生成菜谱 JSON | 食材、步骤、提醒、时间段 | `src/video-recipe/localVideoAnalyze.ts`, `src/llm/prompts.ts`, `src/llm/schemas.ts` |
| 当前步骤 AI 教练 | 当前菜谱 + 当前步骤 + 用户问题 | 生成解释/补救建议 | AI 回复 | `src/ai-coach/current-step-coach.ts` |
| 语音问题处理 | ASR 文本 | 问题类进入 AI 教练；命令类本地执行 | 回答或页面动作 | `src/voice/intent-parser.ts`, `src/voice/asr-adapter.ts` |
| 完成页复盘 | session 行为事件 | 当前为本地模板总结，不伪装成模型能力 | 小白点评 / 下次提醒 | `src/ai-coach/session-review.ts` |

## 3. 大模型调用链路

本地视频导入后，核心链路如下：

```text
OCR/字幕/画面文字证据
→ 证据清洗与合并
→ Prompt 构造
→ callChatCompletion()
→ JSON 输出
→ schema/字段校验
→ normalize
→ 前端一步一屏渲染
```

大模型只负责“非结构化证据 → 结构化菜谱”的生成。视频读取、抽帧、OCR 调用、时间轴限制、失败态处理由应用代码负责。

## 4. 当前步骤 AI 教练链路

```text
用户问题
→ 注入 recipeName / currentStep / tips / commonMistakes
→ callChatCompletion()
→ 返回页面对话区
→ 失败时使用本地模板 fallback
```

高频页面动作如“下一步”“播放视频”“计时三分钟”走本地规则，不等待大模型；做菜问题才进入 AI 教练。

## 5. 环境变量

见 `.env.example`。本代码包只展示字段名，不包含真实密钥。

常用字段：

```text
DEEPSEEK_API_KEY=
DEEPSEEK_BASE_URL=
DEEPSEEK_MODEL=
VIVO_OCR_APP_KEY=
VIVO_ASR_APP_KEY=
LANXIN_API_KEY=
LANXIN_APP_ID=
```

## 6. 如何阅读代码

建议评委按这个顺序阅读：

1. `src/llm/llm-client.ts`：统一的大模型调用封装。
2. `src/llm/prompts.ts`：视频转菜谱、当前步骤教练的 Prompt 设计摘要。
3. `src/llm/schemas.ts`：模型输入输出约束。
4. `src/video-recipe/localVideoAnalyze.ts`：真实本地视频 OCR 证据进入大模型的主链路。
5. `src/video-recipe/ocr-evidence.ts`：OCR 结果清洗与证据文本整理。
6. `src/ai-coach/current-step-coach.ts`：当前步骤 AI 教练问答。
7. `src/voice/intent-parser.ts`：语音识别文本如何分流为页面命令或问题。

## 7. 安全说明

本包不包含：

- 真实 API Key、token、密钥；
- `.env`；
- `data/kitchen.sqlite`；
- 上传视频；
- 临时抽帧图片；
- `node_modules`；
- `dist` 或 Android build 产物；
- 用户隐私数据；
- 本机绝对路径。

所有敏感配置只在 `.env.example` 中以空字段展示。
