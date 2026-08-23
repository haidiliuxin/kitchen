import crypto from 'node:crypto'
import type { ExtractedFrame } from './videoProcessing.js'

export type OcrResult = {
  text: string
  confidence: number
  raw: unknown
  error?: string
}

export type OcrSegment = {
  frameId: string
  timeSeconds: number
  timeLabel: string
  imageUrl: string
  text: string
  confidence: number
  raw: unknown
  error?: string
}

export type CleanedOcrEvidenceSegment = {
  startTime: string
  endTime: string
  startSeconds: number
  endSeconds: number
  text: string
  imageUrl: string
}

const uiNoisePatterns = [
  /关注|点赞|收藏|转发|评论|分享/g,
  /广告|直播|同款|购买|下单/g,
  /@\S+/g,
  /#\S+/g,
]

const vivoOcrUri = '/ocr/general_recognition'
const vivoOcrBusinessId = '1990173156ceb8a09eee80c293135279'

function getVivoAigcAppId(): string {
  return process.env.OCR_VIVO_APP_ID?.trim() || ''
}

function getVivoAigcAppKey(): string {
  return process.env.OCR_VIVO_APP_KEY?.trim() || ''
}

function createNonce(length = 8): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

function canonicalQueryString(params: Record<string, string | number | boolean> = {}): string {
  return Object.keys(params)
    .sort()
    .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(String(params[key]))}`)
    .join('&')
}

function createVivoSignedHeaders(
  appId: string,
  appKey: string,
  method: string,
  uri: string,
  query: Record<string, string | number | boolean> = {},
): Record<string, string> {
  const timestamp = Math.floor(Date.now() / 1000).toString()
  const nonce = createNonce()
  const signedHeadersString = [
    `x-ai-gateway-app-id:${appId}`,
    `x-ai-gateway-timestamp:${timestamp}`,
    `x-ai-gateway-nonce:${nonce}`,
  ].join('\n')
  const signingString = [
    method.toUpperCase(),
    uri.startsWith('/') ? uri : `/${uri}`,
    canonicalQueryString(query),
    appId,
    timestamp,
    signedHeadersString,
  ].join('\n')
  const signature = crypto
    .createHmac('sha256', appKey)
    .update(Buffer.from(signingString, 'utf8'))
    .digest('hex')
  const encodedSignature = Buffer.from(signature, 'utf8').toString('base64')

  return {
    'X-AI-GATEWAY-APP-ID': appId,
    'X-AI-GATEWAY-TIMESTAMP': timestamp,
    'X-AI-GATEWAY-NONCE': nonce,
    'X-AI-GATEWAY-SIGNED-HEADERS': 'x-ai-gateway-app-id;x-ai-gateway-timestamp;x-ai-gateway-nonce',
    'X-AI-GATEWAY-SIGNATURE': encodedSignature,
  }
}

function flattenText(value: unknown): string[] {
  if (typeof value === 'string') {
    return [value]
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => flattenText(item))
  }

  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    const preferredKeys = ['text', 'words', 'content', 'value', 'label', 'recognizedText']
    const preferred = preferredKeys.flatMap((key) => flattenText(record[key]))
    if (preferred.length > 0) {
      return preferred
    }

    return Object.values(record).flatMap((item) => flattenText(item))
  }

  return []
}

function parseOcrPayload(payload: unknown): OcrResult {
  const texts = flattenText(payload)
    .map((item) => item.trim())
    .filter(Boolean)
  const confidenceCandidates = flattenText(payload)
    .map((item) => Number.parseFloat(item))
    .filter((item) => Number.isFinite(item) && item >= 0 && item <= 1)

  return {
    text: Array.from(new Set(texts)).join('\n'),
    confidence: confidenceCandidates[0] ?? 0,
    raw: payload,
  }
}

function parseVivoOcrPayload(payload: unknown): OcrResult {
  const record = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {}
  const errorCode = Number(record.error_code ?? 0)
  if (Number.isFinite(errorCode) && errorCode !== 0) {
    return {
      text: '',
      confidence: 0,
      raw: payload,
      error: typeof record.error_msg === 'string' ? record.error_msg : `vivo OCR error ${errorCode}`,
    }
  }

  const result = record.result && typeof record.result === 'object'
    ? record.result as Record<string, unknown>
    : {}
  const words = Array.isArray(result.words)
    ? result.words
        .map((item) => {
          if (typeof item === 'string') {
            return item
          }
          if (item && typeof item === 'object') {
            return (item as Record<string, unknown>).words
          }
          return ''
        })
        .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : []
  const ocrWords = Array.isArray(result.OCR)
    ? result.OCR
        .map((item) => item && typeof item === 'object' ? (item as Record<string, unknown>).words : '')
        .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : []

  return {
    text: Array.from(new Set([...words, ...ocrWords])).join('\n'),
    confidence: 0,
    raw: payload,
  }
}

async function recognizeWithVivoGeneralOcr(frameUrl: string): Promise<OcrResult> {
  const appId = getVivoAigcAppId()
  const appKey = getVivoAigcAppKey()

  if (!appId || !appKey) {
    return {
      text: '',
      confidence: 0,
      raw: null,
      error: 'OCR_VIVO_APP_ID/OCR_VIVO_APP_KEY is not configured.',
    }
  }

  try {
    const imageResponse = await fetch(frameUrl)
    if (!imageResponse.ok) {
      return {
        text: '',
        confidence: 0,
        raw: null,
        error: `Cannot fetch frame image ${imageResponse.status}`,
      }
    }

    const image = Buffer.from(await imageResponse.arrayBuffer()).toString('base64')
    const body = new URLSearchParams({
      image,
      pos: process.env.OCR_VIVO_POS?.trim() || '2',
      businessid: process.env.OCR_VIVO_BUSINESS_ID?.trim() || vivoOcrBusinessId,
    })
    const endpoint = process.env.OCR_VIVO_BASE_URL?.trim() || 'http://api-ai.vivo.com.cn'
    const response = await fetch(`${endpoint.replace(/\/$/, '')}${vivoOcrUri}`, {
      method: 'POST',
      headers: {
        ...createVivoSignedHeaders(appId, appKey, 'POST', vivoOcrUri),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    })
    const raw = await response.json().catch(async () => ({ text: await response.text() }))

    if (!response.ok) {
      return {
        text: '',
        confidence: 0,
        raw,
        error: `vivo OCR HTTP ${response.status}`,
      }
    }

    return parseVivoOcrPayload(raw)
  } catch (error) {
    return {
      text: '',
      confidence: 0,
      raw: null,
      error: error instanceof Error ? error.message : 'vivo OCR failed',
    }
  }
}

async function recognizeWithVivoAigcBearerOcr(frameUrl: string): Promise<OcrResult> {
  const appId = getVivoAigcAppId()
  const appKey = getVivoAigcAppKey()

  if (!appId || !appKey) {
    return {
      text: '',
      confidence: 0,
      raw: null,
      error: 'OCR_VIVO_APP_ID/OCR_VIVO_APP_KEY is not configured.',
    }
  }

  try {
    const imageResponse = await fetch(frameUrl)
    if (!imageResponse.ok) {
      return {
        text: '',
        confidence: 0,
        raw: null,
        error: `Cannot fetch frame image ${imageResponse.status}`,
      }
    }

    const image = Buffer.from(await imageResponse.arrayBuffer()).toString('base64')
    const body = new URLSearchParams({
      image,
      pos: process.env.OCR_VIVO_POS?.trim() || '2',
      businessid: process.env.OCR_VIVO_BUSINESS_ID?.trim() || `aigc${appId}`,
    })
    const endpoint = process.env.OCR_VIVO_BASE_URL?.trim() || 'http://api-ai.vivo.com.cn'
    const url = new URL(`${endpoint.replace(/\/$/, '')}${vivoOcrUri}`)
    url.searchParams.set('requestId', crypto.randomUUID())

    const response = await fetch(url.href, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${appKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    })
    const raw = await response.json().catch(async () => ({ text: await response.text() }))

    if (!response.ok) {
      return {
        text: '',
        confidence: 0,
        raw,
        error: `vivo AIGC OCR HTTP ${response.status}`,
      }
    }

    return parseVivoOcrPayload(raw)
  } catch (error) {
    return {
      text: '',
      confidence: 0,
      raw: null,
      error: error instanceof Error ? error.message : 'vivo AIGC OCR failed',
    }
  }
}

export async function recognizeFrameText(frameUrl: string): Promise<OcrResult> {
  const provider = process.env.OCR_PROVIDER?.trim().toLowerCase() || 'vivo-aigc'
  if (provider === 'vivo-aigc' || provider === 'vivo-bearer') {
    return recognizeWithVivoAigcBearerOcr(frameUrl)
  }

  if (provider === 'vivo-general' || provider === 'vivo-hmac') {
    return recognizeWithVivoGeneralOcr(frameUrl)
  }

  const endpoint = process.env.OCR_PLUGIN_URL?.trim() || ''

  if (!endpoint) {
    return {
      text: '',
      confidence: 0,
      raw: null,
      error: 'OCR_PLUGIN_URL is not configured; TODO: wire official OCR plugin endpoint here.',
    }
  }

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(process.env.OCR_PLUGIN_API_KEY
          ? { Authorization: `Bearer ${process.env.OCR_PLUGIN_API_KEY}` }
          : {}),
      },
      body: JSON.stringify({ url: frameUrl }),
    })

    const raw = await response.json().catch(async () => ({ text: await response.text() }))
    if (!response.ok) {
      return {
        text: '',
        confidence: 0,
        raw,
        error: `OCR plugin HTTP ${response.status}`,
      }
    }

    return parseOcrPayload(raw)
  } catch (error) {
    return {
      text: '',
      confidence: 0,
      raw: null,
      error: error instanceof Error ? error.message : 'OCR plugin failed',
    }
  }
}

export async function recognizeVideoFrames(frames: ExtractedFrame[]): Promise<OcrSegment[]> {
  const segments: OcrSegment[] = []

  for (const frame of frames) {
    const result = await recognizeFrameText(frame.imageUrl)
    segments.push({
      frameId: frame.frameId,
      timeSeconds: frame.timeSeconds,
      timeLabel: frame.timeLabel,
      imageUrl: frame.imageUrl,
      text: result.text,
      confidence: result.confidence,
      raw: result.raw,
      error: result.error,
    })
  }

  return segments
}

function cleanText(text: string): string {
  let cleaned = text
    .replace(/\s+/g, ' ')
    .replace(/[|｜]/g, ' ')
    .trim()

  for (const pattern of uiNoisePatterns) {
    cleaned = cleaned.replace(pattern, ' ')
  }

  return cleaned.replace(/\s+/g, ' ').trim()
}

function isMeaningfulText(text: string): boolean {
  const normalized = text.replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, '')
  return normalized.length >= 2
}

function isSimilarText(a: string, b: string): boolean {
  const left = a.replace(/\s+/g, '')
  const right = b.replace(/\s+/g, '')
  return left === right || left.includes(right) || right.includes(left)
}

export function cleanOcrSegments(segments: OcrSegment[]): CleanedOcrEvidenceSegment[] {
  const cleaned: CleanedOcrEvidenceSegment[] = []

  for (const segment of segments) {
    const text = cleanText(segment.text)
    if (!text || !isMeaningfulText(text)) {
      continue
    }

    const previous = cleaned[cleaned.length - 1]
    if (previous && isSimilarText(previous.text, text)) {
      previous.endSeconds = Math.max(previous.endSeconds, segment.timeSeconds)
      previous.endTime = segment.timeLabel
      continue
    }

    cleaned.push({
      startTime: segment.timeLabel,
      endTime: segment.timeLabel,
      startSeconds: segment.timeSeconds,
      endSeconds: segment.timeSeconds,
      text,
      imageUrl: segment.imageUrl,
    })
  }

  return cleaned
}

export function buildOcrEvidenceText(segments: CleanedOcrEvidenceSegment[]): string {
  return segments
    .map((segment) => `[${segment.startTime}-${segment.endTime}] ${segment.text}`)
    .join('\n')
}

export function hasEnoughOcrEvidence(segments: CleanedOcrEvidenceSegment[]): boolean {
  if (segments.length < 3) {
    return false
  }

  const joined = segments.map((segment) => segment.text).join(' ')
  const cookingKeywords = [
    '加入',
    '放入',
    '倒入',
    '切',
    '炒',
    '煮',
    '蒸',
    '煎',
    '炸',
    '焯',
    '盐',
    '糖',
    '油',
    '酱',
    '粉',
    '葱',
    '姜',
    '蒜',
    '鸡蛋',
    '番茄',
    '淀粉',
    '湿淀粉',
  ]

  return cookingKeywords.some((keyword) => joined.includes(keyword))
}
