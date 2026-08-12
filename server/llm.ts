import type { AssistantAnswer, AssistantUsage, CookingContext } from '../src/types.js'

type ChatMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string
}

type StreamChunk = {
  choices?: Array<{ delta?: { content?: string } }>
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
  }
}

export type LlmProvider = 'deepseek'

export type LlmRuntimeInfo = {
  configured: boolean
  provider: LlmProvider
  model: string
  baseUrl: string
}

export type ChatCompletionOptions = {
  messages: ChatMessage[]
  temperature?: number
  maxTokens?: number
  jsonMode?: boolean
  timeoutMs?: number
  signal?: AbortSignal
}

export type ChatCompletionResult = {
  content: string
  usage: AssistantUsage
}

export interface LanguageModelProvider {
  answer(context: CookingContext, question: string, signal: AbortSignal): Promise<AssistantAnswer>
}

export type LanguageModelErrorCategory =
  | 'not_configured'
  | 'rate_limited'
  | 'upstream'
  | 'timeout'
  | 'aborted'

export class LanguageModelError extends Error {
  constructor(
    public readonly category: LanguageModelErrorCategory,
    public readonly status?: number,
  ) {
    super(`DeepSeek request failed: ${category}`)
    this.name = 'LanguageModelError'
  }
}

const DEFAULT_BASE_URL = 'https://api.deepseek.com'
const DEFAULT_MODEL = 'deepseek-v4-flash'

function getConfig() {
  const baseUrl = (process.env.DEEPSEEK_BASE_URL?.trim() || DEFAULT_BASE_URL).replace(/\/$/, '')
  const endpoint = new URL(baseUrl)
  if (endpoint.protocol !== 'https:' || endpoint.hostname !== 'api.deepseek.com') {
    throw new LanguageModelError('not_configured')
  }

  return {
    apiKey: process.env.DEEPSEEK_API_KEY?.trim() || '',
    baseUrl,
    model: process.env.DEEPSEEK_MODEL?.trim() || DEFAULT_MODEL,
    timeoutMs: Number(process.env.DEEPSEEK_TIMEOUT_MS ?? 12_000),
  }
}

function estimateCost(inputTokens: number, outputTokens: number): number {
  const inputRate = Number(process.env.VOICE_DEEPSEEK_INPUT_CNY_PER_MTOKENS ?? 1)
  const outputRate = Number(process.env.VOICE_DEEPSEEK_OUTPUT_CNY_PER_MTOKENS ?? 2)
  return Number(((inputTokens * inputRate + outputTokens * outputRate) / 1_000_000).toFixed(6))
}

function abortWith(signal: AbortSignal | undefined, timeoutMs: number) {
  const controller = new AbortController()
  let timedOut = false
  const onAbort = () => controller.abort()
  signal?.addEventListener('abort', onAbort, { once: true })
  if (signal?.aborted) controller.abort()
  const timeout = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeoutMs)

  return {
    signal: controller.signal,
    timedOut: () => timedOut,
    cleanup: () => {
      clearTimeout(timeout)
      signal?.removeEventListener('abort', onAbort)
    },
  }
}

function parseSseBlock(block: string): StreamChunk | null {
  const data = block
    .split(/\r?\n/)
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trim())
    .join('')
  if (!data || data === '[DONE]') {
    return null
  }

  try {
    return JSON.parse(data) as StreamChunk
  } catch {
    throw new LanguageModelError('upstream')
  }
}

export function isLlmConfigured(): boolean {
  try {
    const config = getConfig()
    return Boolean(config.apiKey && config.model)
  } catch {
    return false
  }
}

export function getLlmRuntimeInfo(): LlmRuntimeInfo {
  let baseUrl = DEFAULT_BASE_URL
  let model = DEFAULT_MODEL
  try {
    const config = getConfig()
    baseUrl = config.baseUrl
    model = config.model
  } catch {
    // Health output stays non-secret and deterministic for invalid configuration.
  }

  return { configured: isLlmConfigured(), provider: 'deepseek', model, baseUrl }
}

