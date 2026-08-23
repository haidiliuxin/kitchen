export type VoiceIntent =
  | { type: 'wake_only' }
  | { type: 'next_step' }
  | { type: 'prev_step' }
  | { type: 'repeat_step' }
  | { type: 'play_video' }
  | { type: 'pause_video' }
  | { type: 'timer_start'; durationSeconds: number }
  | { type: 'timer_pause' }
  | { type: 'timer_resume' }
  | { type: 'timer_cancel' }
  | { type: 'timer_query' }
  | { type: 'exit' }
  | { type: 'question'; question: string }
  | { type: 'unknown'; text: string }

const WAKE_WORD = '小白小白'
const digitValues: Record<string, number> = {
  零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9,
}

const phraseIn = (text: string, phrases: string[]) => phrases.some((phrase) => text.includes(phrase))

export function normalizeVoiceText(input: string): string {
  let text = input
    .trim()
    .replace(/[，。！？、；：,.!?;:"'“”‘’\s]/g, '')
    .toLowerCase()
  const replacements: Array<[RegExp, string]> = [
    [/下一不|下一部|下亿步/g, '下一步'],
    [/上一不|上一部/g, '上一步'],
    [/倒记时|到计时/g, '倒计时'],
    [/从新讲/g, '重新讲'],
    [/小白小摆|小白小百|小白小柏/g, WAKE_WORD],
  ]
  for (const [pattern, replacement] of replacements) text = text.replace(pattern, replacement)
  return text
}

export function stripWakeWord(input: string): { text: string; hadWakeWord: boolean } {
  const normalized = normalizeVoiceText(input)
  const wakePrefixes = [WAKE_WORD, '小白下厨', '小白教练']
  const prefix = wakePrefixes.find((candidate) => normalized.startsWith(candidate))
  return prefix
    ? { text: normalized.slice(prefix.length), hadWakeWord: true }
    : { text: normalized, hadWakeWord: false }
}

function parseChineseInteger(value: string): number | null {
  if (/^\d+$/.test(value)) return Number(value)
  if (!value || !/^[零〇一二两三四五六七八九十百]+$/.test(value)) return null
  if (!/[十百]/.test(value)) {
    return Number([...value].map((char) => digitValues[char]).join(''))
  }

  let total = 0
  let digit = 0
  for (const char of value) {
    if (char in digitValues) {
      digit = digitValues[char]
    } else if (char === '十') {
      total += (digit || 1) * 10
      digit = 0
    } else if (char === '百') {
      total += (digit || 1) * 100
      digit = 0
    }
  }
  return total + digit
}

function parseDurationSeconds(text: string): number | null {
  const number = '[零〇一二两三四五六七八九十百\\d]+'
  const minuteSecond = text.match(new RegExp(`(${number})分钟?(${number})秒`))
  if (minuteSecond) {
    const minutes = parseChineseInteger(minuteSecond[1])
    const seconds = parseChineseInteger(minuteSecond[2])
    if (minutes !== null && seconds !== null) return minutes * 60 + seconds
  }
  const halfMinute = text.match(new RegExp(`(${number})分半`))
  if (halfMinute) {
    const minutes = parseChineseInteger(halfMinute[1])
    if (minutes !== null) return minutes * 60 + 30
  }
  const seconds = text.match(new RegExp(`(${number})秒`))
  if (seconds) return parseChineseInteger(seconds[1])
  const minutes = text.match(new RegExp(`(${number})分钟?`))
  if (minutes) {
    const value = parseChineseInteger(minutes[1])
    return value === null ? null : value * 60
  }
  return null
}

export function parseVoiceIntent(input: string): VoiceIntent {
  const { text, hadWakeWord } = stripWakeWord(input)
  if (!text) return hadWakeWord ? { type: 'wake_only' } : { type: 'unknown', text: input }

  if (phraseIn(text, ['退出语音', '结束对话', '不用听了', '关闭小白', '再见'])) return { type: 'exit' }

  if (phraseIn(text, ['取消计时', '关闭计时', '停止计时'])) return { type: 'timer_cancel' }
  if (phraseIn(text, ['暂停计时', '计时暂停'])) return { type: 'timer_pause' }
  if (phraseIn(text, ['继续计时', '恢复计时'])) return { type: 'timer_resume' }
  if (phraseIn(text, ['还有多久', '剩余时间', '计时多久', '查询计时'])) return { type: 'timer_query' }
  const durationSeconds = parseDurationSeconds(text)
  if (durationSeconds !== null && phraseIn(text, ['计时', '倒计时', '提醒'])) {
    return durationSeconds >= 1 && durationSeconds <= 7_200
      ? { type: 'timer_start', durationSeconds }
      : { type: 'unknown', text }
  }

  if (phraseIn(text, ['暂停视频', '停止视频', '关闭视频'])) return { type: 'pause_video' }
  if (phraseIn(text, ['播放视频', '播放本段', '播放这一段', '看视频', '看这一段', '本段视频'])) {
    return { type: 'play_video' }
  }
  if (phraseIn(text, ['上一步', '前一步', '上一项', '回到上一步', '退回', '刚才那步'])) {
    return { type: 'prev_step' }
  }
  if (phraseIn(text, ['重复', '再说一遍', '重新讲', '再讲', '没听清', '朗读这一步'])) {
    return { type: 'repeat_step' }
  }
  if (phraseIn(text, ['下一步', '下步', '下一个', '往下', '接着做', '继续做', '然后呢'])) {
    return { type: 'next_step' }
  }

  if (/^(嗯+|啊+|哦+|喂+|小白)$/.test(text)) return { type: 'unknown', text }
  return { type: 'question', question: text.slice(0, 300) }
}
