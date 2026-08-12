import type { AssistantAnswer, AssistantUsage, CookingContext } from '../src/types.js'
import {
  DeepSeekLanguageModelProvider,
  LanguageModelError,
  getLlmRuntimeInfo,
  isLlmConfigured,
} from './llm.js'
import { VoiceBudgetError, voiceBudget } from './voiceBudget.js'

export const LOCAL_AI_UNAVAILABLE = '现在无法回答开放问题，本地步骤和计时仍可使用'

const emptyUsage = (): AssistantUsage => ({
  inputTokens: 0,
  outputTokens: 0,
  firstTokenMs: null,
  totalMs: 0,
  estimatedCostCny: 0,
})

export function isAiConfigured(): boolean {
  return isLlmConfigured()
}

export function getAiRuntimeInfo() {
  return getLlmRuntimeInfo()
}

function localAnswer(errorCategory: AssistantAnswer['errorCategory']): AssistantAnswer {
  return {
    answer: LOCAL_AI_UNAVAILABLE,
    provider: 'local',
    usage: emptyUsage(),
    errorCategory,
  }
}

export async function getKitchenCoachReply(
  context: CookingContext,
  question: string,
  signal: AbortSignal,
): Promise<AssistantAnswer> {
  try {
    await voiceBudget.assertAvailable('deepseek')
  } catch (error) {
    return localAnswer(error instanceof VoiceBudgetError ? 'budget_limited' : 'upstream')
  }

  try {
    const answer = await new DeepSeekLanguageModelProvider().answer(context, question, signal)
    await voiceBudget.recordDeepSeek(answer.usage.inputTokens, answer.usage.outputTokens)
    return answer
  } catch (error) {
    if (error instanceof LanguageModelError) {
      return localAnswer(error.category)
    }
    return localAnswer('upstream')
  }
}
