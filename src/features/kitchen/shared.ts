import type { CSSProperties } from 'react'
import type { Difficulty, Recipe } from '../../types.js'
import { defaultTextToSpeechProvider } from './voiceProviders.js'

export type Screen = 'discover' | 'prep' | 'cook' | 'finish'

export type TimeLimit = '全部' | 15 | 20 | 30 | 45

export type ChatMessage = {
  id: string
  role: 'assistant' | 'user'
  text: string
}

export const difficultyOptions: Array<'全部' | Difficulty> = [
  '全部',
  '零失败',
  '轻松进阶',
  '周末进阶',
]

export const timeOptions: TimeLimit[] = ['全部', 15, 20, 30, 45]

export function createMessage(
  role: ChatMessage['role'],
  text: string,
): ChatMessage {
  return {
    id: `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    role,
    text,
  }
}

export function formatMinutes(minutes: number): string {
  if (minutes < 60) {
    return `${minutes} 分钟`
  }

  const hour = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest === 0 ? `${hour} 小时` : `${hour} 小时 ${rest} 分钟`
}

export function formatTimer(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
}

export function recipeCardStyle(recipe: Recipe): CSSProperties {
  return {
    background: `linear-gradient(140deg, ${recipe.palette.start}, ${recipe.palette.end})`,
  }
}

function normalizeSpeechText(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, '这段内容可以看屏幕。')
    .replace(/[`*_#>\-[\]()>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

let speechController: AbortController | null = null

export async function speak(text: string): Promise<void> {
  const speechText = normalizeSpeechText(text)
  if (!speechText) return
  speechController?.abort()
  speechController = new AbortController()
  await defaultTextToSpeechProvider.speak(speechText, {}, speechController.signal)
}

export async function stopSpeak(): Promise<void> {
  speechController?.abort()
  speechController = null
  await defaultTextToSpeechProvider.stop()
}
