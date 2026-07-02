import crypto from 'node:crypto'
import WebSocket from 'ws'

export type AsrErrorType =
  | 'ASR_MISSING_CONFIG'
  | 'ASR_AUTH_FAILED'
  | 'ASR_ABILITY_NOT_ENABLED'
  | 'ASR_REQUEST_FAILED'
  | 'ASR_TIMEOUT'
  | 'ASR_NO_TEXT'

export class AsrError extends Error {
  type: AsrErrorType
  raw?: unknown

  constructor(type: AsrErrorType, message: string, raw?: unknown) {
    super(message)
    this.name = 'AsrError'
    this.type = type
    this.raw = raw
  }
}

export type AsrTranscriptResult = {
  text: string
  raw: unknown[]
}

type MultipartAudioFile = {
  fieldName: string
  originalName: string
  mimeType: string
  buffer: Buffer
}

function parseHeaderValue(headers: string, name: string): string {
  const pattern = new RegExp(`${name}="([^"]*)"`, 'i')
  return headers.match(pattern)?.[1] ?? ''
}

export function parseMultipartAudioUpload(
  contentType: string,
  body: Buffer,
): { file: MultipartAudioFile | null; fields: Record<string, string> } {
  const boundary = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i)?.[1]
    ?? contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i)?.[2]

  if (!boundary) {
    throw new Error('multipart boundary missing')
  }

  const boundaryBuffer = Buffer.from(`--${boundary}`)
  const parts: Buffer[] = []
  let cursor = body.indexOf(boundaryBuffer)

  while (cursor !== -1) {
    const next = body.indexOf(boundaryBuffer, cursor + boundaryBuffer.length)
    if (next === -1) {
      break
    }

    parts.push(body.subarray(cursor + boundaryBuffer.length, next))
    cursor = next
  }

  const fields: Record<string, string> = {}
  let file: MultipartAudioFile | null = null

  for (const rawPart of parts) {
    let part = rawPart
    if (part.subarray(0, 2).toString() === '\r\n') {
      part = part.subarray(2)
    }
    if (part.subarray(part.length - 2).toString() === '\r\n') {
      part = part.subarray(0, part.length - 2)
    }

    const separator = Buffer.from('\r\n\r\n')
    const separatorIndex = part.indexOf(separator)
    if (separatorIndex === -1) {
      continue
    }

    const headerText = part.subarray(0, separatorIndex).toString('utf8')
    const content = part.subarray(separatorIndex + separator.length)
    const disposition = headerText.match(/content-disposition:\s*([^\r\n]+)/i)?.[1] ?? ''
    const fieldName = parseHeaderValue(disposition, 'name')
    const filename = parseHeaderValue(disposition, 'filename')
    const mimeType = headerText.match(/content-type:\s*([^\r\n]+)/i)?.[1]?.trim() ?? 'application/octet-stream'

    if (!fieldName) {
      continue
    }

    if (filename) {
      file = {
        fieldName,
        originalName: filename,
        mimeType,
        buffer: content,
      }
    } else {
      fields[fieldName] = content.toString('utf8').trim()
    }
  }

  return { file, fields }
}

function getAsrAppKey(): string {
  return process.env.VIVO_ASR_APP_KEY?.trim()
    || process.env.VIVO_AIGC_APP_KEY?.trim()
    || process.env.OCR_VIVO_APP_KEY?.trim()
    || ''
}

function getStableUserId(): string {
  const configured = process.env.VIVO_ASR_USER_ID?.trim()
  if (configured && /^[a-z0-9]{32}$/.test(configured)) {
    return configured
  }

  return crypto.createHash('md5').update(process.cwd()).digest('hex')
}

function classifyAsrError(message: string, raw?: unknown): AsrError {
  const normalized = message.toLowerCase()
  if (normalized.includes('invalid api-key') || normalized.includes('missing required app_id')) {
    return new AsrError('ASR_AUTH_FAILED', 'vivo ASR 鉴权失败，请检查 AppKey。', raw)
  }
  if (normalized.includes('not having this ability')) {
    return new AsrError('ASR_ABILITY_NOT_ENABLED', '当前 AppKey 没有实时短语音识别能力，请在 vivo AIGC 平台开通。', raw)
  }

  return new AsrError('ASR_REQUEST_FAILED', message || 'vivo ASR 识别失败。', raw)
}

