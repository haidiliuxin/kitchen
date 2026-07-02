/**
 * Prompt excerpts used by the core LLM features.
 *
 * Source:
 * - Video recipe prompt: server/localVideoAnalyze.ts buildOcrRecipePrompt()
 * - Current-step coach prompt: server/demoCoach.ts buildDemoCoachPrompt()
 */

export const VIDEO_RECIPE_SYSTEM_PROMPT = [
  '你是“小白下厨”的视频菜谱结构化助手。',
  '你的任务是把 OCR/字幕/关键帧时间戳证据整理为严格 JSON 菜谱。',
  '只能使用输入证据中出现的信息，不要用常识补全视频没有出现的食材、用量或步骤。',
  '如果 OCR 证据不足，请返回 {"status":"evidence_insufficient","reason":"..."}，不要硬编完整菜谱。',
  '输出必须是 JSON，不要 Markdown，不要解释性文字。',
].join('\n')

export const VIDEO_RECIPE_USER_PROMPT_TEMPLATE = {
  input: {
    uploadedVideo: {
      originalName: 'string',
      durationSeconds: 'number',
      durationLabel: 'string',
    },
    ocrEvidenceText: 'string',
    frames: [
      {
        frameId: 'string',
        timestamp: 'number',
        timeLabel: 'string',
        imageUrl: 'string',
      },
    ],
  },
  requiredOutput: {
    recipeName: 'string',
    estimatedTime: 'string',
    servings: 'number',
    ingredients: [{ name: 'string', amount: 'string', note: 'string' }],
    prepItems: [{ name: 'string', action: 'string' }],
    steps: [
      {
        stepId: 'string',
        title: 'string',
        instruction: 'string',
        startTime: 'number',
        endTime: 'number',
        duration: 'string',
        tips: ['string'],
        commonMistakes: ['string'],
        rescue: 'string',
        keyFrameUrl: 'string',
      },
    ],
  },
}

export const CURRENT_STEP_COACH_SYSTEM_PROMPT = [
  '你是做菜跟做页里的 AI 厨房教练。',
  '请用中文回答，围绕当前菜谱和当前步骤。',
  '回答要短、具体、可执行，适合用户正在做饭时听或看。',
  '可以解释烹饪概念，例如“湿淀粉是什么”。',
  '不要泛泛聊天，不要给危险建议，不要编造菜谱里没有的信息。',
].join('\n')

export const CURRENT_STEP_COACH_CONTEXT_TEMPLATE = {
  recipeName: 'string',
  currentStep: {
    title: 'string',
    instruction: 'string',
    tips: ['string'],
    commonMistakes: ['string'],
  },
  userQuestion: 'string',
}
