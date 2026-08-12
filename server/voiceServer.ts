import { createHash, randomBytes, randomUUID } from 'node:crypto'
import type { Server as HttpServer } from 'node:http'
import type express from 'express'
import WebSocket, { WebSocketServer, type RawData } from 'ws'
import type { AuthUser } from './auth.js'
import {
  buildAsrAudioRequest,
  buildAsrFullClientRequest,
  buildTtsFinishConnection,
  buildTtsSendTextRequest,
  parseAsrResponse,
  parseTtsResponse,
} from './doubaoProtocol.js'
import { VoiceBudgetError, voiceBudget } from './voiceBudget.js'

const ASR_ENDPOINT = 'wss://openspeech.bytedance.com/api/v3/sauc/bigmodel_async'
const TTS_ENDPOINT = 'wss://openspeech.bytedance.com/api/v3/tts/unidirectional/stream'
const MAX_AUDIO_FRAME_BYTES = 6_400
const MAX_AUDIO_BYTES = 640_000

type TicketRecord = {
  userId: string
  deviceId: string
  expiresAt: number
}

export class VoiceTicketStore {
  private readonly tickets = new Map<string, TicketRecord>()

  issue(userId: string, deviceId: string, ttlMs = 30_000): { ticket: string; expiresInMs: number } {
    const ticket = randomBytes(32).toString('base64url')
    this.prune()
    this.tickets.set(ticket, { userId, deviceId, expiresAt: Date.now() + ttlMs })
    return { ticket, expiresInMs: ttlMs }
  }

  consume(ticket: string): TicketRecord | null {
    const record = this.tickets.get(ticket)
    this.tickets.delete(ticket)
    if (!record || record.expiresAt <= Date.now()) {
      return null
    }
    return record
  }

  private prune(): void {
    const now = Date.now()
    for (const [ticket, record] of this.tickets) {
      if (record.expiresAt <= now) this.tickets.delete(ticket)
    }
  }
}

type VoiceServicesOptions = {
  getUser(request: express.Request): AuthUser | null
}

type AsrResult = {
  text: string
  definite: boolean
}

function parseAllowedOrigins(): Set<string> {
  return new Set(
    (process.env.VOICE_ALLOWED_ORIGINS ?? '')
      .split(/[\s,]+/)
      .map((value) => value.trim().replace(/\/$/, ''))
      .filter((value) => value && value !== '*'),
  )
}

export function isVoiceOriginAllowed(origin: string | undefined): boolean {
  if (!origin) return false
  return parseAllowedOrigins().has(origin.replace(/\/$/, ''))
}

function validDeviceId(value: unknown): value is string {
  return typeof value === 'string' && /^[a-zA-Z0-9._-]{8,120}$/.test(value)
}

function asBuffer(data: RawData): Buffer {
  if (Buffer.isBuffer(data)) return data
  if (Array.isArray(data)) return Buffer.concat(data)
  return Buffer.from(data)
}

function safeJson(value: RawData): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(asBuffer(value).toString('utf8')) as unknown
    return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : null
  } catch {
    return null
  }
}

function sendJson(socket: WebSocket, value: Record<string, unknown>): void {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(value))
}

