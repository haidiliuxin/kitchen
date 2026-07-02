import type {
  CookingHistoryEntry,
  AuthSession,
  ImportAnalyzeResponse,
  ImportSourceType,
  MissingIngredient,
  PrepPlan,
  Recipe,
  RecipeDraftPayload,
  RecipeFilters,
  VoiceInterpretation,
} from '../types.js'

export const API_BASE_URL_STORAGE_KEY = 'kitchen-helper:api-base-url'
const AUTH_STORAGE_KEY = 'kitchen-helper:auth'

export type DemoStructuredRecipe = {
  recipeName: string
  estimatedTime: string
  servings: number
  ingredients: Array<{
    name: string
    amount: string
    note: string
  }>
  prepItems: Array<{
    name: string
    action: string
  }>
  steps: Array<{
    stepId: string
    title: string
    instruction: string
    startTime: number
    endTime: number
    duration: string
    tips: string[]
    commonMistakes: string[]
    rescue: string
    keyFrameUrl?: string
  }>
}

export type DemoUploadedVideoInfo = {
  originalName: string
  size: number
  mimeType: string
  durationSeconds: number
  durationLabel: string
}

export type DemoVideoFrame = {
  frameId: string
  timeSeconds: number
  timeLabel: string
  imagePath: string
  imageUrl: string
}

export type DemoOcrSegment = {
  frameId: string
  timeSeconds: number
  timeLabel: string
  imageUrl: string
  text: string
  confidence: number
  raw: unknown
  error?: string
}

export type DemoCleanedOcrSegment = {
  startTime: string
  endTime: string
  startSeconds: number
  endSeconds: number
  text: string
  imageUrl: string
}

export type DemoAnalyzeSuccessResponse = {
  success?: true
  status: 'success' | 'fallback'
  message: string
  uploadedVideo?: DemoUploadedVideoInfo
  recipe: DemoStructuredRecipe
  evidence: {
    usedLLM: boolean
    llm_status?: 'not_called' | 'failed' | 'success'
    transcriptSegments?: number
    source: 'demo transcript' | 'local video ocr'
    frameCount?: number
    ocrTextCount?: number
    frames?: DemoVideoFrame[]
    ocrSegments?: DemoOcrSegment[]
    cleanedOcrSegments?: DemoCleanedOcrSegment[]
    ocrEvidenceText?: string
    fallbackReason?: string
    warnings?: string[]
    provider?: string
    model?: string
  }
}

export type DemoAnalyzeFailureResponse = {
  success: false
  status: 'failed'
  error_type: 'VIDEO_METADATA_FAILED' | 'FRAME_EXTRACTION_FAILED' | 'OCR_FAILED' | 'LLM_FAILED'
  message: string
  nextStep: string
  uploadedVideo?: DemoUploadedVideoInfo
  video_duration_seconds?: number
  frames: DemoVideoFrame[]
  ocr_texts: DemoCleanedOcrSegment[]
  evidence: {
    usedLLM: false
    llm_status: 'not_called' | 'failed'
    source: 'local video ocr'
    frameCount: number
    ocrTextCount: number
    frames: DemoVideoFrame[]
    ocrSegments: DemoOcrSegment[]
    cleanedOcrSegments: DemoCleanedOcrSegment[]
    ocrEvidenceText: string
    warnings: string[]
    failureStage: 'VIDEO_METADATA_FAILED' | 'FRAME_EXTRACTION_FAILED' | 'OCR_FAILED' | 'LLM_FAILED'
  }
}

export type DemoAnalyzeVideoResponse = DemoAnalyzeSuccessResponse | DemoAnalyzeFailureResponse

export type DemoCoachReplyResponse = {
  status: 'success' | 'fallback'
  answer: string
  provider?: string
  model?: string
}

export type DemoAsrResponse = {
  success: true
  text: string
  raw: unknown
} | {
  success: false
  error_type: string
  message: string
  raw?: unknown
}

const bundledApiBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? '').trim()

function normalizeApiBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/, '')
}

export function getConfiguredApiBaseUrl(): string {
  if (typeof window === 'undefined') {
    return normalizeApiBaseUrl(bundledApiBaseUrl)
  }

  const storedUrl = window.localStorage.getItem(API_BASE_URL_STORAGE_KEY)
  return normalizeApiBaseUrl(storedUrl || bundledApiBaseUrl)
}

export function setConfiguredApiBaseUrl(value: string): string {
  const normalized = normalizeApiBaseUrl(value)

  if (typeof window !== 'undefined') {
    if (normalized) {
      window.localStorage.setItem(API_BASE_URL_STORAGE_KEY, normalized)
    } else {
      window.localStorage.removeItem(API_BASE_URL_STORAGE_KEY)
    }
  }

  return normalized
}