function buildAsrUrl(requestId: string): string {
  const domain = process.env.VIVO_ASR_DOMAIN?.trim() || 'api-ai.vivo.com.cn'
  const params = new URLSearchParams({
    client_version: process.env.VIVO_ASR_CLIENT_VERSION?.trim() || 'unknown',
    package: process.env.VIVO_ASR_PACKAGE?.trim() || 'unknown',
    sdk_version: process.env.VIVO_ASR_SDK_VERSION?.trim() || 'unknown',
    user_id: getStableUserId(),
    android_version: process.env.VIVO_ASR_ANDROID_VERSION?.trim() || 'unknown',
    system_time: Date.now().toString(),
    net_type: process.env.VIVO_ASR_NET_TYPE?.trim() || '1',
    engineid: process.env.VIVO_ASR_ENGINE_ID?.trim() || 'shortasrinput',
    requestId,
  })

  return `ws://${domain}/asr/v2?${params.toString()}`
}

function sendPcmInChunks(socket: WebSocket, audio: Buffer): void {
  const frameBytes = Number(process.env.VIVO_ASR_FRAME_BYTES ?? 1280)
  for (let offset = 0; offset < audio.length; offset += frameBytes) {
    socket.send(audio.subarray(offset, Math.min(offset + frameBytes, audio.length)))
  }
  socket.send(Buffer.from(' --end-- '))
}

export async function transcribeShortAudio(audio: Buffer): Promise<AsrTranscriptResult> {
  const appKey = getAsrAppKey()
  if (!appKey) {
    throw new AsrError(
      'ASR_MISSING_CONFIG',
      'ASR 未配置：缺少 VIVO_ASR_APP_KEY 或 VIVO_AIGC_APP_KEY。',
    )
  }

  if (audio.length === 0) {
    throw new AsrError('ASR_REQUEST_FAILED', '没有收到有效音频。')
  }

  const requestId = crypto.randomUUID().replace(/-/g, '')
  const payload = {
    type: 'started',
    request_id: requestId,
    asr_info: {
      end_vad_time: Number(process.env.VIVO_ASR_END_VAD_TIME ?? 1200),
      audio_type: 'pcm',
      chinese2digital: 1,
      punctuation: 1,
    },
    business_info: 'xiaobai-kitchen-demo',
  }

  return new Promise((resolve, reject) => {
    const rawMessages: unknown[] = []
    let latestText = ''
    let settled = false
    let audioSent = false
    const timeout = windowlessTimeout(() => {
      finish(new AsrError('ASR_TIMEOUT', 'ASR 识别超时，请再说一遍。'))
    }, Number(process.env.VIVO_ASR_TIMEOUT_MS ?? 15000))

    const finish = (error?: Error) => {
      if (settled) {
        return
      }
      settled = true
      clearTimeout(timeout)
      socket.close()

      if (error) {
        reject(error)
        return
      }

      const text = latestText.trim()
      if (!text) {
        reject(new AsrError('ASR_NO_TEXT', '没有识别到语音内容，请再说一遍。', rawMessages))
        return
      }

      resolve({ text, raw: rawMessages })
    }

    const socket = new WebSocket(buildAsrUrl(requestId), {
      headers: {
        Authorization: `Bearer ${appKey}`,
      },
    })

    socket.on('open', () => {
      socket.send(JSON.stringify(payload))
    })

    socket.on('message', (data) => {
      const text = data.toString()
      let message: Record<string, unknown>
      try {
        message = JSON.parse(text) as Record<string, unknown>
      } catch {
        rawMessages.push(text)
        return
      }

      rawMessages.push(message)
      const action = typeof message.action === 'string' ? message.action : ''
      const code = typeof message.code === 'number' ? message.code : 0
      const desc = typeof message.desc === 'string' ? message.desc : ''

      if (action === 'error' || code !== 0) {
        finish(classifyAsrError(desc, message))
        return
      }

      if (action === 'started' && !audioSent) {
        audioSent = true
        sendPcmInChunks(socket, audio)
        return
      }

      if (action === 'result') {
        const result = message.data && typeof message.data === 'object'
          ? message.data as Record<string, unknown>
          : {}
        if (typeof result.text === 'string' && result.text.trim()) {
          latestText = result.text
        }
        if (message.is_finish === true || result.is_last === true) {
          finish()
        }
      }
    })

    socket.on('error', (error) => {
      finish(classifyAsrError(error.message, error))
    })

    socket.on('close', () => {
      if (!settled && latestText.trim()) {
        finish()
      }
    })
  })
}

function windowlessTimeout(callback: () => void, ms: number): NodeJS.Timeout {
  return setTimeout(callback, ms)
}
