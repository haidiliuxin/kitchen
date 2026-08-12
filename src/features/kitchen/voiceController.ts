import { App as CapacitorApp } from '@capacitor/app'
import type { PluginListenerHandle } from '@capacitor/core'
import type {
  DoubaoSpeechToTextProvider,
  DoubaoTextToSpeechProvider,
  SherpaWakeWordProvider,
  SpeechToTextSession,
  VoiceProviderError,
} from './voiceProviders.js'

export type VoiceState =
  | 'disabled'
  | 'requesting_permission'
  | 'preparing'
  | 'waiting_for_wake_word'
  | 'wake_detected'
  | 'capturing_command'
  | 'transcribing'
  | 'processing_local_command'
  | 'requesting_ai'
  | 'speaking'
  | 'conversation_window'
  | 'recovering'
  | 'permission_denied'
  | 'unsupported'
  | 'budget_limited'
  | 'error'

export type VoiceSnapshot = {
  state: VoiceState
  generation: number
  partial: string
  final: string
  provider: string
  fallback: string
  permission: 'unknown' | 'granted' | 'denied'
  errorCategory: string
  nativeErrorCode: string
  latencyMs: number | null
  estimatedCostCny: number
}

export type VoiceEvent =
  | { type: 'ENABLE' }
  | { type: 'PERMISSION_GRANTED' }
  | { type: 'PERMISSION_DENIED' }
  | { type: 'PREPARED' }
  | { type: 'UNSUPPORTED'; code: string }
  | { type: 'WAKE'; generation: number }
  | { type: 'CAPTURE'; generation?: number }
  | { type: 'TRANSCRIBE' }
  | { type: 'PROCESS_LOCAL' }
  | { type: 'REQUEST_AI' }
  | { type: 'SPEAK' }
  | { type: 'SPEECH_DONE' }
  | { type: 'CONVERSATION_SPEECH'; generation: number }
  | { type: 'WINDOW_TIMEOUT' }
  | { type: 'RECOVER' }
  | { type: 'RECOVERY_FAILED' }
  | { type: 'BUDGET_LIMITED' }
  | { type: 'DIAGNOSTIC'; patch: Partial<VoiceSnapshot> }
  | { type: 'DISABLE' }
  | { type: 'FATAL'; code: string }

export class VoiceTransitionError extends Error {
  constructor(state: VoiceState, event: VoiceEvent['type']) {
    super(`Illegal voice transition: ${state} -> ${event}`)
    this.name = 'VoiceTransitionError'
  }
}

const nextStates: Partial<Record<VoiceState, Partial<Record<VoiceEvent['type'], VoiceState>>>> = {
  disabled: { ENABLE: 'requesting_permission' },
  requesting_permission: { PERMISSION_GRANTED: 'preparing', PERMISSION_DENIED: 'permission_denied' },
  preparing: {
    PREPARED: 'waiting_for_wake_word', PERMISSION_DENIED: 'permission_denied',
    UNSUPPORTED: 'unsupported', WAKE: 'wake_detected',
  },
  waiting_for_wake_word: { WAKE: 'wake_detected' },
  wake_detected: { CAPTURE: 'capturing_command' },
  capturing_command: {
    TRANSCRIBE: 'transcribing', RECOVER: 'recovering', RECOVERY_FAILED: 'waiting_for_wake_word',
    BUDGET_LIMITED: 'budget_limited',
  },
  transcribing: {
    PROCESS_LOCAL: 'processing_local_command', REQUEST_AI: 'requesting_ai',
    RECOVER: 'recovering', RECOVERY_FAILED: 'waiting_for_wake_word',
  },
  processing_local_command: {
    SPEAK: 'speaking', SPEECH_DONE: 'conversation_window', WINDOW_TIMEOUT: 'waiting_for_wake_word',
  },
  requesting_ai: {
    SPEAK: 'speaking', SPEECH_DONE: 'conversation_window', BUDGET_LIMITED: 'budget_limited', RECOVER: 'recovering',
  },
  speaking: { SPEECH_DONE: 'conversation_window', CAPTURE: 'capturing_command' },
  conversation_window: {
    CONVERSATION_SPEECH: 'capturing_command', WINDOW_TIMEOUT: 'waiting_for_wake_word',
  },
  recovering: { CAPTURE: 'capturing_command', RECOVERY_FAILED: 'waiting_for_wake_word' },
  budget_limited: { WINDOW_TIMEOUT: 'waiting_for_wake_word', DISABLE: 'disabled' },
  permission_denied: { ENABLE: 'requesting_permission' },
  unsupported: { ENABLE: 'requesting_permission' },
}

