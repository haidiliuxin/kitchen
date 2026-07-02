import crypto from 'node:crypto'

type ChatMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string
}

type ChatResponse = {
  choices?: Array<{
    message?: {
      content?: string
    }
  }>
}

type AnthropicResponse = {
  content?: Array<{
    type?: string
    text?: string
  }>
}

export type LlmProvider = 'deepseek' | 'lanxin' | 'minimax'

export type LlmRuntimeInfo = {
  configured: boolean
  provider: LlmProvider
  model: string
  baseUrl: string
}

export type ChatCompletionOptions = {
  messages: ChatMessage[]
  temperature?: number
  maxTokens?: number
  jsonMode?: boolean
  timeoutMs?: number
}

function stripTrailingSlash(value: string): string {
  return value.replace(/\/$/, '')
}

function getProvider(): LlmProvider {
  const provider = process.env.AI_PROVIDER?.trim().toLowerCase()
  if (provider === 'minimax') {
    return 'minimax'
  }

  return provider === 'lanxin' ? 'lanxin' : 'deepseek'
}

function getLanxinApiKey(): string {
  return (
    process.env.LANXIN_API_KEY?.trim() ||
    process.env.LANXIN_APP_KEY?.trim() ||
    ''
  )
}

function getLanxinAppId(): string {
  return process.env.LANXIN_APP_ID?.trim() || ''
}

function getLanxinAuthMode(): 'bearer' | 'gateway' {
  return process.env.LANXIN_AUTH_MODE === 'bearer' ? 'bearer' : 'gateway'
}

function appendRequestId(endpoint: URL): URL {
  if (!endpoint.searchParams.has('request_id')) {
    endpoint.searchParams.set('request_id', crypto.randomUUID())
  }

  return endpoint
}

function createNonce(length = 8): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

