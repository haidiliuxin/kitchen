import { getAssistantReply } from '../src/lib/assistant.js'
import type { Recipe, Step } from '../src/types.js'
import { callChatCompletion, getLlmRuntimeInfo, isLlmConfigured, type LlmProvider } from './llm.js'

type AssistantContext = {
  recipe: Recipe
  step: Step
  stepIndex: number
  question: string
}

export function isAiConfigured(): boolean {
  return isLlmConfigured()
}

export function getAiRuntimeInfo() {
  return getLlmRuntimeInfo()
}

function buildSystemPrompt(): string {
  return [
    '你是一个给厨房新手做实时指导的中文做饭教练。',
    '你的目标是帮助用户把菜做成功，降低紧张感，回答要具体、稳妥、可执行。',
    '只根据提供的菜谱和当前步骤上下文回答，不要假装看到了图片或视频。',
    '如果用户的问题超出上下文，就明确说明你是基于当前菜谱做推断。',
    '优先给出火候、状态判断、常见错误、补救方式和食品安全提醒。',
    '语气温和、简洁，尽量控制在 120 个中文词以内。',
  ].join('')
}

function buildUserPrompt({ recipe, step, stepIndex, question }: AssistantContext): string {
  const nextStep = recipe.steps[stepIndex + 1]

  return [
    '下面是当前做饭上下文，请你基于它回答用户问题。',
    '',
    `菜名：${recipe.title}`,
    `菜谱说明：${recipe.description}`,
    `当前步骤序号：${stepIndex + 1}/${recipe.steps.length}`,
    `当前步骤标题：${step.title}`,
    `当前步骤动作：${step.instruction}`,
    `当前步骤细讲：${step.detail}`,
    `当前步骤观察重点：${step.sensoryCue}`,
    `当前步骤检查点：${step.checkpoints.join('；')}`,
    `当前步骤常见错误：${step.commonMistakes.join('；')}`,
    `可替代食材：${recipe.substitutions.map((item) => `${item.ingredient}->${item.replacement}`).join('；')}`,
    `常见补救：${recipe.rescueTips.map((tip) => `${tip.issue}:${tip.answer}`).join('；')}`,
    nextStep ? `下一步：${nextStep.title}，${nextStep.instruction}` : '下一步：已经是最后一步',
    '',
    `用户问题：${question}`,
  ].join('\n')
}

function getFallbackAnswer(context: AssistantContext): string {
  return getAssistantReply(
    context.recipe,
    context.step,
    context.stepIndex,
    context.question,
  )
}

export async function getKitchenCoachReply(context: AssistantContext): Promise<{
  answer: string
  mode: LlmProvider | 'fallback'
}> {
  const fallbackAnswer = getFallbackAnswer(context)

  if (!isAiConfigured()) {
    return {
      answer: fallbackAnswer,
      mode: 'fallback',
    }
  }

  try {
    const answer = await callChatCompletion({
      temperature: 0.3,
      maxTokens: 400,
      messages: [
        {
          role: 'system',
          content: buildSystemPrompt(),
        },
        {
          role: 'user',
          content: buildUserPrompt(context),
        },
      ],
    })

    return {
      answer,
      mode: getLlmRuntimeInfo().provider,
    }
  } catch (error) {
    console.error('LLM request failed, falling back to local assistant:', error)
    return {
      answer: fallbackAnswer,
      mode: 'fallback',
    }
  }
}