export const initialVoiceSnapshot: VoiceSnapshot = {
  state: 'disabled',
  generation: 0,
  partial: '',
  final: '',
  provider: 'none',
  fallback: '',
  permission: 'unknown',
  errorCategory: '',
  nativeErrorCode: '',
  latencyMs: null,
  estimatedCostCny: 0,
}

export function voiceReducer(snapshot: VoiceSnapshot, event: VoiceEvent): VoiceSnapshot {
  if (event.type === 'DIAGNOSTIC') return { ...snapshot, ...event.patch }
  if (event.type === 'DISABLE') return { ...initialVoiceSnapshot, generation: snapshot.generation, state: 'disabled' }
  if (event.type === 'FATAL') return { ...snapshot, state: 'error', errorCategory: event.code }
  const next = nextStates[snapshot.state]?.[event.type]
  if (!next) throw new VoiceTransitionError(snapshot.state, event.type)
  const patch: Partial<VoiceSnapshot> = { state: next }
  if (event.type === 'ENABLE') patch.generation = snapshot.generation + 1
  if (event.type === 'PERMISSION_GRANTED') patch.permission = 'granted'
  if (event.type === 'PERMISSION_DENIED') patch.permission = 'denied'
  if (event.type === 'WAKE' || event.type === 'CONVERSATION_SPEECH') {
    patch.generation = event.generation
    patch.partial = ''
    patch.final = ''
  }
  if (event.type === 'CAPTURE' && event.generation !== undefined) patch.generation = event.generation
  if (event.type === 'UNSUPPORTED') {
    patch.nativeErrorCode = event.code
    patch.errorCategory = 'unsupported'
  }
  if (event.type === 'BUDGET_LIMITED') patch.errorCategory = 'budget_limited'
  return { ...snapshot, ...patch }
}

export type VoiceProcessingResult = {
  kind: 'local' | 'ai'
  speech?: string
  exit?: boolean
  disable?: boolean
  recapture?: boolean
  budgetLimited?: boolean
}

type VoiceControllerOptions = {
  wakeWord: SherpaWakeWordProvider
  speechToText: DoubaoSpeechToTextProvider
  textToSpeech: DoubaoTextToSpeechProvider
  recognizeWithSystem(): Promise<string>
  classifyTranscript(text: string): 'local' | 'ai'
  handleTranscript(text: string, signal: AbortSignal): Promise<VoiceProcessingResult>
}

export class VoiceController {
  private snapshot: VoiceSnapshot = initialVoiceSnapshot
  private readonly listeners = new Set<(snapshot: VoiceSnapshot) => void>()
  private session: SpeechToTextSession | null = null
  private workController: AbortController | null = null
  private windowTimer: number | null = null
  private vadHandle: PluginListenerHandle | null = null
  private appHandle: PluginListenerHandle | null = null
  private finalKeys = new Set<string>()
  private finalGeneration = -1
  private partialSequence = 0
  private recoveryUsed = false
  private readonly options: VoiceControllerOptions

  constructor(options: VoiceControllerOptions) {
    this.options = options
  }

  getSnapshot(): VoiceSnapshot {
    return this.snapshot
  }

