import { Capacitor } from '@capacitor/core'
import { TextToSpeech } from '@capacitor-community/text-to-speech'
import type { CSSProperties } from 'react'
import type { Difficulty, Recipe } from '../../types.js'

export type Screen = 'discover' | 'cook' | 'finish'

export type TimeLimit = '全部' | 15 | 20 | 30 | 45

export type ChatMessage = {
  id: string
  role: 'assistant' | 'user'
  text: string
}

export type VoiceStatus = 'idle' | 'listening' | 'unsupported'

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

export async function speak(text: string): Promise<void> {
  if (!text.trim()) {
    return
  }

  if (Capacitor.isNativePlatform()) {
    await TextToSpeech.stop().catch(() => undefined)
    await TextToSpeech.speak({
      text,
      lang: 'zh-CN',
      rate: 1.0,
      pitch: 1.0,
      volume: 1.0,
    })
    return
  }

  if (!('speechSynthesis' in window)) {
    return
  }

  const utterance = new SpeechSynthesisUtterance(text)
  utterance.lang = 'zh-CN'
  utterance.rate = 1.02
  window.speechSynthesis.cancel()
  window.speechSynthesis.speak(utterance)
}
