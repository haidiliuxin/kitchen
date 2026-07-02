export type VoiceIntent =
  | { type: 'next_step' }
  | { type: 'prev_step' }
  | { type: 'repeat_step' }
  | { type: 'play_video' }
  | { type: 'timer'; durationSeconds: number }
  | { type: 'question'; question: string }
  | { type: 'unknown'; text: string }

const chineseDigits: Record<string, number> = {
  零: 0,
  一: 1,
  二: 2,
  两: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
}

const nextStepPhrases = [
  '下一步',
  '下步',
  '继续',
  '下一个',
  '往下',
  '接着',
  '接着做',
  '继续做',
  '可以了',
  '好了',
  '然后呢',
]

const prevStepPhrases = [
  '上一步',
  '前一步',
  '上一项',
  '返回',
  '回到上一步',
  '退回',
  '回去',
  '刚才那步',
]

const repeatStepPhrases = [
  '重复',
  '重复一遍',
  '再说',
  '再说一遍',
  '重新讲',
  '重新讲一下',
  '再讲',
  '没听清',
  '刚才怎么说',
]

const playVideoPhrases = [
  '播放视频',
  '播放本段',
  '播放这一段',
  '看视频',
  '看本段',
  '看这一段',
  '这一段怎么做',
  '本段视频',
]

function normalizeVoiceText(text: string): string {
  let normalized = text
    .trim()
    .replace(/[，。！？、；：,.!?;:"'“”‘’\s]/g, '')
    .replace(/^(小白小白|小白|小白下厨|小白教练)/, '')
    .trim()

  const replacements: Array<[RegExp, string]> = [
    [/失淀粉|石淀粉|实淀粉|湿垫粉|湿淀分/g, '湿淀粉'],
    [/下一不|下一部|下亿步/g, '下一步'],
    [/上一不|上一部/g, '上一步'],
    [/倒记时/g, '倒计时'],
    [/从新讲/g, '重新讲'],
  ]

  for (const [pattern, replacement] of replacements) {
    normalized = normalized.replace(pattern, replacement)
  }

  return normalized
}

function includesAny(text: string, phrases: string[]): boolean {
  return phrases.some((phrase) => text.includes(phrase))
}

function parseChineseInteger(value: string): number | null {
  if (/^\d+$/.test(value)) {
    return Number(value)
  }

  if (value === '十') {
    return 10
  }

  const tenIndex = value.indexOf('十')
  if (tenIndex >= 0) {
    const left = value.slice(0, tenIndex)
    const right = value.slice(tenIndex + 1)
    const tens = left ? chineseDigits[left] : 1
    const ones = right ? chineseDigits[right] : 0
    if (tens !== undefined && ones !== undefined) {
      return tens * 10 + ones
    }
  }

  if (value.length === 1 && chineseDigits[value] !== undefined) {
    return chineseDigits[value]
  }

  return null
}

function parseDurationSeconds(text: string): number | null {
  const minuteSecondMatch = text.match(/([一二两三四五六七八九十\d]+)分钟?([一二两三四五六七八九十\d]+)?秒?/)
  if (minuteSecondMatch) {
    const minutes = parseChineseInteger(minuteSecondMatch[1])
    const seconds = minuteSecondMatch[2] ? parseChineseInteger(minuteSecondMatch[2]) : 0
    if (minutes !== null && seconds !== null) {
      return minutes * 60 + seconds
    }
  }

  const halfMinuteMatch = text.match(/([一二两三四五六七八九十\d]+)分半/)
  if (halfMinuteMatch) {
    const minutes = parseChineseInteger(halfMinuteMatch[1])
    return minutes === null ? null : minutes * 60 + 30
  }

  const secondMatch = text.match(/([一二两三四五六七八九十\d]+)秒/)
  if (secondMatch) {
    return parseChineseInteger(secondMatch[1])
  }

  const minuteMatch = text.match(/([一二两三四五六七八九十\d]+)分钟?/)
  if (minuteMatch) {
    const minutes = parseChineseInteger(minuteMatch[1])
    return minutes === null ? null : minutes * 60
  }

  return null
}

export function parseVoiceIntent(input: string): VoiceIntent {
  const text = normalizeVoiceText(input)
  if (!text) {
    return { type: 'unknown', text: input }
  }

  const durationSeconds = parseDurationSeconds(text)
  if (
    durationSeconds &&
    durationSeconds > 0 &&
    (text.includes('计时') || text.includes('倒计时') || text.includes('提醒'))
  ) {
    return { type: 'timer', durationSeconds }
  }

  if (includesAny(text, prevStepPhrases)) {
    return { type: 'prev_step' }
  }

  if (includesAny(text, repeatStepPhrases)) {
    return { type: 'repeat_step' }
  }

  if (includesAny(text, playVideoPhrases)) {
    return { type: 'play_video' }
  }

  if (includesAny(text, nextStepPhrases)) {
    return { type: 'next_step' }
  }

  return { type: 'question', question: text }
}
