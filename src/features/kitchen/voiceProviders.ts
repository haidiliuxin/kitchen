import { TextToSpeech } from '@capacitor-community/text-to-speech'
import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core'
import { buildApiUrl, createVoiceSessionTicket, getAuthToken } from '../../lib/api.js'

export type WakeWordListener = {
  onWakeWord(event: { phrase: string; generation: number; detectedAt: number }): void
  onError(error: VoiceProviderError): void
}

export type SpeechSessionOptions = {
  generation: number
  onReady(): void
  onPartial(event: { sequence: number; text: string }): void
  onFinal(text: string): void
  onUsage(event: { asrMs: number; estimatedCostCny: number | null }): void
  onError(error: VoiceProviderError): void
  onEnded(): void
}

export type SpeechOutputOptions = {
  requestId?: string
  onProvider?(provider: 'doubao' | 'android'): void
  onFallback?(reason: string, hadPlayedAudio: boolean): void
  onUsage?(characters: number): void
}

export interface WakeWordProvider {
  prepare(): Promise<void>
  start(listener: WakeWordListener): Promise<void>
  stop(): Promise<void>
  destroy(): Promise<void>
}

export interface SpeechToTextSession {
  start(): Promise<void>
  end(): Promise<void>
  stop(): Promise<void>
}

export interface SpeechToTextProvider {
  createSession(options: SpeechSessionOptions): Promise<SpeechToTextSession>
}

export interface TextToSpeechProvider {
  speak(text: string, options: SpeechOutputOptions, signal: AbortSignal): Promise<void>
  stop(): Promise<void>
}

type NativeStatus = {
  supported: boolean
  modelStatus: 'ready' | 'missing' | 'invalid' | 'runtime_missing'
  errorCode?: string
}

type NativeAudioFrame = {
  generation: number
  sequence: number
  data: string
}

type XiaobaiVoicePlugin = {
  prepare(): Promise<NativeStatus>
  startWakeWord(options: { generation: number }): Promise<void>
  stopWakeWord(): Promise<void>
  startCommandCapture(options: { generation: number }): Promise<void>
  stopCommandCapture(): Promise<void>
  startConversationVad(options: { generation: number }): Promise<void>
  stopConversationVad(): Promise<void>
  startPlayback(options: { sampleRate: number; channels: number }): Promise<void>
  enqueuePcm(options: { data: string }): Promise<void>
  finishPlayback(): Promise<void>
  stopPlayback(): Promise<void>
  release(): Promise<void>
  addListener(event: 'wakeDetected', listener: (event: { phrase: string; generation: number; detectedAt: number }) => void): Promise<PluginListenerHandle>
  addListener(event: 'audioFrame', listener: (event: NativeAudioFrame) => void): Promise<PluginListenerHandle>
  addListener(event: 'speechEnd', listener: (event: { generation: number }) => void): Promise<PluginListenerHandle>
  addListener(event: 'speechDetected', listener: (event: { generation: number }) => void): Promise<PluginListenerHandle>
  addListener(event: 'nativeError', listener: (event: { code: string; message?: string }) => void): Promise<PluginListenerHandle>
}

const XiaobaiVoice = registerPlugin<XiaobaiVoicePlugin>('XiaobaiVoice')

export class VoiceProviderError extends Error {
  readonly code: string

  constructor(code: string, message = code) {
    super(message)
    this.code = code
    this.name = 'VoiceProviderError'
  }
}

function decodeBase64(value: string): Uint8Array {
  const raw = atob(value)
  const bytes = new Uint8Array(raw.length)
  for (let index = 0; index < raw.length; index += 1) bytes[index] = raw.charCodeAt(index)
  return bytes
}

function websocketUrl(path: string): string {
  const url = new URL(buildApiUrl(path), window.location.href)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  return url.href
}

