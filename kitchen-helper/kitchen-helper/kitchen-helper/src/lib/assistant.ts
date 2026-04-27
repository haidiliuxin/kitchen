import type { Recipe, Step } from '../types.js'

export function getWelcomeMessage(recipe: Recipe): string {
  return `今天我们做 ${recipe.title}。先别追求完美，只要按步骤走、每一步看对状态，这道菜就很容易成功。你可以随时问我“这一步做到什么程度算好”或者直接说“下一步”。`
}

export function getLiveCoachNote(
  _recipe: Recipe,
  step: Step,
  currentStepIndex: number,
): string {
  return `现在是第 ${currentStepIndex + 1} 步“${step.title}”。先盯住这件事：${step.sensoryCue}。如果锅里状态和这里描述不一致，优先减慢节奏，不要急着补很多调料。`
}

export function getQuickPrompts(recipe: Recipe): string[] {
  const prompts = [
    '这一步做到什么程度算好？',
    '为什么要这样做？',
    `没有${recipe.substitutions[0]?.ingredient ?? '这个调料'}怎么办？`,
    recipe.rescueTips[0]?.issue ?? '如果翻车了怎么办？',
  ]

  return prompts.filter(Boolean)
}

export function getAssistantReply(
  recipe: Recipe,
  step: Step,
  currentStepIndex: number,
  question: string,
): string {
  const normalized = question.replace(/\s+/g, '').toLowerCase()

  const rescue = recipe.rescueTips.find((tip) =>
    tip.keywords.some((keyword) => normalized.includes(keyword.replace(/\s+/g, ''))),
  )
  if (rescue) {
    return rescue.answer
  }

  const substitution = recipe.substitutions.find((item) =>
    normalized.includes(item.ingredient.toLowerCase()),
  )
  if (
    substitution &&
    (normalized.includes('没有') || normalized.includes('替代') || normalized.includes('换'))
  ) {
    return `${substitution.ingredient}可以用${substitution.replacement}代替。${substitution.tip}`
  }

  if (
    normalized.includes('做到什么程度') ||
    normalized.includes('算好') ||
    normalized.includes('熟了') ||
    normalized.includes('状态') ||
    normalized.includes('好了没')
  ) {
    return `看这几个信号就差不多：${step.checkpoints.join('；')}。核心观察点是：${step.sensoryCue}`
  }

  if (normalized.includes('为什么') || normalized.includes('原理')) {
    return `${step.detail} 所以这一小步做对了，后面会顺很多。`
  }

  if (normalized.includes('重复') || normalized.includes('再说一遍')) {
    return `${step.voiceover} 这一小步你只需要抓住三个点：${step.checkpoints.join('、')}。`
  }

  if (normalized.includes('下一步')) {
    const nextStep = recipe.steps[currentStepIndex + 1]
    if (!nextStep) {
      return '已经是最后一步了。确认味道合适就可以装盘，记得在最满意的状态停下来。'
    }

    return `下一步是“${nextStep.title}”。你会做：${nextStep.instruction}`
  }

  if (
    normalized.includes('火候') ||
    normalized.includes('太快') ||
    normalized.includes('太慢')
  ) {
    return `先按这一步的节奏来：${step.sensoryCue}。如果锅里明显反应过快，就把火降半档；如果一直没有变化，再稍微加一点火。`
  }

  return `你现在在做 ${recipe.title} 的第 ${currentStepIndex + 1} 步“${step.title}”。先照着这个动作做：${step.instruction}。如果你愿意，我可以继续帮你判断这一步“现在是不是已经到位了”。`
}
