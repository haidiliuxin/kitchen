import type {
  CookingHistoryEntry,
  ImportAnalyzeResponse,
  ImportSourceType,
  Recipe,
  RecipeFilters,
  VoiceInterpretation,
} from '../types.js'

export const API_BASE_URL_STORAGE_KEY = 'kitchen-helper:api-base-url'

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
      ...(init?.headers ?? {}),
    },
    ...init,
  })

  if (!response.ok) {
    let message = '请求失败，请稍后再试。'

    try {
      const payload = (await response.json()) as { message?: string }
      if (payload.message) {
        message = payload.message
      }
    } catch {
      // Ignore JSON parse failures and keep the fallback message.
    }

    throw new Error(message)
  }

  return (await response.json()) as T
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
