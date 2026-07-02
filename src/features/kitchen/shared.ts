import { Capacitor } from '@capacitor/core'
import { TextToSpeech } from '@capacitor-community/text-to-speech'
import type { SpeechSynthesisVoice as NativeSpeechSynthesisVoice } from '@capacitor-community/text-to-speech'
import type { CSSProperties } from 'react'
import type { Difficulty, Recipe } from '../../types.js'

export type Screen = 'discover' | 'prep' | 'cook' | 'finish'

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

let preferredNativeVoiceIndex: number | undefined

function isChineseVoice(voice: Pick<NativeSpeechSynthesisVoice, 'lang' | 'name'>): boolean {
  const lang = voice.lang.toLowerCase()
  const name = voice.name.toLowerCase()
  return lang.startsWith('zh') || name.includes('chinese') || name.includes('mandarin') || name.includes('中文')
}

async function getPreferredNativeVoiceIndex(): Promise<number | undefined> {
  if (preferredNativeVoiceIndex !== undefined) {
    return preferredNativeVoiceIndex
  }

  try {
    const { voices } = await TextToSpeech.getSupportedVoices()
    const exactChineseIndex = voices.findIndex((voice) => voice.lang.toLowerCase() === 'zh-cn')
    const anyChineseIndex = voices.findIndex(isChineseVoice)
    const selectedIndex = exactChineseIndex >= 0 ? exactChineseIndex : anyChineseIndex
    preferredNativeVoiceIndex = selectedIndex >= 0 ? selectedIndex : undefined
  } catch {
    preferredNativeVoiceIndex = undefined
  }

  return preferredNativeVoiceIndex
}

function getPreferredWebVoice(): SpeechSynthesisVoice | undefined {
  const voices = window.speechSynthesis.getVoices()
  return (
    voices.find((voice) => voice.lang.toLowerCase() === 'zh-cn') ??
    voices.find((voice) => voice.lang.toLowerCase().startsWith('zh')) ??
    voices.find((voice) => voice.name.toLowerCase().includes('chinese')) ??
    voices.find((voice) => voice.name.toLowerCase().includes('mandarin'))
  )
}

function normalizeSpeechText(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, '这段内容可以看屏幕。')
    .replace(/[`*_#>\-[\]()>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export async function speak(text: string): Promise<void> {
  const speechText = normalizeSpeechText(text)
  if (!speechText) {
    return
  }

  if (Capacitor.isNativePlatform()) {
    const voice = await getPreferredNativeVoiceIndex()
    await TextToSpeech.stop().catch(() => undefined)
    await TextToSpeech.speak({
      text: speechText,
      lang: 'zh-CN',
      rate: 0.95,
      pitch: 1.0,
      volume: 1.0,
      voice,
    })
    return
  }

  if (!('speechSynthesis' in window)) {
    return
  }

  return new Promise((resolve) => {
    const utterance = new SpeechSynthesisUtterance(speechText)
    utterance.lang = 'zh-CN'
    utterance.rate = 0.98
    const voice = getPreferredWebVoice()
    if (voice) {
      utterance.voice = voice
    }
    utterance.onend = () => resolve()
    utterance.onerror = () => resolve()
    window.speechSynthesis.cancel()
    window.speechSynthesis.speak(utterance)
  })
}

export async function stopSpeak(): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    await TextToSpeech.stop().catch(() => undefined)
    return
  }

  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel()
  }
}