  subscribe(listener: (snapshot: VoiceSnapshot) => void): () => void {
    this.listeners.add(listener)
    listener(this.snapshot)
    return () => this.listeners.delete(listener)
  }

  private emit(event: VoiceEvent): void {
    try {
      this.snapshot = voiceReducer(this.snapshot, event)
    } catch (error) {
      this.snapshot = voiceReducer(this.snapshot, {
        type: 'FATAL',
        code: error instanceof VoiceTransitionError ? 'INVALID_TRANSITION' : 'STATE_MACHINE_ERROR',
      })
    }
    this.listeners.forEach((listener) => listener(this.snapshot))
  }

  async enable(): Promise<void> {
    if (!['disabled', 'unsupported', 'permission_denied'].includes(this.snapshot.state)) return
    this.emit({ type: 'ENABLE' })
    this.recoveryUsed = false
    this.finalKeys.clear()
    try {
      this.emit({ type: 'PERMISSION_GRANTED' })
      await this.options.wakeWord.prepare()
      this.emit({ type: 'PREPARED' })
      await this.startWaitingForWakeWord()
      this.appHandle = await CapacitorApp.addListener('appStateChange', ({ isActive }) => {
        if (!isActive) void this.disable()
      })
    } catch (error) {
      const code = error instanceof Error && 'code' in error ? String(error.code) : 'KWS_UNSUPPORTED'
      if (code === 'PERMISSION_DENIED') this.emit({ type: 'PERMISSION_DENIED' })
      else this.emit({ type: 'UNSUPPORTED', code })
    }
  }

  async captureWithSystemRecognizer(): Promise<void> {
    await this.disable()
    this.emit({ type: 'ENABLE' })
    this.emit({ type: 'PERMISSION_GRANTED' })
    const generation = this.snapshot.generation + 1
    this.emit({ type: 'WAKE', generation })
    this.emit({ type: 'CAPTURE', generation })
    this.emit({ type: 'DIAGNOSTIC', patch: { provider: 'system', partial: '', final: '' } })
    try {
      const transcript = await this.options.recognizeWithSystem()
      if (!transcript.trim()) throw new Error('NO_MATCH')
      this.emit({ type: 'TRANSCRIBE' })
      await this.processFinal(transcript, generation)
    } catch (error) {
      this.emit({ type: 'FATAL', code: error instanceof Error ? error.message : 'SYSTEM_ASR_FAILED' })
    }
  }

  private async captureCloud(generation: number, stateAlreadyCapturing = false): Promise<void> {
    if (this.windowTimer !== null) window.clearTimeout(this.windowTimer)
    this.windowTimer = null
    await this.options.wakeWord.stopConversationVad()
    await this.vadHandle?.remove().catch(() => undefined)
    this.vadHandle = null
    await this.options.wakeWord.stop()
    if (generation < this.snapshot.generation || this.snapshot.state === 'disabled') return
    if (!stateAlreadyCapturing) this.emit({ type: 'CAPTURE', generation })
    this.partialSequence = 0
    let ready = false
    try {
      this.session = await this.options.speechToText.createSession({
        generation,
        onReady: () => {
          if (generation !== this.snapshot.generation) return
          ready = true
          this.emit({ type: 'DIAGNOSTIC', patch: { provider: 'doubao-asr' } })
        },
        onPartial: ({ sequence, text }) => {
          if (generation !== this.snapshot.generation || sequence <= this.partialSequence) return
          this.partialSequence = sequence
          this.emit({ type: 'DIAGNOSTIC', patch: { partial: text } })
        },
        onFinal: (text) => {
          if (generation !== this.snapshot.generation || this.finalGeneration === generation) return
          this.finalGeneration = generation
          this.emit({ type: 'TRANSCRIBE' })
          void this.processFinal(text, generation)
        },
        onUsage: ({ estimatedCostCny }) => {
          if (generation !== this.snapshot.generation || estimatedCostCny === null) return
          this.emit({ type: 'DIAGNOSTIC', patch: { estimatedCostCny } })
        },
        onError: (error) => {
          if (generation === this.snapshot.generation) void this.handleCaptureError(error, ready, generation)
        },
        onEnded: () => { this.session = null },
      })
      await this.session.start()
    } catch (error) {
      await this.handleCaptureError(error, ready, generation)
    }
  }

