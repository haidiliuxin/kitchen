import { callChatCompletion, getLlmRuntimeInfo, isLlmConfigured } from './llm.js'

type DemoCoachStep = {
  title: string
  instruction: string
  tips: string[]
  commonMistakes: string[]
}

export type DemoCoachRequest = {
  recipeName: string
  currentStep: DemoCoachStep
  userQuestion: string
}

export type DemoCoachResponse = {
  status: 'success' | 'fallback'
  answer: string
  provider?: string
  model?: string
}

function normalizeQuestion(question: string): string {
  return question.trim().replace(/\s+/g, ' ')
}

function includesAny(value: string, keywords: string[]): boolean {
  return keywords.some((keyword) => value.includes(keyword))
}

export function buildDemoCoachFallbackAnswer(context: DemoCoachRequest): string {
  const question = normalizeQuestion(context.userQuestion)
  const compactQuestion = question.replace(/\s+/g, '')
  const tips = context.currentStep.tips.filter(Boolean)
  const mistakes = context.currentStep.commonMistakes.filter(Boolean)
  const stepTitle = context.currentStep.title || '当前步骤'
  const instruction = context.currentStep.instruction || '先按屏幕上的步骤慢慢做。'
  const firstTip = tips[0] ?? instruction
  const firstMistake = mistakes[0] ?? '先把火调小一点，观察食材状态，再少量调整。'

  if (includesAny(compactQuestion, ['湿淀粉', '淀粉'])) {
    return '湿淀粉就是淀粉加少量清水调开的液体，常用来让汤汁变浓稠。使用前要搅匀，少量倒入，边倒边看浓稠度，别一次加太多。'
  }

  if (includesAny(compactQuestion, ['番茄酱', '番茄醬'])) {
    return `可以少量加，但不是必须。你现在在“${stepTitle}”，如果番茄不够红或酸甜味不明显，可以加半勺番茄酱提味；如果已经有明显番茄汤汁，就先不要加，避免味道太重。`
  }

  if (
    includesAny(compactQuestion, ['鸡蛋老', '雞蛋老', '蛋老', '太老']) ||
    (includesAny(compactQuestion, ['鸡蛋', '雞蛋', '蛋']) && includesAny(compactQuestion, ['老', '硬']))
  ) {
    return `鸡蛋有点老也能补救。先别继续大火炒，把鸡蛋和番茄汤汁轻轻拌匀，让汤汁把口感拉回来；下次在鸡蛋大部分凝固、表面还嫩的时候就先盛出。`
  }

  if (includesAny(compactQuestion, ['火', '火候', '多大'])) {
    return `这一步建议用中火到中小火。判断标准不是火力档位，而是状态：${firstTip}。如果锅里变干或上色太快，就立刻调小火。`
  }

  if (includesAny(compactQuestion, ['葱', '葱花', '没有葱', '不放'])) {
    return `没有葱花可以不放。葱花主要是增香和点缀，不影响“${context.recipeName}”的主流程；先把这一步做好：${instruction}`
  }

  if (includesAny(compactQuestion, ['糊', '焦', '粘锅'])) {
    return `先把火关小或离火，不要刮锅底焦黑的部分。能盛出的先盛出，再根据状态补一点番茄或热水。当前最容易错的是：${firstMistake}`
  }

  if (includesAny(compactQuestion, ['咸', '太咸'])) {
    return `先不要再加盐。可以加一点番茄块、热水，或者加一点没调味的鸡蛋把咸味摊开；后面尝味时再少量多次调整。`
  }

  if (includesAny(compactQuestion, ['什么程度', '算好', '好了没', '熟了吗'])) {
    return `看这一步的状态：${firstTip}。如果你不确定，就先按“少炒一点”的方向处理，因为后面还会继续受热。`
  }

  if (includesAny(compactQuestion, ['为什么', '为啥'])) {
    return `这一步是为了让后面的口感更稳定。当前动作是：${instruction} 这样做可以减少新手最容易出现的状态偏差。`
  }

  return `针对你问的“${question}”：先围绕当前步骤“${stepTitle}”处理。现在最重要的是：${instruction} 判断时看这个信号：${firstTip}`
}

function buildDemoCoachPrompt(context: DemoCoachRequest): string {
  return [
    '你是“小白下厨”的 AI 教练，只回答当前做菜步骤相关的问题。',
    '回答要短、具体、能立刻执行，不要泛泛讲烹饪理论。',
    '如果用户问到视频或菜谱没有明确说明的内容，请给保守建议，不要编造复杂做法。',
    '',
    `recipeName: ${context.recipeName}`,
    `currentStep.title: ${context.currentStep.title}`,
    `currentStep.instruction: ${context.currentStep.instruction}`,
    `currentStep.tips: ${context.currentStep.tips.join('；')}`,
    `currentStep.commonMistakes: ${context.currentStep.commonMistakes.join('；')}`,
    `userQuestion: ${context.userQuestion}`,
  ].join('\n')
}

function isLowQualityCoachAnswer(answer: string): boolean {
  const compact = answer.replace(/\s+/g, '')
  return (
    compact.length < 8 ||
    compact.includes('请提供菜名') ||
    compact.includes('请提供当前步骤') ||
    compact.includes('无法回答') ||
    compact.includes('没有足够信息')
  )
}

export async function getDemoCoachReply(context: DemoCoachRequest): Promise<DemoCoachResponse> {
  const userQuestion = normalizeQuestion(context.userQuestion)
  if (!userQuestion) {
    return {
      status: 'fallback',
      answer: '请先输入问题，比如“这一步火要多大？”',
    }
  }

  const safeContext: DemoCoachRequest = {
    recipeName: context.recipeName || '当前菜谱',
    currentStep: {
      title: context.currentStep?.title || '当前步骤',
      instruction: context.currentStep?.instruction || '',
      tips: Array.isArray(context.currentStep?.tips) ? context.currentStep.tips : [],
      commonMistakes: Array.isArray(context.currentStep?.commonMistakes)
        ? context.currentStep.commonMistakes
        : [],
    },
    userQuestion,
  }

  if (!isLlmConfigured()) {
    return {
      status: 'fallback',
      answer: buildDemoCoachFallbackAnswer(safeContext),
    }
  }

  try {
    const answer = await callChatCompletion({
      messages: [
        {
          role: 'system',
          content: '你是做菜跟做页里的 AI 教练。请用中文回答，简短、具体、围绕当前步骤。',
        },
        {
          role: 'user',
          content: buildDemoCoachPrompt(safeContext),
        },
      ],
      temperature: 0.2,
      maxTokens: 360,
      timeoutMs: Number(process.env.DEEPSEEK_TIMEOUT_MS ?? 180000),
    })
    const runtime = getLlmRuntimeInfo()

    if (isLowQualityCoachAnswer(answer)) {
      return {
        status: 'fallback',
        answer: buildDemoCoachFallbackAnswer(safeContext),
      }
    }

    return {
      status: 'success',
      answer: answer.trim(),
      provider: runtime.provider,
      model: runtime.model,
    }
  } catch {
    return {
      status: 'fallback',
      answer: buildDemoCoachFallbackAnswer(safeContext),
    }
  }
}
