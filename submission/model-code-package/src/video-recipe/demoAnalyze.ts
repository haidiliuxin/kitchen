import { demoTomatoEggRecipe } from '../src/features/kitchen/demoRecipe.js'
import { callChatCompletion, getLlmRuntimeInfo, isLlmConfigured } from './llm.js'

export type DemoTranscriptSegment = {
  startTime: number
  endTime: number
  text: string
}

export type DemoStructuredRecipe = {
  recipeName: string
  estimatedTime: string
  servings: number
  ingredients: Array<{
    name: string
    amount: string
    note: string
  }>
  prepItems: Array<{
    name: string
    action: string
  }>
  steps: Array<{
    stepId: string
    title: string
    instruction: string
    startTime: number
    endTime: number
    duration: string
    tips: string[]
    commonMistakes: string[]
    rescue: string
    keyFrameUrl?: string
  }>
}

export type DemoAnalyzeResponse = {
  status: 'success' | 'fallback'
  message: string
  recipe: DemoStructuredRecipe
  evidence: {
    usedLLM: boolean
    transcriptSegments: number
    source: 'demo transcript'
    fallbackReason?: string
    provider?: string
    model?: string
  }
}

export const demoVideoTranscript: {
  title: string
  transcriptSegments: DemoTranscriptSegment[]
  notes: string[]
} = {
  title: '番茄炒蛋新手教学演示视频',
  transcriptSegments: [
    {
      startTime: 0,
      endTime: 18,
      text: '今天做一道新手很容易成功的番茄炒蛋。准备两个番茄、三个鸡蛋、一点葱花、盐、少量白糖和食用油。',
    },
    {
      startTime: 18,
      endTime: 42,
      text: '先把番茄洗净去蒂，切成小块。鸡蛋打进碗里，加一小撮盐，充分搅散到看不见明显蛋清。',
    },
    {
      startTime: 42,
      endTime: 72,
      text: '锅烧热后倒油，油热倒入蛋液。边缘凝固后用锅铲轻轻推开，鸡蛋大部分凝固但表面还嫩的时候先盛出来。',
    },
    {
      startTime: 72,
      endTime: 112,
      text: '锅里留一点底油，倒入番茄块，中火翻炒。加一小撮盐帮助番茄出汁，炒到番茄变软、锅底出现红色汤汁。',
    },
    {
      startTime: 112,
      endTime: 142,
      text: '把刚才的鸡蛋倒回锅里，和番茄汁轻轻翻匀。不要用力压碎鸡蛋，让鸡蛋裹上番茄汁就可以。',
    },
    {
      startTime: 142,
      endTime: 168,
      text: '最后尝一下味道，淡了补一点盐，番茄偏酸可以加一点白糖。撒葱花，汤汁不要收太干，就可以出锅。',
    },
    {
      startTime: 168,
      endTime: 188,
      text: '如果鸡蛋炒老了，下次提前盛出；如果太咸，可以补一点番茄或热水稀释；如果锅底发糊，不要把焦黑部分刮进菜里。',
    },
  ],
  notes: ['这是一份复赛演示用的字幕/ASR 缓存，不需要现场下载视频。'],
}

function buildDemoAnalyzePrompt(): string {
  return [
    '你是一个把做菜视频字幕转换成结构化菜谱 JSON 的助手。',
    '只能根据 transcriptSegments 里的内容输出，不要使用常识编造视频没有出现的食材。',
    '不确定的信息写“视频未明确说明”。',
    '必须输出严格 JSON，不要 Markdown，不要解释文字。',
    '尽量根据 transcriptSegments 的时间戳给每一步绑定 startTime 和 endTime。',
    '输出 schema 必须完全符合：',
    JSON.stringify(
      {
        recipeName: '菜名',
        estimatedTime: '预计时间，例如 15 分钟',
        servings: 2,
        ingredients: [
          {
            name: '食材名',
            amount: '用量',
            note: '备注；不确定写“视频未明确说明”',
          },
        ],
        prepItems: [
          {
            name: '备菜项',
            action: '预处理动作',
          },
        ],
        steps: [
          {
            stepId: 'step-1',
            title: '步骤标题',
            instruction: '具体操作',
            startTime: 0,
            endTime: 18,
            duration: '约 1 分钟',
            tips: ['关键提醒'],
            commonMistakes: ['易错点'],
            rescue: '补救建议',
          },
        ],
      },
      null,
      2,
    ),
    '',
    '视频标题：',
    demoVideoTranscript.title,
    '',
    'transcriptSegments：',
    JSON.stringify(demoVideoTranscript.transcriptSegments, null, 2),
  ].join('\n')
}

function parseJsonFromModel(raw: string): unknown {
  const trimmed = raw.trim()
  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  return JSON.parse(fencedMatch?.[1]?.trim() ?? trimmed)
}

function asString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function asStringArray(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) {
    return fallback
  }

  const items = value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean)

  return items.length > 0 ? items : fallback
}

