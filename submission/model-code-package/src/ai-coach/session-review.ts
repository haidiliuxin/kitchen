/**
 * Completion-page session review.
 *
 * This feature is currently local template logic, not an LLM call.
 * It is included so reviewers can see that we do not claim every AI-looking
 * behavior is model-generated.
 */

export type CookingSessionEvent = {
  type: 'question' | 'voice_command' | 'quick_action' | 'video_replay' | 'timer' | 'step_complete'
  stepId?: number
  stepTitle?: string
  content?: string
  timestamp: number
}

export type SessionReview = {
  comment: string
  reminder: string
  eventCount: number
  questionCount: number
  videoReplayCount: number
  timerCount: number
}

function isRescueQuestion(content = ''): boolean {
  return /糊|焦|太咸|太淡|补救|怎么办|救|失败/.test(content)
}

function isConceptQuestion(content = ''): boolean {
  return /水淀粉|湿淀粉|是什么|为什么|原理|要不要|可以不/.test(content)
}

function recent(events: CookingSessionEvent[], predicate: (event: CookingSessionEvent) => boolean): CookingSessionEvent | undefined {
  return [...events].reverse().find(predicate)
}

export function buildSessionReview(events: CookingSessionEvent[]): SessionReview {
  const questions = events.filter((event) => event.type === 'question')
  const videos = events.filter((event) => event.type === 'video_replay')
  const timers = events.filter((event) => event.type === 'timer')
  const rescue = recent(events, (event) => (event.type === 'question' || event.type === 'quick_action') && isRescueQuestion(event.content))
  const concept = recent(events, (event) => event.type === 'question' && isConceptQuestion(event.content))
  const lastQuestion = recent(events, (event) => event.type === 'question' && Boolean(event.content?.trim()))

  let comment = '你已经顺利完成了这道菜。第一次做饭不需要完美，能按照步骤做完，就是一次成功。'
  if (rescue?.content) {
    const stepPrefix = rescue.stepTitle ? `在“${rescue.stepTitle}”这一步，` : ''
    comment = `${stepPrefix}你刚才问过「${rescue.content}」，说明炒制阶段是这次最容易紧张的地方。下次遇到锅底发焦或状态不对，可以先关火、移锅降温，再判断食材是否还能补救。`
  } else if (concept?.content) {
    comment = `你刚才问过「${concept.content}」，这说明你不只是照着做，也在理解为什么这样做。像水淀粉这类小细节，理解了原理，下次就会更稳。`
  } else if (lastQuestion?.content) {
    comment = `你刚才问过「${lastQuestion.content}」。这说明你有在根据现场状态判断，而不是机械照做。`
  } else if (videos.length > 0) {
    comment = '你刚才回看了步骤视频，这很正常。新手做饭最重要的不是快，而是确认每一步真的做对。'
  } else if (timers.length > 0) {
    comment = '你刚才用过计时，说明你已经开始关注火候和时间控制了。'
  }

  let reminder = '下次继续按步骤慢慢做，先稳定完成，再追求速度。'
  if (rescue) {
    reminder = '下次遇到锅底发焦，先关火再处理，不要急着继续翻炒。'
  } else if (timers.length > 0) {
    reminder = '下次炒蛋时，注意油温不要太高，看到边缘凝固后再轻轻推动，口感会更嫩。'
  } else if (videos.length > 0) {
    reminder = '下次可以继续重点看动作状态：什么时候下锅、什么时候翻动，比单纯看时间更可靠。'
  } else if (concept) {
    reminder = '下次可以重点关注“水淀粉加入量”，少量加入、观察状态即可。'
  }

  return {
    comment,
    reminder,
    eventCount: events.length,
    questionCount: questions.length,
    videoReplayCount: videos.length,
    timerCount: timers.length,
  }
}