export async function callChatCompletionWithUsage(
  options: ChatCompletionOptions,
): Promise<ChatCompletionResult> {
  const config = getConfig()
  if (!config.apiKey) {
    throw new LanguageModelError('not_configured')
  }

  const startedAt = performance.now()
  const abort = abortWith(options.signal, options.timeoutMs ?? config.timeoutMs)
  let firstTokenMs: number | null = null

  try {
    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: config.model,
        messages: options.messages,
        thinking: { type: 'disabled' },
        temperature: options.temperature ?? 0.2,
        max_tokens: options.maxTokens ?? 320,
        stream: true,
        stream_options: { include_usage: true },
        ...(options.jsonMode ? { response_format: { type: 'json_object' } } : {}),
      }),
      signal: abort.signal,
    })

    if (!response.ok) {
      if (response.status === 429 || response.status === 402) {
        throw new LanguageModelError('rate_limited', response.status)
      }
      throw new LanguageModelError('upstream', response.status)
    }
    if (!response.body) {
      throw new LanguageModelError('upstream')
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let content = ''
    let inputTokens = 0
    let outputTokens = 0

    const acceptBlock = (block: string) => {
      const chunk = parseSseBlock(block)
      if (!chunk) {
        return
      }
      const text = chunk.choices?.[0]?.delta?.content ?? ''
      if (text) {
        firstTokenMs ??= Math.round(performance.now() - startedAt)
        content += text
      }
      inputTokens = chunk.usage?.prompt_tokens ?? inputTokens
      outputTokens = chunk.usage?.completion_tokens ?? outputTokens
    }

    while (true) {
      const { done, value } = await reader.read()
      buffer += decoder.decode(value, { stream: !done })
      const blocks = buffer.split(/\r?\n\r?\n/)
      buffer = blocks.pop() ?? ''
      blocks.forEach(acceptBlock)
      if (done) {
        if (buffer.trim()) {
          acceptBlock(buffer)
        }
        break
      }
    }

    const cleaned = content.trim()
    if (!cleaned) {
      throw new LanguageModelError('upstream')
    }
    const totalMs = Math.round(performance.now() - startedAt)
    return {
      content: cleaned,
      usage: {
        inputTokens,
        outputTokens,
        firstTokenMs,
        totalMs,
        estimatedCostCny: estimateCost(inputTokens, outputTokens),
      },
    }
  } catch (error) {
    if (error instanceof LanguageModelError) {
      throw error
    }
    if (abort.signal.aborted) {
      throw new LanguageModelError(abort.timedOut() ? 'timeout' : 'aborted')
    }
    throw new LanguageModelError('upstream')
  } finally {
    abort.cleanup()
  }
}

export async function callChatCompletion(options: ChatCompletionOptions): Promise<string> {
  return (await callChatCompletionWithUsage(options)).content
}

function clamp(value: string, max: number): string {
  return value.trim().slice(0, max)
}

function compactConversation(context: CookingContext): string[] {
  const result: string[] = []
  let remaining = 600
  for (const turn of context.conversation.slice(-2).reverse()) {
    if (remaining <= 0) {
      break
    }
    const content = clamp(turn.content, remaining)
    remaining -= content.length
    result.unshift(`${turn.role === 'user' ? '用户' : '小白'}：${content}`)
  }
  return result
}

function buildCookingPrompt(context: CookingContext, question: string): string {
  const timer = context.timer
    ? `${context.timer.running ? '运行中' : '已暂停'}，剩余 ${Math.max(0, Math.round(context.timer.remainingSeconds))} 秒`
    : '无'
  return [
    `菜谱：${clamp(context.recipeName, 80)}`,
    `当前步骤：${context.currentStep.index + 1}/${Math.max(1, context.currentStep.total)} ${clamp(context.currentStep.title, 80)}`,
    `当前动作：${clamp(context.currentStep.instruction, 400)}`,
    `计时：${timer}`,
    `缺失食材：${context.missingIngredients.slice(0, 10).map((item) => clamp(item, 30)).join('、') || '无'}`,
    `安全提示：${context.safetyNotes.slice(0, 5).map((item) => clamp(item, 80)).join('；') || '无'}`,
    ...compactConversation(context),
    `问题：${question}`,
  ].join('\n')
}

function cleanSpokenAnswer(value: string): string {
  return value
    .replace(/```[\s\S]*?```/g, '')
    .replace(/[`*_#>()]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 250)
}

export class DeepSeekLanguageModelProvider implements LanguageModelProvider {
  async answer(
    context: CookingContext,
    question: string,
    signal: AbortSignal,
  ): Promise<AssistantAnswer> {
    const safeQuestion = clamp(question, 300)
    if (!safeQuestion) {
      throw new LanguageModelError('upstream')
    }

    const result = await callChatCompletionWithUsage({
      messages: [
        {
          role: 'system',
          content: [
            '你是“小白下厨”的实时中文做饭教练。',
            '不用 Markdown，只输出 80 至 250 个中文字符。',
            '优先给出用户现在能立刻执行的动作、状态判断和必要的食品安全提醒。',
            '仅依据给出的最小上下文回答；信息不足时明确采用保守做法，不要假装看见现场。',
          ].join(''),
        },
        { role: 'user', content: buildCookingPrompt(context, safeQuestion) },
      ],
      temperature: 0.2,
      maxTokens: Number(process.env.DEEPSEEK_MAX_OUTPUT_TOKENS ?? 320),
      timeoutMs: Number(process.env.DEEPSEEK_TIMEOUT_MS ?? 12_000),
      signal,
    })

    return {
      answer: cleanSpokenAnswer(result.content),
      provider: 'deepseek',
      usage: result.usage,
    }
  }
}