function normalizeDemoRecipe(payload: unknown): DemoStructuredRecipe {
  const raw = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {}
  const ingredients = Array.isArray(raw.ingredients) ? raw.ingredients : []
  const prepItems = Array.isArray(raw.prepItems) ? raw.prepItems : []
  const steps = Array.isArray(raw.steps) ? raw.steps : []

  const normalized: DemoStructuredRecipe = {
    recipeName: asString(raw.recipeName, ''),
    estimatedTime: asString(raw.estimatedTime, ''),
    servings: asNumber(raw.servings, 0),
    ingredients: ingredients.map((item) => {
      const record = item && typeof item === 'object' ? item as Record<string, unknown> : {}
      return {
        name: asString(record.name, ''),
        amount: asString(record.amount, '视频未明确说明'),
        note: asString(record.note, '视频未明确说明'),
      }
    }).filter((item) => item.name),
    prepItems: prepItems.map((item) => {
      const record = item && typeof item === 'object' ? item as Record<string, unknown> : {}
      return {
        name: asString(record.name, ''),
        action: asString(record.action, '视频未明确说明'),
      }
    }).filter((item) => item.name),
    steps: steps.map((item, index) => {
      const record = item && typeof item === 'object' ? item as Record<string, unknown> : {}
      const fallbackSegment = demoVideoTranscript.transcriptSegments[Math.min(index, demoVideoTranscript.transcriptSegments.length - 1)]
      const startTime = asNumber(record.startTime, fallbackSegment?.startTime ?? 0)
      const endTime = asNumber(record.endTime, fallbackSegment?.endTime ?? startTime + 30)

      return {
        stepId: asString(record.stepId, `step-${index + 1}`),
        title: asString(record.title, `步骤 ${index + 1}`),
        instruction: asString(record.instruction, fallbackSegment?.text ?? '视频未明确说明'),
        startTime,
        endTime: endTime > startTime ? endTime : startTime + 30,
        duration: asString(record.duration, `约 ${Math.max(1, Math.round((endTime - startTime) / 60))} 分钟`),
        tips: asStringArray(record.tips, ['按视频当前步骤观察食材状态。']),
        commonMistakes: asStringArray(record.commonMistakes, ['推进太快，状态还没到位。']),
        rescue: asString(record.rescue, '先放慢节奏，根据当前状态少量调整。'),
      }
    }).filter((item) => item.title && item.instruction),
  }

  if (!normalized.recipeName) {
    throw new Error('model output missing recipeName')
  }
  if (!normalized.estimatedTime) {
    throw new Error('model output missing estimatedTime')
  }
  if (!normalized.servings || normalized.servings < 1) {
    throw new Error('model output missing servings')
  }
  if (normalized.ingredients.length === 0) {
    throw new Error('model output missing ingredients')
  }
  if (normalized.prepItems.length === 0) {
    throw new Error('model output missing prepItems')
  }
  if (normalized.steps.length === 0) {
    throw new Error('model output missing steps')
  }

  return normalized
}

export function buildFallbackDemoRecipe(): DemoStructuredRecipe {
  return {
    recipeName: demoTomatoEggRecipe.title,
    estimatedTime: `${demoTomatoEggRecipe.duration} 分钟`,
    servings: demoTomatoEggRecipe.servings,
    ingredients: demoTomatoEggRecipe.ingredients.map((ingredient) => ({
      name: ingredient.name,
      amount: ingredient.amount,
      note: '来自演示兜底菜谱',
    })),
    prepItems: [
      { name: '番茄', action: '洗净去蒂，切成小块，方便炒出汁。' },
      { name: '鸡蛋', action: '打入碗中，加一小撮盐，充分搅散。' },
      { name: '葱花', action: '切好备用，最后出锅前再放。' },
      { name: '调味料', action: '盐和白糖放在手边，最后少量多次调整。' },
    ],
    steps: demoTomatoEggRecipe.steps.map((step, index) => {
      const segment = demoVideoTranscript.transcriptSegments[Math.min(index + 1, demoVideoTranscript.transcriptSegments.length - 1)]

      return {
        stepId: `step-${index + 1}`,
        title: step.title,
        instruction: step.instruction,
        startTime: segment.startTime,
        endTime: segment.endTime,
        duration: `约 ${step.durationMinutes} 分钟`,
        tips: [step.sensoryCue, ...step.checkpoints.slice(0, 2)],
        commonMistakes: step.commonMistakes,
        rescue: demoTomatoEggRecipe.rescueTips[index % demoTomatoEggRecipe.rescueTips.length]?.answer ?? '先降低火力，再根据状态少量调整。',
      }
    }),
  }
}

export async function analyzeDemoVideo(): Promise<DemoAnalyzeResponse> {
  const baseEvidence = {
    transcriptSegments: demoVideoTranscript.transcriptSegments.length,
    source: 'demo transcript' as const,
  }

  if (!isLlmConfigured()) {
    return {
      status: 'fallback',
      message: '未配置 DeepSeek Key，已切换到演示兜底菜谱。',
      recipe: buildFallbackDemoRecipe(),
      evidence: {
        ...baseEvidence,
        usedLLM: false,
        fallbackReason: 'LLM is not configured',
      },
    }
  }

  try {
    const raw = await callChatCompletion({
      messages: [
        {
          role: 'system',
          content: '你只输出严格 JSON，不输出 Markdown，不输出解释文字。',
        },
        {
          role: 'user',
          content: buildDemoAnalyzePrompt(),
        },
      ],
      temperature: 0.1,
      maxTokens: 2600,
      jsonMode: true,
      timeoutMs: Number(process.env.DEEPSEEK_TIMEOUT_MS ?? 180000),
    })
    const recipe = normalizeDemoRecipe(parseJsonFromModel(raw))
    const runtime = getLlmRuntimeInfo()

    return {
      status: 'success',
      message: 'AI 已根据演示视频字幕生成结构化菜谱。',
      recipe,
      evidence: {
        ...baseEvidence,
        usedLLM: true,
        provider: runtime.provider,
        model: runtime.model,
      },
    }
  } catch (error) {
    return {
      status: 'fallback',
      message: '视频解析不稳定，已切换到演示兜底菜谱。',
      recipe: buildFallbackDemoRecipe(),
      evidence: {
        ...baseEvidence,
        usedLLM: false,
        fallbackReason: error instanceof Error ? error.message : 'Unknown LLM failure',
      },
    }
  }
}