export function resetConfiguredApiBaseUrl(): string {
  return setConfiguredApiBaseUrl('')
}

function buildApiUrl(path: string): string {
  const apiBaseUrl = getConfiguredApiBaseUrl()

  if (!apiBaseUrl) {
    return path
  }

  return `${apiBaseUrl.replace(/\/$/, '')}${path}`
}

function describeNonJsonApiResponse(rawText: string): string {
  const preview = rawText.trim().slice(0, 80).toLowerCase()

  if (preview.startsWith('<!doctype') || preview.startsWith('<html') || preview.startsWith('<')) {
    return '没有连到后端 API，而是拿到了前端页面。安卓端请确认电脑后端正在 0.0.0.0:8787 运行，并重新执行 npm run android:sync。'
  }

  return '后端返回了非 JSON 内容，请检查 API 地址和后端日志。'
}

async function readJsonResponse<T>(response: Response): Promise<T> {
  const rawText = await response.text()

  try {
    return JSON.parse(rawText) as T
  } catch {
    throw new Error(describeNonJsonApiResponse(rawText))
  }
}

export function buildMediaProxyUrl(url: string, referer?: string): string {
  const trimmedUrl = url.trim()
  if (!trimmedUrl || !/^https?:\/\//i.test(trimmedUrl)) {
    return trimmedUrl
  }

  const params = new URLSearchParams({ url: trimmedUrl })
  if (referer?.trim()) {
    params.set('referer', referer.trim())
  }

  return buildApiUrl(`/api/media/proxy?${params.toString()}`)
}

function getAuthSession(): AuthSession | null {
  if (typeof window === 'undefined') {
    return null
  }

  try {
    const raw = window.localStorage.getItem(AUTH_STORAGE_KEY)
    if (!raw) {
      return null
    }

    const parsed = JSON.parse(raw) as AuthSession
    if (parsed?.token && parsed?.user?.id) {
      return parsed
    }

    return null
  } catch {
    return null
  }
}

export async function testApiServer(baseUrl = getConfiguredApiBaseUrl()): Promise<{
  status: string
}> {
  const normalized = normalizeApiBaseUrl(baseUrl)
  const response = await fetch(`${normalized}/api/health`)

  if (!response.ok) {
    throw new Error(`服务器返回 ${response.status}`)
  }

  return (await response.json()) as { status: string }
}

async function requestJson<T>(input: string, init?: RequestInit): Promise<T> {
  const response = await fetch(buildApiUrl(input), {
    headers: {
      'Content-Type': 'application/json',
      ...(getAuthSession()?.token ? { Authorization: `Bearer ${getAuthSession()!.token}` } : {}),
      ...(init?.headers ?? {}),
    },
    ...init,
  })

  const payload = await readJsonResponse<T & { message?: string }>(response)

  if (!response.ok) {
    let message = '请求失败，请稍后再试。'
    if (payload.message) {
      message = payload.message
    }

    throw new Error(message)
  }

  return payload
}

export async function loginOrRegister(identifier: string, password: string): Promise<AuthSession> {
  const session = await requestJson<AuthSession>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ identifier, password }),
  })

  if (typeof window !== 'undefined') {
    window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session))
  }

  return session
}

export async function logoutSession(): Promise<void> {
  await requestJson<{ status: string }>('/api/auth/logout', { method: 'POST' }).catch(() => undefined)
  if (typeof window !== 'undefined') {
    window.localStorage.removeItem(AUTH_STORAGE_KEY)
  }
}

export async function fetchRecipes(filters: RecipeFilters = {}): Promise<Recipe[]> {
  const params = new URLSearchParams()

  if (filters.query?.trim()) {
    params.set('query', filters.query.trim())
  }
  if (filters.difficulty && filters.difficulty !== '全部') {
    params.set('difficulty', filters.difficulty)
  }
  if (filters.timeLimit && filters.timeLimit !== '全部') {
    params.set('timeLimit', String(filters.timeLimit))
  }

  const suffix = params.toString() ? `?${params.toString()}` : ''
  return requestJson<Recipe[]>(`/api/recipes${suffix}`)
}

export async function fetchHistory(): Promise<CookingHistoryEntry[]> {
  return requestJson<CookingHistoryEntry[]>('/api/history')
}

export async function recordCompletion(recipeId: string): Promise<CookingHistoryEntry> {
  return requestJson<CookingHistoryEntry>('/api/history', {
    method: 'POST',
    body: JSON.stringify({ recipeId }),
  })
}

export async function fetchRecommendations(excludeRecipeId?: string): Promise<Recipe[]> {
  const params = new URLSearchParams()

  if (excludeRecipeId) {
    params.set('excludeRecipeId', excludeRecipeId)
  }

  const suffix = params.toString() ? `?${params.toString()}` : ''
  return requestJson<Recipe[]>(`/api/recommendations${suffix}`)
}

