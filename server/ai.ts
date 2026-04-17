import { getAssistantReply } from '../src/lib/assistant.js'
import type { Recipe, Step } from '../src/types.js'

const deepseekBaseUrl = (process.env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com').replace(
  /\/$/,
  '',
)
const deepseekModel = process.env.DEEPSEEK_MODEL ?? 'deepseek-chat'
const requestTimeoutMs = Number(process.env.DEEPSEEK_TIMEOUT_MS ?? 20000)

type AssistantContext = {
  recipe: Recipe
  step: Step
  stepIndex: number
  question: string
}

type DeepSeekResponse = {
  choices?: Array<{
    message?: {
      content?: string
    }
  }>
}

export function isAiConfigured(): boolean {
  return Boolean(process.env.DEEPSEEK_API_KEY?.trim())
}

export function getAiRuntimeInfo() {
  return {
    configured: isAiConfigured(),
    provider: 'deepseek',
    model: deepseekModel,
    baseUrl: deepseekBaseUrl,
  }
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
  mode: 'deepseek' | 'fallback'
}> {
  const apiKey = process.env.DEEPSEEK_API_KEY?.trim()
  const fallbackAnswer = getFallbackAnswer(context)

  if (!apiKey) {
    return {
      answer: fallbackAnswer,
      mode: 'fallback',
    }
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs)

  try {
    const response = await fetch(`${deepseekBaseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: deepseekModel,
        temperature: 0.3,
        max_tokens: 400,
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
      }),
      signal: controller.signal,
    })

    if (!response.ok) {
      const raw = await response.text()
      throw new Error(`DeepSeek API ${response.status}: ${raw.slice(0, 400)}`)
    }

    const payload = (await response.json()) as DeepSeekResponse
    const answer = payload.choices?.[0]?.message?.content?.trim()

    if (!answer) {
      throw new Error('DeepSeek 返回了空内容。')
    }

    return {
      answer,
      mode: 'deepseek',
    }
  } catch (error) {
    console.error('DeepSeek request failed, falling back to local assistant:', error)
    return {
      answer: fallbackAnswer,
      mode: 'fallback',
    }
  } finally {
    clearTimeout(timeout)
  }
}