function normalizeTranscript(value: string): string {
  return value.replace(/[\s，。！？、；：,.!?;:'"“”‘’]/g, '').toLowerCase()
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? value as Record<string, unknown> : null
}

function extractAsrResult(payload: unknown, sequence: number | null): AsrResult | null {
  const envelope = asRecord(payload)
  if (!envelope) return null
  const result = asRecord(envelope.result) ?? envelope
  const text = typeof result.text === 'string' ? result.text.trim() : ''
  const utterances = Array.isArray(result.utterances)
    ? result.utterances.map(asRecord).filter((value): value is Record<string, unknown> => value !== null)
    : []
  const utteranceText = utterances
    .map((item) => typeof item.text === 'string' ? item.text.trim() : '')
    .filter(Boolean)
    .join('')
  const finalText = utteranceText || text
  if (!finalText) return null
  return {
    text: finalText,
    definite: sequence !== null && sequence < 0
      || result.is_final === true
      || result.is_finish === true
      || utterances.some((item) => item.definite === true || item.is_final === true),
  }
}

function getAsrHeaders(requestId: string): Record<string, string> | null {
  const apiKey = process.env.DOUBAO_ASR_API_KEY?.trim()
  const appId = process.env.DOUBAO_SPEECH_APP_ID?.trim()
  const accessToken = process.env.DOUBAO_SPEECH_ACCESS_TOKEN?.trim()
  const auth: Record<string, string> | null = apiKey
    ? { 'X-Api-Key': apiKey }
    : appId && accessToken
      ? { 'X-Api-App-Key': appId, 'X-Api-Access-Key': accessToken }
      : null
  return auth ? {
    ...auth,
    'X-Api-Resource-Id': process.env.DOUBAO_ASR_RESOURCE_ID?.trim() || 'volc.seedasr.sauc.duration',
    'X-Api-Request-Id': requestId,
    'X-Api-Connect-Id': randomUUID(),
  } : null
}

function getTtsHeaders(requestId: string): Record<string, string> | null {
  const appId = process.env.DOUBAO_SPEECH_APP_ID?.trim()
  const accessToken = process.env.DOUBAO_SPEECH_ACCESS_TOKEN?.trim()
  return appId && accessToken ? {
    'X-Api-App-Key': appId,
    'X-Api-Access-Key': accessToken,
    'X-Api-Resource-Id': process.env.DOUBAO_TTS_RESOURCE_ID?.trim() || 'volc.service_type.10029',
    'X-Api-Request-Id': requestId,
    'X-Api-Connect-Id': randomUUID(),
  } : null
}

function writeSse(response: express.Response, event: string, payload: Record<string, unknown>): void {
  response.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`)
}

export function createVoiceServices({ getUser }: VoiceServicesOptions) {
  const tickets = new VoiceTicketStore()
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_AUDIO_FRAME_BYTES })
  const activeUsers = new Set<string>()
  const activeDevices = new Set<string>()
  const recentSessions = new Map<string, number[]>()
  let activeSessionCount = 0

  function allowSession(userId: string, deviceId: string): boolean {
    const now = Date.now()
    const key = `${userId}:${deviceId}`
    const recent = (recentSessions.get(key) ?? []).filter((timestamp) => now - timestamp < 60_000)
    const limit = Number(process.env.VOICE_SESSION_RATE_PER_MINUTE ?? 6)
    if (recent.length >= limit) return false
    recent.push(now)
    recentSessions.set(key, recent)
    return true
  }

  function sessionTicket(request: express.Request, response: express.Response): void {
    const user = getUser(request)
    if (!user) {
      response.status(401).json({ message: '请先登录。' })
      return
    }
    if (!isVoiceOriginAllowed(request.headers.origin)) {
      response.status(403).json({ message: '语音请求来源不在允许列表中。' })
      return
    }
    if (!validDeviceId(request.body?.deviceId)) {
      response.status(400).json({ message: 'deviceId 格式不合法。' })
      return
    }
    response.json(tickets.issue(user.id, request.body.deviceId))
  }

  async function tts(request: express.Request, response: express.Response): Promise<void> {
    const user = getUser(request)
    const text = typeof request.body?.text === 'string' ? request.body.text.trim() : ''
    const clientRequestId = typeof request.body?.requestId === 'string'
      ? request.body.requestId.slice(0, 80)
      : ''
    if (!user) {
      response.status(401).json({ message: '请先登录。' })
      return
    }
    if (!isVoiceOriginAllowed(request.headers.origin)) {
      response.status(403).json({ message: '语音请求来源不在允许列表中。' })
      return
    }
    if (!text || text.length > 500 || !clientRequestId) {
      response.status(400).json({ message: 'text 或 requestId 不合法。' })
      return
    }
    const headers = getTtsHeaders(randomUUID())
    if (!headers) {
      response.status(503).json({ message: '豆包 TTS 尚未配置。' })
      return
    }
    try {
      await voiceBudget.assertAvailable('tts', text.length)
      await voiceBudget.recordTts(text.length)
    } catch (error) {
      response.status(429).json({
        message: error instanceof VoiceBudgetError && error.reason === 'usage_file_invalid'
          ? '语音预算记录不可用，已停止云 TTS。'
          : '今日云 TTS 预算已用完。',
        code: 'BUDGET_LIMITED',
      })
      return
    }

    response.status(200)
    response.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
    response.setHeader('Cache-Control', 'no-cache, no-transform')
    response.setHeader('Connection', 'keep-alive')
    response.flushHeaders()

    const requestId = randomUUID()
    const startedAt = Date.now()
    let audioBytes = 0
    let done = false
    const upstream = new WebSocket(TTS_ENDPOINT, { headers, handshakeTimeout: 5_000 })
    const timeout = setTimeout(() => finish('error', 'TTS_TIMEOUT'), 20_000)

    const closeUpstream = () => {
      if (upstream.readyState === WebSocket.OPEN) {
        try { upstream.send(buildTtsFinishConnection()) } catch { /* best effort */ }
      }
      if (upstream.readyState === WebSocket.OPEN || upstream.readyState === WebSocket.CONNECTING) {
        upstream.close()
      }
    }
    const finish = (status: 'done' | 'error', category?: string) => {
      if (done) return
      done = true
      clearTimeout(timeout)
      if (!response.writableEnded && !response.destroyed) {
        writeSse(response, status, status === 'done'
          ? { requestId: clientRequestId, characters: text.length }
          : { requestId: clientRequestId, category: category || 'TTS_UPSTREAM' })
        response.end()
      }
      closeUpstream()
      console.info(JSON.stringify({
        requestId,
        service: 'tts',
        status,
        durationMs: Date.now() - startedAt,
        audioBytes,
        characters: text.length,
      }))
    }

    response.on('close', () => {
      if (!done) {
        done = true
        clearTimeout(timeout)
        closeUpstream()
      }
    })
    upstream.on('open', () => {
      writeSse(response, 'meta', {
        requestId: clientRequestId,
        provider: 'doubao',
        sampleRate: 24_000,
        channels: 1,
        encoding: 'pcm_s16le',
        voice: process.env.DOUBAO_TTS_VOICE_TYPE?.trim() || 'zh_female_vv_uranus_bigtts',
      })
      upstream.send(buildTtsSendTextRequest(
        user.id,
        text,
        process.env.DOUBAO_TTS_VOICE_TYPE?.trim() || 'zh_female_vv_uranus_bigtts',
      ))
    })
    upstream.on('message', (raw) => {
      try {
        const message = parseTtsResponse(asBuffer(raw))
        if (message.event === 352) {
          const encoded = typeof message.json?.data === 'string'
            ? message.json.data
            : message.payload.toString('base64')
          const bytes = typeof message.json?.data === 'string'
            ? Buffer.from(message.json.data, 'base64').length
            : message.payload.length
          audioBytes += bytes
          writeSse(response, 'audio', { requestId: clientRequestId, sequence: audioBytes, data: encoded })
        } else if (message.event === 152) {
          finish('done')
        } else if (message.event === 153 || message.messageType === 0x0f) {
          finish('error', 'TTS_UPSTREAM')
        }
      } catch {
        finish('error', 'TTS_PROTOCOL')
      }
    })
    upstream.on('error', () => finish('error', 'TTS_CONNECTION'))
    upstream.on('close', () => {
      if (!done) finish('error', 'TTS_CONNECTION')
    })
  }

  function attach(server: HttpServer): void {
    server.on('upgrade', (request, socket, head) => {
      let pathname = ''
      try {
        pathname = new URL(request.url ?? '/', 'http://kitchen.local').pathname
      } catch {
        socket.destroy()
        return
      }
      if (pathname !== '/api/voice/asr' || !isVoiceOriginAllowed(request.headers.origin)) {
        socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n')
        socket.destroy()
        return
      }
      wss.handleUpgrade(request, socket, head, (webSocket) => wss.emit('connection', webSocket, request))
    })
  }

  wss.on('connection', (client) => {
    const requestId = randomUUID()
    const startedAt = Date.now()
    let ticket: TicketRecord | null = null
    let upstream: WebSocket | null = null
    let phase: 'authenticate' | 'start' | 'audio' | 'finishing' | 'ended' = 'authenticate'
    let sequence = 1
    let audioBytes = 0
    let partialSequence = 0
    let lastPartial = ''
    let finalHash = ''
    let budgetRecorded = false
    let countedActive = false
    let finalTimer: NodeJS.Timeout | null = null
    let connectTimer: NodeJS.Timeout | null = null
    const prepareTimer = setTimeout(() => fail('CLIENT_READY_TIMEOUT'), 3_000)
    const sessionTimer = setTimeout(
      () => fail('ASR_SESSION_TIMEOUT'),
      Number(process.env.VOICE_ASR_SESSION_MAX_MS ?? 20_000),
    )

    const recordBudget = () => {
      if (budgetRecorded || audioBytes === 0) return
      budgetRecorded = true
      void voiceBudget.recordAsr(audioBytes / 32).catch(() => undefined)
    }
    const releaseActive = () => {
      if (!countedActive || !ticket) return
      countedActive = false
      activeSessionCount = Math.max(0, activeSessionCount - 1)
      activeUsers.delete(ticket.userId)
      activeDevices.delete(ticket.deviceId)
    }
    const cleanup = () => {
      if (phase === 'ended') return
      phase = 'ended'
      clearTimeout(prepareTimer)
      clearTimeout(sessionTimer)
      if (connectTimer) clearTimeout(connectTimer)
      if (finalTimer) clearTimeout(finalTimer)
      recordBudget()
      releaseActive()
      if (upstream?.readyState === WebSocket.OPEN || upstream?.readyState === WebSocket.CONNECTING) {
        upstream.close()
      }
      if (client.readyState === WebSocket.OPEN) client.close()
      console.info(JSON.stringify({
        requestId,
        service: 'asr',
        durationMs: Date.now() - startedAt,
        audioBytes,
      }))
    }
    const fail = (category: string) => {
      sendJson(client, { type: 'error', category, requestId })
      sendJson(client, { type: 'ended', requestId })
      cleanup()
    }
    const finish = async (text: string) => {
      const hash = createHash('sha256').update(text).digest('hex')
      if (finalHash || phase === 'ended') return
      finalHash = hash
      sendJson(client, { type: 'final', text, requestId })
      recordBudget()
      const usage = await voiceBudget.snapshot().catch(() => null)
      sendJson(client, {
        type: 'usage',
        requestId,
        asrMs: Math.round(audioBytes / 32),
        estimatedCostCny: usage?.estimatedCostCny ?? null,
      })
      sendJson(client, { type: 'ended', requestId })
      cleanup()
    }

    client.on('message', async (raw, isBinary) => {
      if (phase === 'ended') return
      if (phase === 'authenticate') {
        if (isBinary) return fail('AUTHENTICATION_REQUIRED')
        const message = safeJson(raw)
        const token = typeof message?.ticket === 'string' ? message.ticket : ''
        if (message?.type !== 'authenticate' || !token) return fail('INVALID_TICKET')
        ticket = tickets.consume(token)
        if (!ticket) return fail('INVALID_TICKET')
        phase = 'start'
        return
      }
      if (phase === 'start') {
        if (isBinary) return fail('START_REQUIRED')
        const message = safeJson(raw)
        const audio = asRecord(message?.audio)
        if (message?.type !== 'start'
          || audio?.encoding !== 'pcm_s16le'
          || audio.sampleRate !== 16_000
          || audio.channels !== 1
          || !ticket) {
          return fail('INVALID_AUDIO_CONFIG')
        }
        const maxConcurrent = Number(process.env.VOICE_MAX_CONCURRENT_SESSIONS ?? 2)
        if (activeSessionCount >= maxConcurrent
          || activeUsers.has(ticket.userId)
          || activeDevices.has(ticket.deviceId)
          || !allowSession(ticket.userId, ticket.deviceId)) {
          return fail('RATE_LIMITED')
        }
        try {
          await voiceBudget.assertAvailable('asr', Number(process.env.VOICE_ASR_SESSION_MAX_MS ?? 20_000))
        } catch {
          return fail('BUDGET_LIMITED')
        }
        const headers = getAsrHeaders(requestId)
        if (!headers) return fail('ASR_NOT_CONFIGURED')
        activeSessionCount += 1
        activeUsers.add(ticket.userId)
        activeDevices.add(ticket.deviceId)
        countedActive = true
        clearTimeout(prepareTimer)
        upstream = new WebSocket(ASR_ENDPOINT, { headers, handshakeTimeout: 5_000 })
        connectTimer = setTimeout(() => fail('ASR_CONNECT_TIMEOUT'), 5_000)
        upstream.on('open', () => {
          if (!upstream || !ticket || phase === 'ended') return
          if (connectTimer) clearTimeout(connectTimer)
          upstream.send(buildAsrFullClientRequest(ticket.userId))
          phase = 'audio'
          sendJson(client, { type: 'ready', requestId })
        })
        upstream.on('message', (data) => {
          try {
            const response = parseAsrResponse(asBuffer(data))
            if (response.messageType === 0x0f || response.errorCode) {
              fail('ASR_UPSTREAM')
              return
            }
            const result = extractAsrResult(response.payload, response.sequence)
            if (!result) return
            if (result.definite) {
              void finish(result.text)
              return
            }
            const normalized = normalizeTranscript(result.text)
            if (normalized && normalized !== lastPartial) {
              lastPartial = normalized
              partialSequence += 1
              sendJson(client, { type: 'partial', sequence: partialSequence, text: result.text, requestId })
            }
          } catch {
            fail('ASR_PROTOCOL')
          }
        })
        upstream.on('error', () => fail('ASR_CONNECTION'))
        upstream.on('close', () => {
          if (phase !== 'ended' && !finalHash) fail('ASR_CONNECTION')
        })
        return
      }
      if (phase !== 'audio' || !upstream || upstream.readyState !== WebSocket.OPEN) return
      if (isBinary) {
        const audio = asBuffer(raw)
        if (audio.length === 0 || audio.length > MAX_AUDIO_FRAME_BYTES || audio.length % 2 !== 0) {
          return fail('INVALID_AUDIO_FRAME')
        }
        if (audioBytes + audio.length > MAX_AUDIO_BYTES) return fail('AUDIO_LIMIT_EXCEEDED')
        audioBytes += audio.length
        upstream.send(buildAsrAudioRequest(sequence++, audio))
        return
      }
      const message = safeJson(raw)
      if (message?.type !== 'end') return fail('INVALID_CLIENT_MESSAGE')
      phase = 'finishing'
      upstream.send(buildAsrAudioRequest(sequence, Buffer.alloc(0), true))
      finalTimer = setTimeout(() => fail('ASR_FINAL_TIMEOUT'), 3_000)
    })
    client.on('error', cleanup)
    client.on('close', cleanup)
  })

  return { sessionTicket, tts, attach, tickets }
}
