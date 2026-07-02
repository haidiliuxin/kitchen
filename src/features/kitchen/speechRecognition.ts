import { Capacitor } from '@capacitor/core'
import { SpeechRecognition as NativeSpeechRecognition } from '@capacitor-community/speech-recognition'

export type SpeechRecognitionAlternativeLike = {
  transcript: string
  confidence: number
}

export type SpeechRecognitionResultLike = ArrayLike<SpeechRecognitionAlternativeLike> & {
  isFinal: boolean
}

export type SpeechRecognitionEventLike = {
  resultIndex: number
  results: ArrayLike<SpeechRecognitionResultLike>
}

export type SpeechRecognitionErrorEventLike = {
  error?: string
  message?: string
}

export type SpeechRecognitionLike = {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives?: number
  start: () => void
  stop: () => void
  abort: () => void
  onresult: ((event: SpeechRecognitionEventLike) => void) | null
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null
  onend: (() => void) | null
  onstart: (() => void) | null
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike

function getSpeechRecognitionConstructor(): SpeechRecognitionConstructor | null {
  if (typeof window === 'undefined') {
    return null
  }

  const candidate = window as unknown as {
    SpeechRecognition?: SpeechRecognitionConstructor
    webkitSpeechRecognition?: SpeechRecognitionConstructor
  }

  return candidate.SpeechRecognition ?? candidate.webkitSpeechRecognition ?? null
}

export function isSpeechRecognitionSupported(): boolean {
  return getSpeechRecognitionConstructor() !== null
}

export function createSpeechRecognition(): SpeechRecognitionLike | null {
  const Constructor = getSpeechRecognitionConstructor()
  return Constructor ? new Constructor() : null
}

export function extractFinalTranscripts(event: SpeechRecognitionEventLike): string[] {
  const transcripts: string[] = []

  for (let index = event.resultIndex; index < event.results.length; index += 1) {
    const result = event.results[index]
    if (!result?.isFinal) {
      continue
    }

    const transcript = result[0]?.transcript?.trim()
    if (transcript) {
      transcripts.push(transcript)
    }
  }

  return transcripts
}

export type NativeSpeechPermission = 'granted' | 'denied' | 'prompt'

export function isNativeSpeechPlatform(): boolean {
  return Capacitor.isNativePlatform()
}

export async function checkNativeSpeechAvailable(): Promise<boolean> {
  try {
    const result = await NativeSpeechRecognition.available()
    return Boolean(result?.available)
  } catch {
    return false
  }
}

export async function ensureNativeSpeechPermission(): Promise<NativeSpeechPermission> {
  try {
    const current = await NativeSpeechRecognition.checkPermissions()
    if (current.speechRecognition === 'granted') {
      return 'granted'
    }

    const requested = await NativeSpeechRecognition.requestPermissions()
    if (requested.speechRecognition === 'granted') {
      return 'granted'
    }

    return requested.speechRecognition === 'denied' ? 'denied' : 'prompt'
  } catch {
    return 'denied'
  }
}

export async function startNativeRecognitionOnce(language = 'zh-CN', popup = false): Promise<string[]> {
  const result = await NativeSpeechRecognition.start({
    language,
    maxResults: 3,
    partialResults: false,
    popup,
    prompt: 'Say Xiaobai plus a command',
  })

  return result?.matches ?? []
}

export async function stopNativeRecognition(): Promise<void> {
  try {
    await Promise.race([
      NativeSpeechRecognition.stop(),
      new Promise<void>((resolve) => {
        window.setTimeout(resolve, 250)
      }),
    ])
  } catch {
    // Stopping an idle recognizer is harmless on this plugin.
  }
}