function getDeviceId(): string {
  const key = 'kitchen-helper:voice-device-id'
  const existing = window.localStorage.getItem(key)
  if (existing) return existing
  const value = `kitchen-${crypto.randomUUID()}`
  window.localStorage.setItem(key, value)
  return value
}

export class SherpaWakeWordProvider implements WakeWordProvider {
  private listenerHandle: PluginListenerHandle | null = null
  private errorHandle: PluginListenerHandle | null = null

  async prepare(): Promise<void> {
    if (!Capacitor.isNativePlatform()) throw new VoiceProviderError('PLATFORM_UNSUPPORTED')
    const status = await XiaobaiVoice.prepare()
    if (!status.supported || status.modelStatus !== 'ready') {
      const code = status.errorCode
        || (status.modelStatus === 'missing' ? 'MODEL_MISSING' : 'KWS_UNSUPPORTED')
      throw new VoiceProviderError(code)
    }
  }

  async start(listener: WakeWordListener): Promise<void> {
    await this.stop()
    this.listenerHandle = await XiaobaiVoice.addListener('wakeDetected', listener.onWakeWord)
    this.errorHandle = await XiaobaiVoice.addListener('nativeError', (event) => {
      listener.onError(new VoiceProviderError(event.code, event.message))
    })
  }

  async startGeneration(generation: number): Promise<void> {
    await XiaobaiVoice.startWakeWord({ generation })
  }

  async startConversationVad(generation: number, listener: () => void): Promise<PluginListenerHandle> {
    const handle = await XiaobaiVoice.addListener('speechDetected', (event) => {
      if (event.generation === generation) listener()
    })
    await XiaobaiVoice.startConversationVad({ generation })
    return handle
  }

  async stopConversationVad(): Promise<void> {
    await XiaobaiVoice.stopConversationVad().catch(() => undefined)
  }

  async stop(): Promise<void> {
    await XiaobaiVoice.stopWakeWord().catch(() => undefined)
    await this.listenerHandle?.remove().catch(() => undefined)
    await this.errorHandle?.remove().catch(() => undefined)
    this.listenerHandle = null
    this.errorHandle = null
  }

  async destroy(): Promise<void> {
    await this.stop()
    await XiaobaiVoice.release().catch(() => undefined)
  }
}

