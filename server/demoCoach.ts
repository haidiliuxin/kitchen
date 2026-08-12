import { LOCAL_AI_UNAVAILABLE } from './ai.js'
import { callChatCompletion, getLlmRuntimeInfo } from './llm.js'

export type DemoCoachRequest = {
  recipeName: string
  currentStep: {
    title: string
    instruction: string
    tips: string[]
    commonMistakes: string[]
  }
  userQuestion: string
}

export type DemoCoachResponse = {
  status: 'success' | 'fallback'
  answer: string
  provider?: string
  model?: string
}

export async function getDemoCoachReply(context: DemoCoachRequest): Promise<DemoCoachResponse> {
  const question = context.userQuestion.trim().slice(0, 300)
  if (!question) {
    return { status: 'fallback', answer: '请先输入问题，比如“这一步火要多大？”' }
  }

  try {
    const answer = await callChatCompletion({
      messages: [
        {
          role: 'system',
          content: '你是做菜跟做页里的中文教练。不用 Markdown，用 80 至 250 个中文字符给出能立刻执行的保守建议。',
        },
        {
          role: 'user',
          content: [
            `菜谱：${context.recipeName.slice(0, 80)}`,
            `步骤：${context.currentStep.title.slice(0, 80)}`,
            `动作：${context.currentStep.instruction.slice(0, 400)}`,
            `提示：${context.currentStep.tips.slice(0, 5).join('；')}`,
            `常见错误：${context.currentStep.commonMistakes.slice(0, 5).join('；')}`,
            `问题：${question}`,
          ].join('\n'),
        },
      ],
      temperature: 0.2,
      maxTokens: Number(process.env.DEEPSEEK_MAX_OUTPUT_TOKENS ?? 320),
      timeoutMs: Number(process.env.DEEPSEEK_TIMEOUT_MS ?? 12_000),
    })
    const runtime = getLlmRuntimeInfo()
    return {
      status: 'success',
      answer: answer.trim().slice(0, 250),
      provider: runtime.provider,
      model: runtime.model,
    }
  } catch {
    return { status: 'fallback', answer: LOCAL_AI_UNAVAILABLE, provider: 'local' }
  }
}