function createGatewaySignedHeaders(
  appId: string,
  appKey: string,
  method: string,
  uri: string,
  query: Record<string, string | number | boolean> = {},
): Record<string, string> {
  const timestamp = Math.floor(Date.now() / 1000).toString()
  const nonce = createNonce()
  const canonicalQueryString = Object.keys(query)
    .sort()
    .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(String(query[key]))}`)
    .join('&')
  const signedHeadersString = [
    `x-ai-gateway-app-id:${appId}`,
    `x-ai-gateway-timestamp:${timestamp}`,
    `x-ai-gateway-nonce:${nonce}`,
  ].join('\n')
  const signingString = [
    method.toUpperCase(),
    uri.startsWith('/') ? uri : `/${uri}`,
    canonicalQueryString,
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

function getProviderConfig(): {
  provider: LlmProvider
  apiKey: string
  baseUrl: string
  model: string
  timeoutMs: number
  supportsJsonMode: boolean
  lanxinAppId?: string
  lanxinAuthMode?: 'bearer' | 'gateway'
  protocol: 'openai' | 'anthropic'
} {
  const provider = getProvider()

  if (provider === 'minimax') {
    return {
      provider,
      apiKey: process.env.MINIMAX_API_KEY?.trim() || '',
      baseUrl: stripTrailingSlash(
        process.env.MINIMAX_BASE_URL?.trim() || 'https://api.minimaxi.com/anthropic',
      ),
      model: process.env.MINIMAX_MODEL?.trim() || 'MiniMax-M2.7',
      timeoutMs: Number(process.env.MINIMAX_TIMEOUT_MS ?? process.env.DEEPSEEK_TIMEOUT_MS ?? 180000),
      // Anthropic-compatible endpoints do not accept OpenAI response_format.
      supportsJsonMode: false,
      protocol: 'anthropic',
    }
  }

  if (provider === 'lanxin') {
    return {
      provider,
      apiKey: getLanxinApiKey(),
      // 蓝心控制台中的代理密钥更像 OpenAI-compatible bearer key。
      // 因此这里不硬编码官方 URL，优先要求由环境变量提供真实网关。
      baseUrl: stripTrailingSlash(process.env.LANXIN_BASE_URL?.trim() || ''),
      model: process.env.LANXIN_MODEL?.trim() || 'xuanji',
      timeoutMs: Number(process.env.LANXIN_TIMEOUT_MS ?? process.env.DEEPSEEK_TIMEOUT_MS ?? 180000),
      supportsJsonMode: process.env.LANXIN_JSON_MODE !== 'false',
      lanxinAppId: getLanxinAppId(),
      lanxinAuthMode: getLanxinAuthMode(),
      protocol: 'openai',
    }
  }

  return {
    provider,
    apiKey: process.env.DEEPSEEK_API_KEY?.trim() || '',
    baseUrl: stripTrailingSlash(process.env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com'),
    model: process.env.DEEPSEEK_MODEL ?? 'deepseek-chat',
    timeoutMs: Number(process.env.DEEPSEEK_TIMEOUT_MS ?? 180000),
    supportsJsonMode: true,
    protocol: 'openai',
  }
}

export function isLlmConfigured(): boolean {
  const config = getProviderConfig()
  if (config.provider === 'lanxin' && config.lanxinAuthMode === 'gateway') {
    return Boolean(config.apiKey && config.lanxinAppId && config.baseUrl && config.model)
  }

  return Boolean(config.apiKey && config.baseUrl && config.model)
}

export function getLlmRuntimeInfo(): LlmRuntimeInfo {
  const config = getProviderConfig()
  return {
    configured: isLlmConfigured(),
    provider: config.provider,
    model: config.model,
    baseUrl: config.baseUrl,
  }
}

function getAnthropicEndpoint(baseUrl: string): URL {
  const uri = baseUrl.endsWith('/v1') ? '/messages' : '/v1/messages'
  return new URL(`${baseUrl}${uri}`)
}

function buildAnthropicPayload(options: ChatCompletionOptions, model: string): Record<string, unknown> {
  const system = options.messages
    .filter((message) => message.role === 'system')
    .map((message) => message.content)
    .join('\n\n')
    .trim()
  const messages = options.messages
    .filter((message) => message.role !== 'system')
    .map((message) => ({
      role: message.role === 'assistant' ? 'assistant' : 'user',
      content: message.content,
    }))

  return {
    model,
    max_tokens: options.maxTokens ?? 800,
    temperature: options.temperature ?? 0.3,
    ...(system ? { system } : {}),
    messages: messages.length
      ? messages
      : [
          {
            role: 'user',
            content: system || '请继续。',
          },
        ],
  }
}

function parseAnthropicContent(payload: AnthropicResponse): string {
  return (
    payload.content
      ?.map((item) => item.text?.trim() ?? '')
      .filter(Boolean)
      .join('\n')
      .trim() ?? ''
  )
}

export async function callChatCompletion(options: ChatCompletionOptions): Promise<string> {
  const config = getProviderConfig()

  if (!config.apiKey) {
    throw new Error(`当前未配置 ${config.provider} API Key。`)
  }

  if (!config.baseUrl) {
    throw new Error(`当前未配置 ${config.provider} BASE_URL。`)
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? config.timeoutMs)

  try {
    if (config.protocol === 'anthropic') {
      const endpoint = getAnthropicEndpoint(config.baseUrl)
      const response = await fetch(endpoint.href, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': config.apiKey,
          'anthropic-version': process.env.MINIMAX_ANTHROPIC_VERSION ?? '2023-06-01',
        },
        body: JSON.stringify(buildAnthropicPayload(options, config.model)),
        signal: controller.signal,
      })

      if (!response.ok) {
        const raw = await response.text()
        throw new Error(`${config.provider} API ${response.status}: ${raw.slice(0, 400)}`)
      }

      const payload = (await response.json()) as AnthropicResponse
      const content = parseAnthropicContent(payload)

      if (!content) {
        throw new Error(`${config.provider} 返回了空内容。`)
      }

      return content
    }

    const body: Record<string, unknown> = {
      model: config.model,
      temperature: options.temperature ?? 0.3,
      max_tokens: options.maxTokens ?? 800,
      messages: options.messages,
    }

    if (options.jsonMode && config.supportsJsonMode) {
      body.response_format = { type: 'json_object' }
    }

    const uri = '/chat/completions'
    const endpoint = new URL(`${config.baseUrl}${uri}`)
    if (config.provider === 'lanxin' && config.lanxinAuthMode === 'bearer') {
      appendRequestId(endpoint)
    }
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }

    if (config.provider === 'lanxin' && config.lanxinAuthMode === 'gateway') {
      if (!config.lanxinAppId) {
        throw new Error('当前未配置 lanxin APP_ID。')
      }

      Object.assign(
        headers,
        createGatewaySignedHeaders(config.lanxinAppId, config.apiKey, 'POST', endpoint.pathname),
      )
    } else {
      headers.Authorization = `Bearer ${config.apiKey}`
    }

    const response = await fetch(endpoint.href, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    })

    if (!response.ok) {
      const raw = await response.text()
      throw new Error(`${config.provider} API ${response.status}: ${raw.slice(0, 400)}`)
    }

    const payload = (await response.json()) as ChatResponse
    const content = payload.choices?.[0]?.message?.content?.trim()

    if (!content) {
      throw new Error(`${config.provider} 返回了空内容。`)
    }

    return content
  } finally {
    clearTimeout(timeout)
  }
}