export class DoubaoSpeechToTextProvider implements SpeechToTextProvider {
  async createSession(options: SpeechSessionOptions): Promise<SpeechToTextSession> {
    const { ticket } = await createVoiceSessionTicket(getDeviceId())
    let socket: WebSocket | null = null
    let ended = false
    let ready = false
    let starting = false
    let audioHandle: PluginListenerHandle | null = null
    let endHandle: PluginListenerHandle | null = null
    let errorHandle: PluginListenerHandle | null = null

    const cleanupNative = async () => {
      await XiaobaiVoice.stopCommandCapture().catch(() => undefined)
      await Promise.all([
        audioHandle?.remove(),
        endHandle?.remove(),
        errorHandle?.remove(),
      ].filter((value): value is Promise<void> => Boolean(value)).map((value) => value.catch(() => undefined)))
      audioHandle = null
      endHandle = null
      errorHandle = null
    }
    const stop = async () => {
      if (ended) return
      ended = true
      await cleanupNative()
      if (socket?.readyState === WebSocket.OPEN || socket?.readyState === WebSocket.CONNECTING) socket.close()
      options.onEnded()
    }
    const end = async () => {
      await XiaobaiVoice.stopCommandCapture().catch(() => undefined)
      if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'end' }))
    }

    return {
      start: () => new Promise<void>((resolve, reject) => {
        socket = new WebSocket(websocketUrl('/api/voice/asr'))
        socket.binaryType = 'arraybuffer'
        socket.onopen = () => {
          socket?.send(JSON.stringify({ type: 'authenticate', ticket }))
          socket?.send(JSON.stringify({
            type: 'start',
            audio: { encoding: 'pcm_s16le', sampleRate: 16_000, channels: 1 },
          }))
        }
        socket.onmessage = (event) => {
          if (typeof event.data !== 'string') return
          let message: Record<string, unknown>
          try { message = JSON.parse(event.data) as Record<string, unknown> } catch { return }
          if (message.type === 'ready' && !ready && !starting) {
            starting = true
            void (async () => {
              audioHandle = await XiaobaiVoice.addListener('audioFrame', (frame) => {
                if (frame.generation === options.generation && socket?.readyState === WebSocket.OPEN) {
                  socket.send(decodeBase64(frame.data))
                }
              })
              endHandle = await XiaobaiVoice.addListener('speechEnd', (frame) => {
                if (frame.generation === options.generation) void end()
              })
              errorHandle = await XiaobaiVoice.addListener('nativeError', (nativeError) => {
                options.onError(new VoiceProviderError(nativeError.code, nativeError.message))
              })
              if (ended) throw new VoiceProviderError('ASR_CONNECTION')
              await XiaobaiVoice.startCommandCapture({ generation: options.generation })
              if (ended) {
                await XiaobaiVoice.stopCommandCapture().catch(() => undefined)
                throw new VoiceProviderError('ASR_CONNECTION')
              }
              ready = true
              options.onReady()
              resolve()
            })().catch((error: unknown) => {
              const providerError = error instanceof VoiceProviderError
                ? error
                : new VoiceProviderError('NATIVE_CAPTURE_FAILED')
              void stop()
              reject(providerError)
            })
          } else if (message.type === 'partial'
            && typeof message.sequence === 'number'
            && typeof message.text === 'string') {
            options.onPartial({ sequence: message.sequence, text: message.text })
          } else if (message.type === 'final' && typeof message.text === 'string') {
            options.onFinal(message.text)
          } else if (message.type === 'usage') {
            options.onUsage({
              asrMs: typeof message.asrMs === 'number' ? message.asrMs : 0,
              estimatedCostCny: typeof message.estimatedCostCny === 'number' ? message.estimatedCostCny : null,
            })
          } else if (message.type === 'error') {
            const error = new VoiceProviderError(
              typeof message.category === 'string' ? message.category : 'ASR_FAILED',
            )
            if (ready) options.onError(error)
            else reject(error)
          } else if (message.type === 'ended') {
            void stop()
          }
        }
        socket.onerror = () => {
          const error = new VoiceProviderError('ASR_CONNECTION')
          if (ready) options.onError(error)
          else reject(error)
        }
        socket.onclose = () => {
          if (!ready) reject(new VoiceProviderError('ASR_CONNECTION'))
          if (!ended) void stop()
        }
      }),
      end,
      stop,
    }
  }
}

export class AndroidTextToSpeechProvider implements TextToSpeechProvider {
  async speak(text: string, options: SpeechOutputOptions, signal: AbortSignal): Promise<void> {
    const value = text.trim()
    if (!value || signal.aborted) return
    options.onProvider?.('android')
    if (Capacitor.isNativePlatform()) {
      await TextToSpeech.stop().catch(() => undefined)
      await TextToSpeech.speak({ text: value, lang: 'zh-CN', rate: 0.95, pitch: 1, volume: 1 })
      return
    }
    if (!('speechSynthesis' in window)) return
    await new Promise<void>((resolve) => {
      const utterance = new SpeechSynthesisUtterance(value)
      utterance.lang = 'zh-CN'
      utterance.rate = 0.98
      utterance.onend = () => resolve()
      utterance.onerror = () => resolve()
      const abort = () => { window.speechSynthesis.cancel(); resolve() }
      signal.addEventListener('abort', abort, { once: true })
      window.speechSynthesis.cancel()
      window.speechSynthesis.speak(utterance)
    })
  }