  private async handleCaptureError(error: unknown, ready: boolean, generation: number): Promise<void> {
    if (generation !== this.snapshot.generation
      || !['capturing_command', 'transcribing', 'recovering'].includes(this.snapshot.state)) return
    const code = error instanceof Error && 'code' in error ? String(error.code) : 'ASR_FAILED'
    if (code === 'BUDGET_LIMITED') {
      if (this.snapshot.state === 'capturing_command') {
        this.emit({ type: 'BUDGET_LIMITED' })
        this.scheduleBudgetReturn()
      }
      else this.emit({ type: 'FATAL', code })
      return
    }
    const recoverable = !ready || code === 'NO_MATCH' || code === 'ASR_FINAL_TIMEOUT'
    if (recoverable && !this.recoveryUsed && generation === this.snapshot.generation) {
      this.recoveryUsed = true
      this.emit({ type: 'RECOVER' })
      await new Promise((resolve) => window.setTimeout(resolve, 500))
      if (generation !== this.snapshot.generation || this.snapshot.state !== 'recovering') return
      const nextGeneration = generation + 1
      this.emit({ type: 'CAPTURE', generation: nextGeneration })
      await this.captureCloud(nextGeneration, true)
      return
    }
    this.emit({ type: 'DIAGNOSTIC', patch: { errorCategory: code } })
    if (this.snapshot.state === 'recovering' || this.recoveryUsed) {
      await this.session?.stop().catch(() => undefined)
      this.emit({ type: 'RECOVERY_FAILED' })
      await this.startWaitingForWakeWord()
    }
    else this.emit({ type: 'FATAL', code })
  }

  private async processFinal(text: string, generation: number): Promise<void> {
    const normalized = text.replace(/\s+/g, '').toLowerCase()
    if (!normalized) {
      await this.handleCaptureError(
        Object.assign(new Error('NO_MATCH'), { code: 'NO_MATCH' }),
        true,
        generation,
      )
      return
    }
    const key = `${generation}:${normalized}`
    if (this.finalKeys.has(key) || generation !== this.snapshot.generation) return
    this.finalKeys.add(key)
    this.emit({ type: 'DIAGNOSTIC', patch: { final: text, partial: '' } })
    const kind = this.options.classifyTranscript(text)
    this.emit({ type: kind === 'local' ? 'PROCESS_LOCAL' : 'REQUEST_AI' })
    this.workController?.abort()
    const controller = new AbortController()
    this.workController = controller
    const startedAt = performance.now()
    let result: VoiceProcessingResult
    try {
      result = await this.options.handleTranscript(text, controller.signal)
    } catch {
      if (generation === this.snapshot.generation && !controller.signal.aborted) {
        this.emit({ type: 'FATAL', code: 'VOICE_PROCESSING_FAILED' })
      }
      return
    }
    if (generation !== this.snapshot.generation || controller.signal.aborted) return
    this.emit({ type: 'DIAGNOSTIC', patch: { latencyMs: Math.round(performance.now() - startedAt) } })
    if (result.disable) {
      await this.disable()
      return
    }
    if (result.exit) {
      this.emit({ type: 'WINDOW_TIMEOUT' })
      await this.startWaitingForWakeWord()
      return
    }
    if (result.budgetLimited && this.snapshot.state === 'requesting_ai') {
      this.emit({ type: 'BUDGET_LIMITED' })
      this.scheduleBudgetReturn()
      return
    }
    if (result.speech) {
      this.emit({ type: 'SPEAK' })
      await this.options.textToSpeech.speak(result.speech, {
        onProvider: (provider) => this.emit({ type: 'DIAGNOSTIC', patch: { provider: `${provider}-tts` } }),
        onFallback: (reason, hadPlayedAudio) => this.emit({
          type: 'DIAGNOSTIC',
          patch: { fallback: `${reason}${hadPlayedAudio ? ':restart' : ''}` },
        }),
      }, controller.signal)
      if (generation !== this.snapshot.generation || controller.signal.aborted) return
      await new Promise((resolve) => window.setTimeout(resolve, 600))
    }
    if (result.recapture) {
      await this.captureCloud(this.snapshot.generation + 1)
      return
    }
    this.emit({ type: 'SPEECH_DONE' })
    await this.openConversationWindow()
  }