export async function fetchPrepPlan(
  recipeId: string,
  servings: number,
  missingIngredients: MissingIngredient[] = [],
): Promise<PrepPlan> {
  return requestJson<PrepPlan>(`/api/recipes/${encodeURIComponent(recipeId)}/prep-plan`, {
    method: 'POST',
    body: JSON.stringify({ servings, missingIngredients }),
  })
}

export async function createRecipeDraft(payload: RecipeDraftPayload): Promise<Recipe> {
  return requestJson<Recipe>('/api/recipes', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function updateRecipeVisibility(
  recipeId: string,
  visibility: 'public' | 'private',
): Promise<Recipe> {
  return requestJson<Recipe>(`/api/recipes/${encodeURIComponent(recipeId)}/visibility`, {
    method: 'POST',
    body: JSON.stringify({ visibility }),
  })
}

export async function askAssistant(
  recipeId: string,
  stepIndex: number,
  question: string,
): Promise<string> {
  const payload = await requestJson<{ answer: string }>('/api/assistant/reply', {
    method: 'POST',
    body: JSON.stringify({ recipeId, stepIndex, question }),
  })

  return payload.answer
}

export async function interpretVoiceTranscript(
  transcript: string,
): Promise<VoiceInterpretation> {
  return requestJson<VoiceInterpretation>('/api/voice/interpret', {
    method: 'POST',
    body: JSON.stringify({ transcript }),
  })
}

export async function importRecipeFromLink(url: string): Promise<{
  recipe: Recipe
  source: {
    url: string
    title: string
    sourceType: 'article' | 'video' | 'unknown'
  }
}> {
  return requestJson<{
    recipe: Recipe
    source: {
      url: string
      title: string
      sourceType: 'article' | 'video' | 'unknown'
    }
  }>('/api/imports/from-link', {
    method: 'POST',
    body: JSON.stringify({ url }),
  })
}

export async function analyzeImportLink(
  sourceType: ImportSourceType,
  url: string,
): Promise<ImportAnalyzeResponse> {
  return requestJson<ImportAnalyzeResponse>('/api/imports/analyze', {
    method: 'POST',
    body: JSON.stringify({ sourceType, url }),
  })
}

export async function analyzeDemoVideo(url = '', sourceType = 'video'): Promise<DemoAnalyzeVideoResponse> {
  return requestJson<DemoAnalyzeVideoResponse>('/api/demo/analyze-video', {
    method: 'POST',
    body: JSON.stringify({ sourceType, url }),
  })
}

export async function analyzeLocalVideo(file: File, durationSeconds?: number): Promise<DemoAnalyzeVideoResponse> {
  const formData = new FormData()
  formData.set('video', file)
  if (durationSeconds && Number.isFinite(durationSeconds)) {
    formData.set('durationSeconds', String(durationSeconds))
  }

  const response = await fetch(buildApiUrl('/api/demo/analyze-local-video'), {
    method: 'POST',
    headers: {
      ...(getAuthSession()?.token ? { Authorization: `Bearer ${getAuthSession()!.token}` } : {}),
    },
    body: formData,
  })

  const payload = await readJsonResponse<DemoAnalyzeVideoResponse & { message?: string }>(response)

  if (!response.ok) {
    let message = '本地视频解析失败，请稍后再试。'
    if (payload.message) {
      message = payload.message
    }
    throw new Error(message)
  }

  return payload
}

export async function transcribeDemoAudio(audio: Blob, mockText?: string): Promise<DemoAsrResponse> {
  const formData = new FormData()
  formData.set('audio', audio, 'voice.pcm')
  if (mockText?.trim()) {
    formData.set('mockText', mockText.trim())
  }

  const response = await fetch(buildApiUrl('/api/demo/asr'), {
    method: 'POST',
    headers: {
      ...(getAuthSession()?.token ? { Authorization: `Bearer ${getAuthSession()!.token}` } : {}),
    },
    body: formData,
  })

  const payload = await readJsonResponse<DemoAsrResponse>(response).catch((error: unknown) => ({
    success: false,
    error_type: 'ASR_REQUEST_FAILED',
    message: error instanceof Error ? error.message : 'ASR 识别失败。',
  }) satisfies DemoAsrResponse)

  if (!response.ok) {
    return payload.success === false
      ? payload
      : { success: false, error_type: 'ASR_REQUEST_FAILED', message: 'ASR 识别失败。' }
  }

  return payload
}

export async function askDemoCoach(payload: {
  recipeName: string
  currentStep: {
    title: string
    instruction: string
    tips: string[]
    commonMistakes: string[]
  }
  userQuestion: string
}): Promise<DemoCoachReplyResponse> {
  return requestJson<DemoCoachReplyResponse>('/api/demo/coach-reply', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}