  async stop(): Promise<void> {
    if (Capacitor.isNativePlatform()) await TextToSpeech.stop().catch(() => undefined)
    else if ('speechSynthesis' in window) window.speechSynthesis.cancel()
  }
}

type SseEvent = { event: string; data: Record<string, unknown> }

function parseSseBlock(block: string): SseEvent | null {
  let event = 'message'
  const data: string[] = []
  for (const line of block.split(/\r?\n/)) {
    if (line.startsWith('event:')) event = line.slice(6).trim()
    if (line.startsWith('data:')) data.push(line.slice(5).trim())
  }
  if (!data.length) return null
  try { return { event, data: JSON.parse(data.join('\n')) as Record<string, unknown> } } catch { return null }
}

export class DoubaoTextToSpeechProvider implements TextToSpeechProvider {
  private controller: AbortController | null = null
  private readonly fallback: AndroidTextToSpeechProvider

  constructor(fallback = new AndroidTextToSpeechProvider()) {
    this.fallback = fallback
  }

  async speak(text: string, options: SpeechOutputOptions, signal: AbortSignal): Promise<void> {
    await this.stop()
    if (signal.aborted) return
    const controller = new AbortController()
    this.controller = controller
    const onAbort = () => controller.abort()
    signal.addEventListener('abort', onAbort, { once: true })
    let played = false
    let nativeErrorHandle: PluginListenerHandle | null = null
    try {
      const token = getAuthToken()
      if (!token || !Capacitor.isNativePlatform()) throw new VoiceProviderError('CLOUD_TTS_UNAVAILABLE')
      const response = await fetch(buildApiUrl('/api/voice/tts'), {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, requestId: options.requestId || crypto.randomUUID() }),
        signal: controller.signal,
      })
      if (!response.ok || !response.body) throw new VoiceProviderError(response.status === 429 ? 'BUDGET_LIMITED' : 'TTS_REQUEST_FAILED')
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let finished = false
      while (!finished) {
        const { done, value } = await reader.read()
        buffer += decoder.decode(value, { stream: !done })
        const blocks = buffer.split(/\r?\n\r?\n/)
        buffer = blocks.pop() ?? ''
        for (const block of blocks) {
          const event = parseSseBlock(block)
          if (!event) continue
          if (event.event === 'meta') {
            await XiaobaiVoice.startPlayback({ sampleRate: 24_000, channels: 1 })
            nativeErrorHandle = await XiaobaiVoice.addListener('nativeError', () => controller.abort())
            options.onProvider?.('doubao')
          } else if (event.event === 'audio' && typeof event.data.data === 'string') {
            played = true
            await XiaobaiVoice.enqueuePcm({ data: event.data.data })
          } else if (event.event === 'done') {
            finished = true
            options.onUsage?.(typeof event.data.characters === 'number' ? event.data.characters : text.length)
          } else if (event.event === 'error') {
            throw new VoiceProviderError(typeof event.data.category === 'string' ? event.data.category : 'TTS_UPSTREAM')
          }
        }
        if (done) break
      }
      if (!finished) throw new VoiceProviderError('TTS_INCOMPLETE')
      await XiaobaiVoice.finishPlayback()
    } catch (error) {
      await XiaobaiVoice.stopPlayback().catch(() => undefined)
      if (signal.aborted || controller.signal.aborted) return
      const reason = error instanceof VoiceProviderError ? error.code : 'TTS_FAILED'
      options.onFallback?.(reason, played)
      await this.fallback.speak(text, options, signal)
    } finally {
      signal.removeEventListener('abort', onAbort)
      await nativeErrorHandle?.remove().catch(() => undefined)
      if (this.controller === controller) this.controller = null
    }
  }

  async stop(): Promise<void> {
    this.controller?.abort()
    this.controller = null
    await XiaobaiVoice.stopPlayback().catch(() => undefined)
    await this.fallback.stop()
  }
}

export const defaultTextToSpeechProvider = new DoubaoTextToSpeechProvider()