  private async openConversationWindow(): Promise<void> {
    const generation = this.snapshot.generation
    this.vadHandle = await this.options.wakeWord.startConversationVad(generation, () => {
      if (this.snapshot.state !== 'conversation_window') return
      const nextGeneration = this.snapshot.generation + 1
      this.emit({ type: 'CONVERSATION_SPEECH', generation: nextGeneration })
      void this.captureCloud(nextGeneration, true)
    }).catch(() => null)
    if (!this.vadHandle) {
      this.emit({ type: 'WINDOW_TIMEOUT' })
      await this.startWaitingForWakeWord()
      return
    }
    this.windowTimer = window.setTimeout(() => {
      if (this.snapshot.state === 'conversation_window') {
        this.emit({ type: 'WINDOW_TIMEOUT' })
        void this.startWaitingForWakeWord()
      }
    }, 10_000)
  }

  private async startWaitingForWakeWord(): Promise<void> {
    if (this.snapshot.state !== 'waiting_for_wake_word') return
    await this.options.wakeWord.stopConversationVad()
    await this.vadHandle?.remove().catch(() => undefined)
    this.vadHandle = null
    if (this.snapshot.state !== 'waiting_for_wake_word') return
    await this.options.wakeWord.start({
      onWakeWord: (event) => {
        if (this.snapshot.state !== 'waiting_for_wake_word') return
        const nextGeneration = Math.max(this.snapshot.generation + 1, event.generation)
        this.emit({ type: 'WAKE', generation: nextGeneration })
        void this.captureCloud(nextGeneration)
      },
      onError: (error) => this.nativeError(error),
    })
    await this.options.wakeWord.startGeneration(this.snapshot.generation)
  }

  private scheduleBudgetReturn(): void {
    if (this.windowTimer !== null) window.clearTimeout(this.windowTimer)
    this.windowTimer = window.setTimeout(() => {
      if (this.snapshot.state !== 'budget_limited') return
      this.emit({ type: 'WINDOW_TIMEOUT' })
      void this.startWaitingForWakeWord()
    }, 1_200)
  }

  private nativeError(error: VoiceProviderError): void {
    this.emit({ type: 'DIAGNOSTIC', patch: { nativeErrorCode: error.code } })
  }

  async stopSpeakingAndCapture(): Promise<void> {
    if (this.snapshot.state !== 'speaking') return
    this.workController?.abort()
    await this.options.textToSpeech.stop()
    const generation = this.snapshot.generation + 1
    await this.captureCloud(generation)
  }

  async disable(): Promise<void> {
    this.emit({ type: 'DISABLE' })
    this.workController?.abort()
    this.workController = null
    if (this.windowTimer !== null) window.clearTimeout(this.windowTimer)
    this.windowTimer = null
    await this.session?.stop().catch(() => undefined)
    this.session = null
    await this.vadHandle?.remove().catch(() => undefined)
    this.vadHandle = null
    await this.options.wakeWord.stopConversationVad()
    await this.options.wakeWord.destroy()
    await this.options.textToSpeech.stop()
    await this.appHandle?.remove().catch(() => undefined)
    this.appHandle = null
  }
}
