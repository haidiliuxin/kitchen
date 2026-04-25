import { existsSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import type { Recipe, Step } from '../src/types.js'

const deepseekBaseUrl = (process.env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com').replace(
  /\/$/,
  '',
)
const deepseekModel = process.env.DEEPSEEK_MODEL ?? 'deepseek-chat'
const requestTimeoutMs = Number(process.env.DEEPSEEK_TIMEOUT_MS ?? 180000)
const importFetchTimeoutMs = Number(process.env.IMPORT_FETCH_TIMEOUT_MS ?? 15000)
const externalTranscriptWebhookUrl = process.env.VIDEO_TRANSCRIPT_WEBHOOK_URL?.trim() ?? ''
const ytDlpBinaryPath = process.env.YT_DLP_BINARY_PATH?.trim()
const ytDlpCacheDir = path.join(process.cwd(), 'data', 'tools')
const bundledYtDlpBinaryPath =
  process.platform === 'win32'
    ? path.join(ytDlpCacheDir, 'yt-dlp.exe')
    : path.join(ytDlpCacheDir, 'yt-dlp')

type FetchableSource = {
  url: string
  title: string
  description: string
  content: string
  sourceType: 'article' | 'video' | 'unknown'
  provider?: 'youtube' | 'bilibili' | 'douyin' | 'generic'
  transcript: string
  transcriptLanguage?: string
  extractionNotes: string[]
  mediaSignals: string[]
}

type RenderedVideoExtraction = {
  finalUrl: string
  title?: string
  description?: string
  content?: string
  mediaUrl?: string
  extractionNotes: string[]
}

type DeepSeekResponse = {
  choices?: Array<{
    message?: {
      content?: string
    }
  }>
}

type CaptionTrack = {
  ext?: string
  url?: string
}

type YtDlpVideoInfo = {
  title?: string
  fulltitle?: string
  description?: string
  webpage_url?: string
  extractor_key?: string
  subtitles?: Record<string, CaptionTrack[]>
  automatic_captions?: Record<string, CaptionTrack[]>
  chapters?: Array<{
    title?: string
    start_time?: number
    end_time?: number
  }>
  tags?: string[]
  categories?: string[]
}

type RecipeEvidence = {
  dishName: string
  summary: string
  ingredients: Array<{
    name: string
    amount: string
    note?: string
  }>
  tools: string[]
  keyTechniques: string[]
  timeline: Array<{
    title: string
    action: string
    detail: string
    sensoryCue: string
    durationMinutes: number
  }>
  criticalTips: string[]
  commonMistakes: string[]
  rescueTips: Array<{
    issue: string
    answer: string
    keywords?: string[]
  }>
  uncertainties: string[]
}

let ytDlpWrapPromise: Promise<any | null> | null = null
let youtubeTranscriptPromise: Promise<
  ((videoId: string, config?: { lang?: string }) => Promise<Array<{ text: string; lang?: string }>>) | null
> | null = null
let playwrightChromiumPromise: Promise<any | null> | null = null

function stripHtml(raw: string): string {
  return raw
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim()
}

function pickMetaTag(html: string, keys: string[]): string {
  for (const key of keys) {
    const patterns = [
      new RegExp(
        `<meta[^>]+(?:property|name)=["']${key}["'][^>]+content=["']([^"']+)["'][^>]*>`,
        'i',
      ),
      new RegExp(
        `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${key}["'][^>]*>`,
        'i',
      ),
    ]

    for (const pattern of patterns) {
      const match = html.match(pattern)
      if (match?.[1]) {
        return stripHtml(match[1])
      }
    }
  }

  return ''
}

function pickTitle(html: string): string {
  const ogTitle = pickMetaTag(html, ['og:title', 'twitter:title'])
  if (ogTitle) {
    return ogTitle
  }

  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  return titleMatch ? stripHtml(titleMatch[1]) : ''
}

function pickMainText(html: string): string {
  const articleMatch = html.match(/<article[\s\S]*?<\/article>/i)
  if (articleMatch) {
    return stripHtml(articleMatch[0]).slice(0, 12000)
  }

  const paragraphMatches = [...html.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)]
    .map((match) => stripHtml(match[1]))
    .filter((text) => text.length >= 20)
    .slice(0, 80)

  if (paragraphMatches.length > 0) {
    return paragraphMatches.join('\n').slice(0, 12000)
  }

  return stripHtml(html).slice(0, 12000)
}

function detectSourceType(url: string, html: string): FetchableSource['sourceType'] {
  const hostname = new URL(url).hostname.toLowerCase()
  if (
    hostname.includes('youtube.com') ||
    hostname.includes('youtu.be') ||
    hostname.includes('bilibili.com') ||
    hostname.includes('douyin.com') ||
    hostname.includes('iesdouyin.com') ||
    html.includes('og:video')
  ) {
    return 'video'
  }

  if (html.includes('<article')) {
    return 'article'
  }

  return 'unknown'
}

function detectVideoProvider(url: string): 'youtube' | 'bilibili' | 'douyin' | 'generic' | null {
  const hostname = new URL(url).hostname.toLowerCase()
  if (hostname.includes('youtube.com') || hostname.includes('youtu.be')) {
    return 'youtube'
  }

  if (hostname.includes('bilibili.com')) {
    return 'bilibili'
  }

  if (hostname.includes('douyin.com') || hostname.includes('iesdouyin.com')) {
    return 'douyin'
  }

  return hostname ? 'generic' : null
}

function formatMinutes(totalSeconds: number | undefined): string {
  if (!totalSeconds || !Number.isFinite(totalSeconds) || totalSeconds <= 0) {
    return ''
  }

  const minutes = Math.floor(totalSeconds / 60)
  const seconds = Math.round(totalSeconds % 60)
  if (minutes <= 0) {
    return `${seconds} 秒`
  }

  return seconds > 0 ? `${minutes} 分 ${seconds} 秒` : `${minutes} 分钟`
}

function safeJsonParse<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

function extractBalancedJsonAfterMarker(html: string, marker: string): string | null {
  const startIndex = html.indexOf(marker)
  if (startIndex === -1) {
    return null
  }

  const jsonStart = html.indexOf('{', startIndex + marker.length)
  if (jsonStart === -1) {
    return null
  }

  let depth = 0
  let inString = false
  let isEscaped = false

  for (let index = jsonStart; index < html.length; index += 1) {
    const char = html[index]

    if (isEscaped) {
      isEscaped = false
      continue
    }

    if (char === '\\') {
      isEscaped = true
      continue
    }

    if (char === '"') {
      inString = !inString
      continue
    }

    if (inString) {
      continue
    }

    if (char === '{') {
      depth += 1
      continue
    }

    if (char === '}') {
      depth -= 1
      if (depth === 0) {
        return html.slice(jsonStart, index + 1)
      }
    }
  }

  return null
}

function extractJsonLdBlocks(html: string): string[] {
  return [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)]
    .map((match) => match[1]?.trim() ?? '')
    .filter(Boolean)
}

function extractBilibiliEmbeddedMetadata(html: string): {
  title?: string
  description?: string
  content?: string
  notes: string[]
} {
  const json = extractBalancedJsonAfterMarker(html, 'window.__INITIAL_STATE__=')
  if (!json) {
    return { notes: [] }
  }

  const state = safeJsonParse<Record<string, unknown>>(json)
  if (!state) {
    return { notes: [] }
  }

  const videoData =
    typeof state.videoData === 'object' && state.videoData !== null
      ? (state.videoData as Record<string, unknown>)
      : null

  if (!videoData) {
    return { notes: ['B 站页面里没有提取到 videoData。'] }
  }

  const owner =
    typeof videoData.owner === 'object' && videoData.owner !== null
      ? (videoData.owner as Record<string, unknown>)
      : null
  const pages = Array.isArray(videoData.pages) ? videoData.pages : []
  const honors =
    typeof state.honor_reply === 'object' && state.honor_reply !== null
      ? (((state.honor_reply as Record<string, unknown>).honor as unknown[]) ?? [])
      : []
  const tags = Array.isArray(state.tags) ? state.tags : []
  const descV2 = Array.isArray(videoData.desc_v2) ? videoData.desc_v2 : []

  const refinedDescription =
    descV2
      .map((item) =>
        typeof item === 'object' && item !== null
          ? String((item as Record<string, unknown>).raw_text ?? '').trim()
          : '',
      )
      .filter(Boolean)
      .join(' ') ||
    (typeof videoData.desc === 'string' ? videoData.desc.trim() : '')

  const contentLines = [
    typeof videoData.title === 'string' ? `标题：${videoData.title.trim()}` : '',
    owner && typeof owner.name === 'string' ? `作者：${owner.name.trim()}` : '',
    typeof videoData.duration === 'number' ? `时长：${formatMinutes(videoData.duration)}` : '',
    refinedDescription ? `简介：${refinedDescription}` : '',
    tags.length > 0
      ? `标签：${tags
          .map((item) =>
            typeof item === 'object' && item !== null
              ? String((item as Record<string, unknown>).tag_name ?? '').trim()
              : '',
          )
          .filter(Boolean)
          .slice(0, 12)
          .join('、')}`
      : '',
    pages.length > 0
      ? `分P：${pages
          .map((item, index) =>
            typeof item === 'object' && item !== null
              ? `${index + 1}.${String((item as Record<string, unknown>).part ?? '').trim()}`
              : '',
          )
          .filter(Boolean)
          .join('；')}`
      : '',
    honors.length > 0
      ? `站内信息：${honors
          .map((item) =>
            typeof item === 'object' && item !== null
              ? String((item as Record<string, unknown>).desc ?? '').trim()
              : '',
          )
          .filter(Boolean)
          .join('、')}`
      : '',
  ].filter(Boolean)

  return {
    title: typeof videoData.title === 'string' ? videoData.title.trim() : undefined,
    description: refinedDescription || undefined,
    content: contentLines.join('\n').slice(0, 8000),
    notes: ['已从 B 站页面内嵌数据提取标题、作者、标签和分P信息。'],
  }
}

function extractJsonLdMetadata(html: string): {
  title?: string
  description?: string
  content?: string
  notes: string[]
} {
  const blocks = extractJsonLdBlocks(html)
  if (blocks.length === 0) {
    return { notes: [] }
  }

  const records = blocks
    .map((block) => safeJsonParse<unknown>(block))
    .flatMap((payload) => (Array.isArray(payload) ? payload : payload ? [payload] : []))
    .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)

  const videoObject = records.find((record) => {
    const type = record['@type']
    return typeof type === 'string' ? /VideoObject|Recipe|Article/i.test(type) : false
  })

  if (!videoObject) {
    return { notes: [] }
  }

  const title = typeof videoObject.name === 'string' ? videoObject.name.trim() : ''
  const description =
    typeof videoObject.description === 'string' ? videoObject.description.trim() : ''
  const contentLines = [
    title ? `结构化标题：${title}` : '',
    description ? `结构化简介：${description}` : '',
    typeof videoObject.uploadDate === 'string' ? `发布时间：${videoObject.uploadDate}` : '',
  ].filter(Boolean)

  return {
    title: title || undefined,
    description: description || undefined,
    content: contentLines.join('\n') || undefined,
    notes: ['已从页面结构化数据中提取标题和简介。'],
  }
}

async function getYtDlpWrap(): Promise<any | null> {
  if (ytDlpWrapPromise) {
    return ytDlpWrapPromise
  }

  ytDlpWrapPromise = (async () => {
    try {
      const ytDlpWrapModule = await import('yt-dlp-wrap')
      const YTDlpWrap = (ytDlpWrapModule.default?.default ??
        ytDlpWrapModule.default ??
        ytDlpWrapModule) as any

      if (ytDlpBinaryPath) {
        return new YTDlpWrap(ytDlpBinaryPath)
      }

      mkdirSync(ytDlpCacheDir, { recursive: true })
      if (existsSync(bundledYtDlpBinaryPath)) {
        return new YTDlpWrap(bundledYtDlpBinaryPath)
      }

      await YTDlpWrap.downloadFromGithub(bundledYtDlpBinaryPath)
      return new YTDlpWrap(bundledYtDlpBinaryPath)
    } catch {
      return null
    }
  })()

  return ytDlpWrapPromise
}

async function executeYtDlpJson(ytDlp: any, args: string[]): Promise<YtDlpVideoInfo> {
  const raw = await ytDlp.execPromise(args)
  return JSON.parse(raw) as YtDlpVideoInfo
}

async function getYoutubeTranscriptFetcher(): Promise<
  ((videoId: string, config?: { lang?: string }) => Promise<Array<{ text: string; lang?: string }>>) | null
> {
  if (youtubeTranscriptPromise) {
    return youtubeTranscriptPromise
  }

  youtubeTranscriptPromise = (async () => {
    try {
      const module = await import('youtube-transcript/dist/youtube-transcript.esm.js')
      const fetcher = (module.fetchTranscript ??
        (module.default as { fetchTranscript?: unknown } | undefined)?.fetchTranscript) as
        | ((videoId: string, config?: { lang?: string }) => Promise<Array<{ text: string; lang?: string }>>)
        | undefined

      return fetcher ?? null
    } catch {
      return null
    }
  })()

  return youtubeTranscriptPromise
}

async function getPlaywrightChromium(): Promise<any | null> {
  if (playwrightChromiumPromise) {
    return playwrightChromiumPromise
  }

  playwrightChromiumPromise = (async () => {
    try {
      const playwrightModule = await import('playwright-core')
      return playwrightModule.chromium ?? null
    } catch {
      return null
    }
  })()

  return playwrightChromiumPromise
}

function resolveEdgeExecutablePath(): string | null {
  const candidates =
    process.platform === 'win32'
      ? [
          'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
          'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
        ]
      : ['/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge']

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate
    }
  }

  return null
}

function cleanDouyinRenderedText(raw: string): {
  description: string
  content: string
} {
  const normalized = raw
    .replace(/\r/g, '')
    .replace(/\u00a0/g, ' ')
    .replace(
      /(发布时间[:：]|全部评论|请先登录后发表评论|登录后即可参与互动讨论|大家都在搜[:：]?|推荐视频|相关推荐|兴欣儿Eva\s+粉丝\d|粉丝\d+(?:\.\d+)?万?获赞\d+(?:\.\d+)?万?)/g,
      '\n$1',
    )
    .trim()
  if (!normalized) {
    return { description: '', content: '' }
  }

  const lines = normalized
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)

  const stopPatterns = [
    /^发布时间[:：]/,
    /^全部评论$/,
    /^请先登录后发表评论$/,
    /^登录后即可参与互动讨论$/,
    /^立即登录$/,
    /^举报$/,
    /^分享$/,
    /^回复$/,
    /^展开\d+条回复$/,
    /^大家都在搜[:：]?$/,
    /^推荐视频$/,
    /^相关推荐$/,
    /^搜索$/,
    /^充钻石$/,
    /^客户端$/,
    /^壁纸$/,
    /^通知$/,
    /^私信$/,
    /^投稿$/,
    /^登录$/,
    /^下载抖音/,
    /^202\d\s*©\s*抖音$/,
    /^京ICP备/,
    /^京公网安备/,
    /^广播电视节目制作经营许可证/,
    /^用户服务协议$/,
    /^隐私政策$/,
    /^营业执照$/,
    /^友情链接$/,
    /^站点地图$/,
    /^评论\d*$/,
  ]
  const noisePatterns = [
    /^开启读屏标签/,
    /^读屏标签已关闭$/,
    /^(精选|推荐|关注|朋友|我的|直播|放映厅|短剧|小游戏)$/,
    /^因浏览器限制/,
    /^打开声音$/,
    /^(倍速|智能|清屏|连播)$/,
    /^\d{2}:\d{2}\s*\/\s*\d{2}:\d{2}$/,
    /^\d+$/,
    /^\d+周前/,
    /^\d+月前/,
    /^\d+天前/,
    /^作者回复过$/,
    /^作者$/,
    /^[\d.]+[万wW]?$/,
    /^粉丝\d+(?:\.\d+)?万?获赞\d+(?:\.\d+)?万?$/,
    /^.*(?:收藏|点赞|评论)\d+.*$/,
    /^.*(?:分享|举报|展开\d+条回复).*$/,
  ]

  const kept: string[] = []
  let sawMainText = false

  for (const line of lines) {
    const trimmedLine = line
      .replace(/\s*(举报|分享|回复|展开\d+条回复)\s*$/g, '')
      .replace(/\s+\d+\s+\d+\s+\d+\s+\d+\s*$/, '')
      .trim()

    if (!trimmedLine) {
      continue
    }

    if (
      stopPatterns.some((pattern) => pattern.test(trimmedLine)) ||
      /(全部评论|推荐视频|相关推荐|登录后即可参与互动讨论|请先登录后发表评论|大家都在搜[:：]?|粉丝\d+(?:\.\d+)?万?获赞\d+(?:\.\d+)?万?)/.test(
        trimmedLine,
      )
    ) {
      if (sawMainText) {
        break
      }

      continue
    }

    if (noisePatterns.some((pattern) => pattern.test(trimmedLine))) {
      continue
    }

    if (!sawMainText) {
      if (
        /(#|【食材】|做法|清爽|低卡|沙拉|鸡蛋|番茄|虾仁|牛油果|苦苣|炒|煮|拌|蒸|炸|炖)/.test(
          trimmedLine,
        )
      ) {
        sawMainText = true
      } else {
        continue
      }
    }

    kept.push(trimmedLine)
    if (kept.length >= 12) {
      break
    }
  }

  const content = kept.join(' ').replace(/\s+/g, ' ').trim()
  const description = kept.slice(0, 3).join(' ').replace(/\s+/g, ' ').trim()
  return {
    description: description.slice(0, 240),
    content: content.slice(0, 4000),
  }
}

async function extractRenderedVideoPage(
  url: string,
  provider: FetchableSource['provider'],
): Promise<RenderedVideoExtraction | null> {
  if (provider !== 'douyin') {
    return null
  }

  const chromium = await getPlaywrightChromium()
  const executablePath = resolveEdgeExecutablePath()
  if (!chromium || !executablePath) {
    return null
  }

  let browser: any | null = null

  try {
    browser = await chromium.launch({
      executablePath,
      headless: true,
    })

    const page = await browser.newPage({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0 Safari/537.36',
    })
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 })
    await page.waitForTimeout(8000)

    const rendered = (await page.evaluate(() => {
      const browserGlobal = globalThis as unknown as {
        document?: {
          title?: string
          body?: { innerText?: string }
          querySelector?: (selector: string) => {
            getAttribute?: (name: string) => string | null
            currentSrc?: string
          } | null
        }
        location?: {
          href?: string
        }
      }
      const title = browserGlobal.document?.title?.trim?.() ?? ''
      const text = browserGlobal.document?.body?.innerText?.trim?.() ?? ''
      const videoElement = browserGlobal.document?.querySelector?.('video')
      const sourceElement = browserGlobal.document?.querySelector?.('video source')
      const mediaUrl =
        videoElement?.getAttribute?.('src') ??
        sourceElement?.getAttribute?.('src') ??
        videoElement?.currentSrc ??
        ''

      return {
        finalUrl: browserGlobal.location?.href ?? '',
        title,
        text,
        mediaUrl,
      }
    })) as {
      finalUrl: string
      title: string
      text: string
      mediaUrl: string
    }

    const cleanedText = cleanDouyinRenderedText(
      rendered.text.replace(/开启读屏标签[\s\S]*?00:\d{2}\s*\/\s*\d{2}:\d{2}/, ''),
    )

    return {
      finalUrl: rendered.finalUrl || url,
      title: rendered.title || undefined,
      description: cleanedText.description || undefined,
      content: cleanedText.content || undefined,
      mediaUrl: rendered.mediaUrl || undefined,
      extractionNotes: [
        '已通过无头 Edge 渲染抖音页面，提取到页面标题、正文和视频直链。',
      ],
    }
  } catch {
    return null
  } finally {
    if (browser) {
      await browser.close().catch(() => {})
    }
  }
}

function parseXmlLikeSubtitles(raw: string): string {
  const textMatches = [...raw.matchAll(/<text[^>]*>([\s\S]*?)<\/text>/gi)].map((match) =>
    stripHtml(match[1]),
  )
  if (textMatches.length > 0) {
    return textMatches.join(' ')
  }

  const paragraphMatches = [...raw.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)].map((match) =>
    stripHtml(match[1]),
  )
  if (paragraphMatches.length > 0) {
    return paragraphMatches.join(' ')
  }

  return stripHtml(raw)
}

function parseVttSubtitles(raw: string): string {
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter(
      (line) =>
        line &&
        !line.startsWith('WEBVTT') &&
        !line.startsWith('NOTE') &&
        !line.includes('-->') &&
        !/^\d+$/.test(line),
    )
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function parseJsonSubtitles(raw: string): string {
  try {
    const payload = JSON.parse(raw) as
      | { events?: Array<{ segs?: Array<{ utf8?: string }> }> }
      | Array<{ text?: string }>

    if (Array.isArray(payload)) {
      return payload
        .map((item) => (typeof item.text === 'string' ? item.text : ''))
        .filter(Boolean)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim()
    }

    return (payload.events ?? [])
      .flatMap((event) => event.segs ?? [])
      .map((segment) => segment.utf8 ?? '')
      .filter(Boolean)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim()
  } catch {
    return ''
  }
}

async function fetchSubtitleTrackText(track: CaptionTrack): Promise<string> {
  if (!track.url) {
    return ''
  }

  const response = await fetch(track.url)
  if (!response.ok) {
    return ''
  }

  const raw = await response.text()
  const extension = (track.ext ?? '').toLowerCase()

  if (extension === 'json3' || extension === 'json') {
    return parseJsonSubtitles(raw)
  }

  if (extension === 'vtt') {
    return parseVttSubtitles(raw)
  }

  if (extension === 'ttml' || extension === 'srv3' || extension === 'xml') {
    return parseXmlLikeSubtitles(raw)
  }

  return stripHtml(raw)
}

function pickBestCaptionTracks(
  source: Record<string, CaptionTrack[]> | undefined,
): Array<{ language: string; track: CaptionTrack }> {
  if (!source) {
    return []
  }

  const preferredLanguagePatterns = [
    /^zh[-_]?Hans/i,
    /^zh[-_]?CN/i,
    /^zh/i,
    /^en/i,
  ]
  const preferredExts = ['json3', 'vtt', 'ttml', 'srv3', 'xml']

  const candidates = Object.entries(source).flatMap(([language, tracks]) =>
    tracks.map((track) => ({ language, track })),
  )

  return candidates
    .filter((candidate) => !/danmaku/i.test(candidate.language))
    .sort((left, right) => {
      const leftLanguageScore = preferredLanguagePatterns.findIndex((pattern) =>
        pattern.test(left.language),
      )
      const rightLanguageScore = preferredLanguagePatterns.findIndex((pattern) =>
        pattern.test(right.language),
      )
      const leftExtScore = preferredExts.indexOf((left.track.ext ?? '').toLowerCase())
      const rightExtScore = preferredExts.indexOf((right.track.ext ?? '').toLowerCase())

      return (
        (leftLanguageScore === -1 ? 999 : leftLanguageScore) -
          (rightLanguageScore === -1 ? 999 : rightLanguageScore) ||
        (leftExtScore === -1 ? 999 : leftExtScore) - (rightExtScore === -1 ? 999 : rightExtScore)
      )
    })
    .slice(0, 4)
}

function isLikelyNoisyTranscriptLine(line: string): boolean {
  const trimmed = line.trim()
  if (!trimmed) {
    return true
  }

  if (trimmed.length <= 3) {
    return true
  }

  if (/chat\.bilibili\.com/i.test(trimmed)) {
    return true
  }

  if (/^[A-Za-z0-9 .:_/-]+$/.test(trimmed)) {
    return true
  }

  if (/(哈){4,}|(啊){4,}|(呵){4,}|(.)\1{5,}/.test(trimmed)) {
    return true
  }

  if (/[↑↓→←]/.test(trimmed)) {
    return true
  }

  const punctuationCount = (trimmed.match(/[!@#$%^&*_=+<>|/\\`~]/g) ?? []).length
  if (punctuationCount >= 4) {
    return true
  }

  const asciiCount = (trimmed.match(/[A-Za-z]/g) ?? []).length
  if (asciiCount > 0 && asciiCount / trimmed.length > 0.45) {
    return true
  }

  return false
}

function cleanTranscriptText(raw: string): string {
  const deduped = new Set<string>()
  const lines = raw
    .split(/[\n。！？!?]/)
    .map((line) => line.trim())
    .filter((line) => line.length >= 4)
    .filter((line) => !isLikelyNoisyTranscriptLine(line))
    .filter((line) => {
      if (deduped.has(line)) {
        return false
      }

      deduped.add(line)
      return true
    })

  return lines.join('。').replace(/\s+/g, ' ').slice(0, 16000).trim()
}

async function fetchVideoTranscript(
  url: string,
  sourceType: FetchableSource['sourceType'],
  renderedExtraction?: RenderedVideoExtraction | null,
): Promise<{
  transcript: string
  transcriptLanguage?: string
  extractionNotes: string[]
  metadataTitle?: string
  metadataDescription?: string
  metadataContent?: string
}> {
  if (sourceType !== 'video') {
    return {
      transcript: '',
      extractionNotes: [],
    }
  }

  if (externalTranscriptWebhookUrl) {
    try {
      const response = await fetch(externalTranscriptWebhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url,
          sourceType,
          mediaUrl: renderedExtraction?.mediaUrl,
          title: renderedExtraction?.title,
          description: renderedExtraction?.description,
          content: renderedExtraction?.content,
        }),
      })

      if (response.ok) {
        const payload = (await response.json()) as {
          transcript?: string
          language?: string
          notes?: string[]
          title?: string
          description?: string
          content?: string
        }

        if (typeof payload.transcript === 'string' && payload.transcript.trim()) {
          return {
            transcript: payload.transcript.trim().slice(0, 16000),
            transcriptLanguage: payload.language,
            extractionNotes:
              Array.isArray(payload.notes) && payload.notes.length > 0
                ? payload.notes
                : ['已通过外部转写服务获取视频字幕或 ASR 文本。'],
            metadataTitle: payload.title,
            metadataDescription: payload.description,
            metadataContent:
              typeof payload.content === 'string' && payload.content.trim()
                ? payload.content.trim().slice(0, 12000)
                : undefined,
          }
        }
      }
    } catch {
      // Ignore webhook failures and continue with built-in strategies.
    }
  }

  const provider = detectVideoProvider(url)

  const ytDlp = await getYtDlpWrap()
  if (ytDlp) {
    try {
      const info = await executeYtDlpJson(ytDlp, [
        url,
        '--skip-download',
        '--no-warnings',
        '--simulate',
        '--dump-single-json',
        '--write-auto-subs',
        '--write-subs',
        '--sub-langs',
        'zh-Hans,zh-CN,zh.*,en.*',
      ])

      const subtitleCandidates = [
        ...pickBestCaptionTracks(info.subtitles),
        ...pickBestCaptionTracks(info.automatic_captions),
      ]

      let transcript = ''
      let transcriptLanguage: string | undefined

      for (const candidate of subtitleCandidates) {
        transcript = cleanTranscriptText(await fetchSubtitleTrackText(candidate.track))
        if (transcript) {
          transcriptLanguage = candidate.language
          break
        }
      }

      const chaptersText = (info.chapters ?? [])
        .map((chapter, index) => {
          const title = chapter.title?.trim()
          return title ? `章节 ${index + 1}：${title}` : ''
        })
        .filter(Boolean)
        .join('\n')

      const metadataContent = [
        info.description?.trim() ?? '',
        chaptersText,
        Array.isArray(info.tags) && info.tags.length > 0 ? `标签：${info.tags.join('、')}` : '',
        Array.isArray(info.categories) && info.categories.length > 0
          ? `分类：${info.categories.join('、')}`
          : '',
      ]
        .filter(Boolean)
        .join('\n')
        .slice(0, 12000)

      return {
        transcript,
        transcriptLanguage,
        extractionNotes: transcript
          ? [`已通过 yt-dlp 从${provider ?? '视频站点'}提取字幕或自动字幕。`]
          : [`已通过 yt-dlp 提取视频元信息，但没有拿到可用字幕或字幕内容已被判定为噪音。`],
        metadataTitle: info.title ?? info.fulltitle,
        metadataDescription: info.description?.slice(0, 500),
        metadataContent,
      }
    } catch (error) {
      if (provider === 'bilibili' || provider === 'douyin') {
        return {
          transcript: '',
          extractionNotes: [
            error instanceof Error
              ? `已尝试通过 yt-dlp 解析${provider === 'bilibili' ? 'B 站' : '抖音'}视频，但失败：${error.message}`
              : `已尝试通过 yt-dlp 解析${provider === 'bilibili' ? 'B 站' : '抖音'}视频，但失败。`,
          ],
        }
      }
    }
  }

  if (provider === 'youtube') {
    try {
      const fetchTranscript = await getYoutubeTranscriptFetcher()
      if (!fetchTranscript) {
        return {
          transcript: '',
          extractionNotes: ['YouTube 字幕库当前不可用，已退回网页文本抽取。'],
        }
      }

      const transcriptRows = await fetchTranscript(url, { lang: 'zh-Hans' }).catch(async () =>
        fetchTranscript(url, { lang: 'zh-CN' }).catch(async () =>
          fetchTranscript(url, { lang: 'en' }),
        ),
      )

      const transcript = transcriptRows
        .map((row) => row.text.trim())
        .filter(Boolean)
        .join(' ')
        .replace(/\s+/g, ' ')
        .slice(0, 16000)

      return {
        transcript,
        transcriptLanguage: transcriptRows[0]?.lang,
        extractionNotes: transcript
          ? ['已成功抓取 YouTube 字幕，可用于步骤提炼。']
          : ['YouTube 字幕接口返回为空，已退回网页文本抽取。'],
      }
    } catch (error) {
      return {
        transcript: '',
        extractionNotes: [
          error instanceof Error
            ? `YouTube 字幕抓取失败：${error.message}`
            : 'YouTube 字幕抓取失败，已退回网页文本抽取。',
        ],
      }
    }
  }

  return {
    transcript: '',
    extractionNotes: ['暂时没有拿到该视频链接的字幕，将退回网页和元信息抽取。'],
  }
}

async function fetchSourceFromUrl(url: string): Promise<FetchableSource> {
  let parsedUrl: URL

  try {
    parsedUrl = new URL(url)
  } catch {
    throw new Error('请输入合法的链接。')
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), importFetchTimeoutMs)

  try {
    const response = await fetch(parsedUrl.toString(), {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      signal: controller.signal,
    })

    if (!response.ok) {
      throw new Error(`链接抓取失败：${response.status}`)
    }

    const html = await response.text()
    const sourceType = detectSourceType(parsedUrl.toString(), html)
    const provider = detectVideoProvider(parsedUrl.toString()) ?? undefined
    const renderedExtraction = await extractRenderedVideoPage(parsedUrl.toString(), provider)
    const transcriptResult = await fetchVideoTranscript(
      renderedExtraction?.finalUrl || parsedUrl.toString(),
      sourceType,
      renderedExtraction,
    )
    const providerMetadata =
      provider === 'bilibili'
        ? extractBilibiliEmbeddedMetadata(html)
        : extractJsonLdMetadata(html)
    const title =
      transcriptResult.metadataTitle ||
      renderedExtraction?.title ||
      providerMetadata.title ||
      pickTitle(html) ||
      '未命名菜谱'
    const description =
      transcriptResult.metadataDescription ||
      renderedExtraction?.description ||
      providerMetadata.description ||
      pickMetaTag(html, ['description', 'og:description', 'twitter:description'])
    const contentBlocks = [
      transcriptResult.metadataContent ?? '',
      renderedExtraction?.content ?? '',
      providerMetadata.content ?? '',
      pickMainText(html),
    ]
      .map((block) => block.trim())
      .filter(Boolean)
      .filter((block, index, blocks) => blocks.indexOf(block) === index)

    const content = contentBlocks.join('\n').slice(0, 20000)

    const mediaSignals = [
      title ? '页面标题' : '',
      description ? '页面简介' : '',
      content ? '网页正文/元信息' : '',
      transcriptResult.transcript ? '视频字幕/自动字幕' : '',
    ].filter(Boolean)

    if (!content.trim() && !description.trim() && !transcriptResult.transcript.trim()) {
      throw new Error('链接内容太少，暂时无法提取有效做饭信息。')
    }

    return {
      url: renderedExtraction?.finalUrl || parsedUrl.toString(),
      title,
      description,
      content,
      sourceType,
      provider,
      transcript: transcriptResult.transcript,
      transcriptLanguage: transcriptResult.transcriptLanguage,
      extractionNotes: [
        ...providerMetadata.notes,
        ...(renderedExtraction?.extractionNotes ?? []),
        ...transcriptResult.extractionNotes,
      ],
      mediaSignals,
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('链接抓取超时，请稍后重试。')
    }

    throw error
  } finally {
    clearTimeout(timeout)
  }
}

function buildImportSystemPrompt(): string {
  return [
    '你是一个把菜谱文章或做饭视频内容，整理成结构化中文菜谱 JSON 的助手。',
    '请尽量提取真实步骤，不要输出空泛废话。',
    '如果原文信息不足，可以做少量合理补全，但必须保持新手友好、可执行。',
    '如果这是视频链接，请尽量还原视频中的操作顺序、关键火候、状态变化、调味节点和收尾判断。',
    '输出必须是严格 JSON，不要加解释，不要加 markdown 代码块。',
    '字段必须完整，结构必须符合要求。',
    'demoFrames 必须恰好 3 条短句。',
    'difficulty 只能是：零失败、轻松进阶、周末进阶。',
    'video.url 可以直接填原始链接，posterUrl 可以省略。',
    '如果提供了视频字幕，请优先结合字幕来拆分真实步骤。',
    '如果字幕、章节和网页简介冲突，优先采信更具体、更像操作指令的内容。',
    '如果给了“结构化证据”，请优先采用结构化证据中的食材、步骤、状态和风险点，不要退化成过于笼统的模板。',
  ].join('')
}

function buildEvidenceSystemPrompt(): string {
  return [
    '你是一个做饭视频解析助手，要先把视频或文章里的可执行信息提炼成“做菜证据”。',
    '请只输出严格 JSON，不要加解释，不要加 markdown。',
    '目标不是生成最终菜谱，而是尽量完整地抽取：菜名、食材、工具、关键技法、步骤顺序、每步细节、状态判断、常见失误和补救提示。',
    '如果信息不确定，请写进 uncertainties，不要胡编具体克数。',
    'timeline 必须尽量反映原视频的真实先后顺序，每一步都要包含 action、detail、sensoryCue、durationMinutes。',
    '如果信息来自字幕或章节，要优先保留这些更接近原视频的细节。',
  ].join('')
}

function buildEvidenceUserPrompt(source: FetchableSource): string {
  return [
    '请根据下面的源材料，提取做菜证据 JSON。',
    '',
    '输出 JSON 结构要求：',
    JSON.stringify(
      {
        dishName: '九转大肠',
        summary: '先清洗处理大肠，再炸制定型，最后调汁回锅收成酸甜微辣的九转大肠。',
        ingredients: [
          { name: '猪大肠', amount: '适量', note: '主食材，需彻底处理异味' },
        ],
        tools: ['炒锅', '刀', '案板'],
        keyTechniques: ['处理异味', '炸制定型', '调酸甜汁', '回锅收汁'],
        timeline: [
          {
            title: '处理大肠',
            action: '先把大肠清洗、去异味并切成合适段。',
            detail: '关注原视频里强调的预处理顺序和清洗重点。',
            sensoryCue: '异味明显减弱，表面处理干净，形状便于后续下锅。',
            durationMinutes: 10,
          },
        ],
        criticalTips: ['如果视频特别强调某个火候或调味节点，要单独写出来。'],
        commonMistakes: ['只写大概步骤，没有还原关键状态。'],
        rescueTips: [
          {
            issue: '火候过了怎么办',
            answer: '优先记录视频里提到的补救办法，没有则给出保守补救建议。',
            keywords: ['过火', '糊了'],
          },
        ],
        uncertainties: ['哪些克数、分钟数在源材料里并不明确。'],
      },
      null,
      2,
    ),
    '',
    `原始链接：${source.url}`,
    `来源类型：${source.sourceType}`,
    `站点：${source.provider ?? '未知'}`,
    `已提取信号：${source.mediaSignals.join('、') || '无'}`,
    `标题：${source.title}`,
    `简介：${source.description || '无'}`,
    `抓取备注：${source.extractionNotes.join('；') || '无'}`,
    source.transcriptLanguage ? `字幕语言：${source.transcriptLanguage}` : '字幕语言：未知',
    '',
    '网页正文和站点元信息：',
    source.content || '无',
    '',
    '视频字幕或转写文本：',
    source.transcript || '无可用字幕',
  ].join('\n')
}

function buildImportUserPrompt(source: FetchableSource): string {
  return [
    '请把下面的链接内容整理成一个适合厨房新手使用的菜谱 JSON。',
    '',
    '输出 JSON 结构要求：',
    JSON.stringify(
      {
        title: '番茄炒蛋',
        subtitle: '10 分钟搞定的家常快手菜',
        scene: '晚饭不知道做什么时',
        difficulty: '零失败',
        duration: 15,
        servings: 2,
        highlight: '酸甜下饭，新手也容易成功',
        riskNote: '鸡蛋容易炒老，番茄容易出水过多',
        description: '一句话概括整道菜怎么做和适合谁。',
        tags: ['家常', '快手'],
        searchTokens: ['番茄', '鸡蛋'],
        tools: ['炒锅', '碗'],
        ingredients: [{ name: '番茄', amount: '2 个' }],
        substitutions: [
          {
            ingredient: '小葱',
            replacement: '香葱',
            tip: '没有时也可以不放。',
          },
        ],
        rescueTips: [
          {
            issue: '鸡蛋炒老了怎么办',
            keywords: ['鸡蛋炒老', '太老'],
            answer: '下次缩短炒制时间，这次可以加一点番茄汁缓和口感。',
          },
        ],
        steps: [
          {
            title: '先备菜',
            instruction: '一句话动作描述',
            detail: '解释为什么这样做',
            durationMinutes: 3,
            sensoryCue: '用户此时应该观察什么状态',
            checkpoints: ['检查点 1', '检查点 2', '检查点 3'],
            commonMistakes: ['错误 1', '错误 2'],
            demoFrames: ['动作提示 1', '动作提示 2', '动作提示 3'],
            voiceover: '适合朗读给用户听的短引导',
            video: {
              url: source.url,
              caption: '原始攻略链接',
              creditLabel: source.sourceType === 'video' ? '视频来源' : '文章来源',
              creditUrl: source.url,
            },
          },
        ],
        palette: {
          start: '#FFE0B2',
          end: '#FFCC80',
        },
      },
      null,
      2,
    ),
    '',
    `原始链接：${source.url}`,
    `来源类型：${source.sourceType}`,
    `站点：${source.provider ?? '未知'}`,
    `已提取信号：${source.mediaSignals.join('、') || '无'}`,
    `标题：${source.title}`,
    `简介：${source.description || '无'}`,
    `抓取备注：${source.extractionNotes.join('；') || '无'}`,
    source.transcriptLanguage ? `字幕语言：${source.transcriptLanguage}` : '字幕语言：未知',
    '网页正文或元信息：',
    source.content,
    '',
    '视频字幕或转写文本：',
    source.transcript || '无可用字幕',
  ].join('\n')
}

function buildImportUserPromptWithEvidence(source: FetchableSource, evidence: RecipeEvidence): string {
  return [
    buildImportUserPrompt(source),
    '',
    '已经提炼出的结构化做菜证据：',
    JSON.stringify(evidence, null, 2),
    '',
    '请优先用这份结构化证据来还原最终菜谱，确保：',
    '1. 食材、步骤顺序、关键状态和易错点尽量接近原视频。',
    '2. 每一步都要给出新手能执行的动作、判断标准和朗读文案。',
    '3. 如果证据里有 uncertainties，不要硬编非常具体的克数或秒数。',
    '4. 如果视频来源信息不足，也要保持步骤真实、克制，不要套用与原菜无关的模板。',
  ].join('\n')
}

function parseJsonFromModelResponse(raw: string): unknown {
  const trimmed = raw.trim()
  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = fencedMatch?.[1]?.trim() ?? trimmed
  return JSON.parse(candidate)
}

async function callDeepSeekJson(
  apiKey: string,
  messages: Array<{ role: 'system' | 'user'; content: string }>,
  maxTokens: number,
): Promise<unknown> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs)

  try {
    const response = await fetch(`${deepseekBaseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: deepseekModel,
        temperature: 0.15,
        max_tokens: maxTokens,
        response_format: {
          type: 'json_object',
        },
        messages,
      }),
      signal: controller.signal,
    })

    if (!response.ok) {
      const raw = await response.text()
      throw new Error(`大模型生成失败：${response.status} ${raw.slice(0, 300)}`)
    }

    const payload = (await response.json()) as DeepSeekResponse
    const content = payload.choices?.[0]?.message?.content?.trim()
    if (!content) {
      throw new Error('大模型没有返回可用内容。')
    }

    return parseJsonFromModelResponse(content)
  } finally {
    clearTimeout(timeout)
  }
}

function normalizeRecipeEvidence(payload: unknown): RecipeEvidence {
  const raw =
    typeof payload === 'object' && payload !== null ? (payload as Record<string, unknown>) : {}

  const timeline = Array.isArray(raw.timeline)
    ? raw.timeline
        .map((item, index) => {
          const record =
            typeof item === 'object' && item !== null ? (item as Record<string, unknown>) : {}
          const title = typeof record.title === 'string' ? record.title.trim() : ''
          const action = typeof record.action === 'string' ? record.action.trim() : ''
          const detail = typeof record.detail === 'string' ? record.detail.trim() : ''
          const sensoryCue =
            typeof record.sensoryCue === 'string' ? record.sensoryCue.trim() : ''
          const durationMinutes =
            typeof record.durationMinutes === 'number' && Number.isFinite(record.durationMinutes)
              ? Math.max(1, Math.round(record.durationMinutes))
              : 4

          if (!title && !action && !detail) {
            return null
          }

          return {
            title: title || `步骤 ${index + 1}`,
            action: action || detail || `按原视频继续完成第 ${index + 1} 步。`,
            detail: detail || action || '这是根据源材料提取出的动作摘要。',
            sensoryCue: sensoryCue || '观察颜色、香味、软硬和汁水状态的变化。',
            durationMinutes,
          }
        })
        .filter(
          (
            item,
          ): item is {
            title: string
            action: string
            detail: string
            sensoryCue: string
            durationMinutes: number
          } => item !== null,
        )
    : []

  return {
    dishName:
      typeof raw.dishName === 'string' && raw.dishName.trim() ? raw.dishName.trim() : '导入菜谱',
    summary:
      typeof raw.summary === 'string' && raw.summary.trim()
        ? raw.summary.trim()
        : '根据外部视频或文章提炼出的做菜证据。',
    ingredients: Array.isArray(raw.ingredients)
      ? raw.ingredients.reduce<Array<{ name: string; amount: string; note?: string }>>((next, item) => {
          const record =
            typeof item === 'object' && item !== null ? (item as Record<string, unknown>) : {}
          const name =
            typeof record.name === 'string' && record.name.trim() ? record.name.trim() : ''
          const amount =
            typeof record.amount === 'string' && record.amount.trim()
              ? record.amount.trim()
              : '适量'
          const note =
            typeof record.note === 'string' && record.note.trim() ? record.note.trim() : undefined

          if (name) {
            next.push({ name, amount, note })
          }

          return next
        }, [])
      : [],
    tools: normalizeStringArray(raw.tools, []),
    keyTechniques: normalizeStringArray(raw.keyTechniques, []),
    timeline,
    criticalTips: normalizeStringArray(raw.criticalTips, []),
    commonMistakes: normalizeStringArray(raw.commonMistakes, []),
    rescueTips: Array.isArray(raw.rescueTips)
      ? raw.rescueTips.reduce<Array<{ issue: string; answer: string; keywords?: string[] }>>(
          (next, item) => {
            const record =
              typeof item === 'object' && item !== null ? (item as Record<string, unknown>) : {}
            const issue = typeof record.issue === 'string' ? record.issue.trim() : ''
            const answer = typeof record.answer === 'string' ? record.answer.trim() : ''
            const keywords = normalizeStringArray(record.keywords, [])

            if (issue && answer) {
              next.push({ issue, answer, keywords })
            }

            return next
          },
          [],
        )
      : [],
    uncertainties: normalizeStringArray(raw.uncertainties, []),
  }
}

async function extractRecipeEvidence(apiKey: string, source: FetchableSource): Promise<RecipeEvidence> {
  const payload = await callDeepSeekJson(
    apiKey,
    [
      {
        role: 'system',
        content: buildEvidenceSystemPrompt(),
      },
      {
        role: 'user',
        content: buildEvidenceUserPrompt(source),
      },
    ],
    3200,
  )

  return normalizeRecipeEvidence(payload)
}

function normalizeStringArray(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) {
    return fallback
  }

  const next = value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean)

  return next.length > 0 ? next : fallback
}

function normalizeStep(step: unknown, index: number, sourceUrl: string): Step {
  const raw = typeof step === 'object' && step !== null ? (step as Record<string, unknown>) : {}
  const videoRecord =
    typeof raw.video === 'object' && raw.video !== null
      ? (raw.video as Record<string, unknown>)
      : null
  const demoFrames = normalizeStringArray(raw.demoFrames, ['准备动作', '关键动作', '收尾动作']).slice(0, 3)

  while (demoFrames.length < 3) {
    demoFrames.push(`动作提示 ${demoFrames.length + 1}`)
  }

  const durationMinutes =
    typeof raw.durationMinutes === 'number' && Number.isFinite(raw.durationMinutes)
      ? Math.max(1, Math.round(raw.durationMinutes))
      : 3

  return {
    title: typeof raw.title === 'string' && raw.title.trim() ? raw.title.trim() : `步骤 ${index + 1}`,
    instruction:
      typeof raw.instruction === 'string' && raw.instruction.trim()
        ? raw.instruction.trim()
        : '按原始攻略中的顺序完成这一步。',
    detail:
      typeof raw.detail === 'string' && raw.detail.trim()
        ? raw.detail.trim()
        : '这是根据原始链接内容整理出的步骤说明。',
    durationMinutes,
    sensoryCue:
      typeof raw.sensoryCue === 'string' && raw.sensoryCue.trim()
        ? raw.sensoryCue.trim()
        : '观察食材颜色、香味和软硬变化。',
    checkpoints: normalizeStringArray(raw.checkpoints, [
      '状态接近原攻略描述',
      '食材受热均匀',
      '没有明显烧焦或过生',
    ]),
    commonMistakes: normalizeStringArray(raw.commonMistakes, ['火候过大', '步骤推进太快']),
    demoFrames: [demoFrames[0], demoFrames[1], demoFrames[2]],
    voiceover:
      typeof raw.voiceover === 'string' && raw.voiceover.trim()
        ? raw.voiceover.trim()
        : '这一小步别着急，先把当前状态做到位再继续。',
    video: videoRecord
      ? {
          url:
            typeof videoRecord.url === 'string' && videoRecord.url.trim()
              ? videoRecord.url.trim()
              : sourceUrl,
          posterUrl:
            typeof videoRecord.posterUrl === 'string' && videoRecord.posterUrl.trim()
              ? videoRecord.posterUrl.trim()
              : undefined,
          caption:
            typeof videoRecord.caption === 'string' && videoRecord.caption.trim()
              ? videoRecord.caption.trim()
              : '原始攻略链接',
          creditLabel:
            typeof videoRecord.creditLabel === 'string' && videoRecord.creditLabel.trim()
              ? videoRecord.creditLabel.trim()
              : undefined,
          creditUrl:
            typeof videoRecord.creditUrl === 'string' && videoRecord.creditUrl.trim()
              ? videoRecord.creditUrl.trim()
              : undefined,
        }
      : {
          url: sourceUrl,
          caption: '原始攻略链接',
          creditUrl: sourceUrl,
        },
  }
}

function normalizeImportedRecipe(payload: unknown, source: FetchableSource): Recipe {
  const raw =
    typeof payload === 'object' && payload !== null ? (payload as Record<string, unknown>) : {}

  const difficultyRaw = typeof raw.difficulty === 'string' ? raw.difficulty.trim() : '零失败'
  const difficulty =
    difficultyRaw === '零失败' ||
    difficultyRaw === '轻松进阶' ||
    difficultyRaw === '周末进阶'
      ? difficultyRaw
      : '零失败'

  const stepsRaw = Array.isArray(raw.steps) ? raw.steps : []
  if (stepsRaw.length === 0) {
    throw new Error('AI 没有生成有效步骤，请换一个信息更完整的链接再试。')
  }

  return {
    id: `imported-${randomUUID()}`,
    title:
      typeof raw.title === 'string' && raw.title.trim()
        ? raw.title.trim()
        : source.title.slice(0, 40) || '导入菜谱',
    subtitle:
      typeof raw.subtitle === 'string' && raw.subtitle.trim()
        ? raw.subtitle.trim()
        : '由外部链接自动整理生成',
    scene:
      typeof raw.scene === 'string' && raw.scene.trim()
        ? raw.scene.trim()
        : '根据外部做饭攻略整理',
    difficulty,
    duration:
      typeof raw.duration === 'number' && Number.isFinite(raw.duration)
        ? Math.max(5, Math.round(raw.duration))
        : Math.max(
            10,
            stepsRaw.reduce(
              (total, step, index) => total + normalizeStep(step, index, source.url).durationMinutes,
              0,
            ),
          ),
    servings:
      typeof raw.servings === 'number' && Number.isFinite(raw.servings)
        ? Math.max(1, Math.round(raw.servings))
        : 2,
    highlight:
      typeof raw.highlight === 'string' && raw.highlight.trim()
        ? raw.highlight.trim()
        : '由外部攻略自动整理，适合继续细化和跟做。',
    riskNote:
      typeof raw.riskNote === 'string' && raw.riskNote.trim()
        ? raw.riskNote.trim()
        : '该菜谱由链接内容自动提炼，实际制作时请结合食材状态灵活判断。',
    description:
      typeof raw.description === 'string' && raw.description.trim()
        ? raw.description.trim()
        : source.description || '这是根据外部做饭攻略自动整理出的菜谱。',
    tags: normalizeStringArray(raw.tags, [
      '导入菜谱',
      source.sourceType === 'video' ? '视频整理' : '文章整理',
    ]),
    searchTokens: normalizeStringArray(raw.searchTokens, [source.title, '导入', '攻略生成']),
    tools: normalizeStringArray(raw.tools, ['锅', '铲子', '碗']),
    ingredients: Array.isArray(raw.ingredients)
      ? raw.ingredients
          .map((item) => {
            const record =
              typeof item === 'object' && item !== null ? (item as Record<string, unknown>) : {}
            const name =
              typeof record.name === 'string' && record.name.trim() ? record.name.trim() : ''
            const amount =
              typeof record.amount === 'string' && record.amount.trim()
                ? record.amount.trim()
                : '适量'

            return name ? { name, amount } : null
          })
          .filter((item): item is { name: string; amount: string } => item !== null)
      : [{ name: '请根据原链接补充食材', amount: '适量' }],
    substitutions: Array.isArray(raw.substitutions)
      ? raw.substitutions
          .map((item) => {
            const record =
              typeof item === 'object' && item !== null ? (item as Record<string, unknown>) : {}
            const ingredient =
              typeof record.ingredient === 'string' ? record.ingredient.trim() : ''
            const replacement =
              typeof record.replacement === 'string' ? record.replacement.trim() : ''
            const tip = typeof record.tip === 'string' ? record.tip.trim() : ''

            return ingredient && replacement && tip ? { ingredient, replacement, tip } : null
          })
          .filter(
            (item): item is { ingredient: string; replacement: string; tip: string } =>
              item !== null,
          )
      : [],
    rescueTips: Array.isArray(raw.rescueTips)
      ? raw.rescueTips
          .map((item) => {
            const record =
              typeof item === 'object' && item !== null ? (item as Record<string, unknown>) : {}
            const issue = typeof record.issue === 'string' ? record.issue.trim() : ''
            const answer = typeof record.answer === 'string' ? record.answer.trim() : ''
            const keywords = normalizeStringArray(record.keywords, [])

            return issue && answer ? { issue, answer, keywords } : null
          })
          .filter(
            (item): item is { issue: string; answer: string; keywords: string[] } => item !== null,
          )
      : [],
    steps: stepsRaw.map((step, index) => normalizeStep(step, index, source.url)),
    palette:
      typeof raw.palette === 'object' && raw.palette !== null
        ? {
            start:
              typeof (raw.palette as Record<string, unknown>).start === 'string'
                ? String((raw.palette as Record<string, unknown>).start)
                : '#FFE0B2',
            end:
              typeof (raw.palette as Record<string, unknown>).end === 'string'
                ? String((raw.palette as Record<string, unknown>).end)
                : '#FFCC80',
          }
        : {
            start: '#FFE0B2',
            end: '#FFCC80',
          },
  }
}

function splitIntoSentences(value: string): string[] {
  return value
    .split(/[。！？!?\n]/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 6)
}

function isLikelyCookingStepSentence(line: string): boolean {
  const trimmed = line.trim()
  if (!trimmed || trimmed.length < 6) {
    return false
  }

  if (
    /^(标签|分类|相关|推荐|分享|更多|点击|主页|合集|标题|作者|时长|分P|站内信息|结构化标题|结构化简介|发布时间)[:：]/.test(
      trimmed,
    )
  ) {
    return false
  }

  if (
    /(探店|手把手教你|合集|临近失传|显示屏|相关视频|视频作者|作者简介|视频播放量|点赞数|收藏人数|转发人数|_哔哩哔哩|\|)/.test(
      trimmed,
    )
  ) {
    return false
  }

  const actionVerbPattern =
    /(洗|切|焯|煮|炖|炒|炸|蒸|拌|腌|下锅|翻炒|翻匀|收汁|装盘|调味|改刀|备菜|处理|清洗|焯水|煸|爆香|熬|卤|炝|勾芡|浸泡|冲洗|煎|煸炒|回锅)/
  const cuePattern = /(大火|小火|中火|金黄|焦香|酥脆|软嫩|入味|定型|收浓|冒泡|上色|断生|熟透)/

  return actionVerbPattern.test(trimmed) || cuePattern.test(trimmed)
}

function normalizeContentLinesForStepMining(source: FetchableSource): string[] {
  const rawLines = [source.description, source.content]
    .filter(Boolean)
    .flatMap((block) => block.split(/\n+/))
    .map((line) => line.trim())
    .filter((line) => line.length >= 6)

  return rawLines.filter((line) => isLikelyCookingStepSentence(line))
}

function extractLikelyStepSentences(source: FetchableSource): string[] {
  const transcriptCandidates = splitIntoSentences(source.transcript)
  const contentCandidates = normalizeContentLinesForStepMining(source)
  const candidates =
    source.sourceType === 'video' && !source.transcript
      ? contentCandidates
      : [...transcriptCandidates, ...contentCandidates]

  const goodMatches = candidates.filter(isLikelyCookingStepSentence)
  if (goodMatches.length > 0) {
    return goodMatches.slice(0, 8)
  }

  return []
}

function extractIngredientHints(
  source: FetchableSource,
  evidence?: RecipeEvidence,
): Array<{ name: string; amount: string }> {
  if (evidence && evidence.ingredients.length > 0) {
    return evidence.ingredients.slice(0, 12).map((item) => ({
      name: item.name,
      amount: item.amount,
    }))
  }

  const joinedText = [source.title, source.description, source.content, source.transcript].join(' ')
  const candidates = [
    '鸡蛋',
    '番茄',
    '西红柿',
    '大肠',
    '猪大肠',
    '葱',
    '姜',
    '蒜',
    '辣椒',
    '盐',
    '糖',
    '酱油',
    '料酒',
    '食用油',
    '淀粉',
    '醋',
  ]

  const next = candidates
    .filter((item) => joinedText.includes(item))
    .slice(0, 8)
    .map((item) => ({ name: item, amount: '适量' }))

  return next.length > 0 ? next : [{ name: '请根据原视频补充食材', amount: '适量' }]
}

function buildFallbackSteps(source: FetchableSource, evidence?: RecipeEvidence): Step[] {
  if (evidence && evidence.timeline.length >= 4) {
    return evidence.timeline.slice(0, 10).map((step, index, array) => ({
      title: step.title || `步骤 ${index + 1}`,
      instruction: step.action,
      detail: [step.detail, evidence.criticalTips[index] ?? '']
        .filter(Boolean)
        .join('。')
        .slice(0, 220),
      durationMinutes: step.durationMinutes,
      sensoryCue: step.sensoryCue,
      checkpoints: [
        '动作顺序与原视频保持一致',
        step.sensoryCue || '观察当前状态是否接近视频里的效果',
        '确认这一小步到位再进入下一步',
      ],
      commonMistakes:
        evidence.commonMistakes.length > 0
          ? evidence.commonMistakes.slice(0, 2)
          : ['动作过快，关键状态还没到位就往下做', '只看时间，不看食材状态'],
      demoFrames: [
        `步骤 ${index + 1}：${step.title || '按视频继续操作'}`.slice(0, 24),
        step.action.slice(0, 24),
        (step.sensoryCue || '状态到位再继续').slice(0, 24),
      ],
      voiceover: `${step.action}。${step.sensoryCue || '观察状态变化，差不多了再继续。'}`.slice(
        0,
        120,
      ),
      video: {
        url: source.url,
        caption: `原始攻略链接${array.length > 1 ? ` · 第 ${index + 1} 步参考` : ''}`,
        creditLabel: source.sourceType === 'video' ? '视频来源' : '文章来源',
        creditUrl: source.url,
      },
    }))
  }

  const sentences =
    !evidence && source.sourceType === 'video'
      ? []
      : extractLikelyStepSentences(source)

  const buckets = [
    {
      title: '先准备食材和调料',
      fallbackInstruction: '先把主要食材、调料和工具备齐，再开始处理。',
      fallbackDetail: '这是根据链接内容自动整理出的草稿步骤，建议一边看原视频一边核对。',
      fallbackCue: '台面上需要的食材和工具已经齐全，不用中途临时找东西。',
    },
    {
      title: '处理主食材',
      fallbackInstruction: '按原攻略的顺序完成主食材清洗、改刀或预处理。',
      fallbackDetail: '先把最影响口感和卫生的处理步骤做扎实，再进入烹饪阶段。',
      fallbackCue: '食材形状、大小和状态已经接近可以下锅的要求。',
    },
    {
      title: '开始下锅烹饪',
      fallbackInstruction: '按照视频里的火候和顺序下锅翻炒或炖煮。',
      fallbackDetail: '观察颜色、香味和汁水变化，不要只盯着时间。',
      fallbackCue: '锅里状态从生涩逐渐转向香味稳定、颜色均匀。',
    },
    {
      title: '调整味道与火候',
      fallbackInstruction: '根据原攻略补调味，继续把这一步做到位。',
      fallbackDetail: '如果状态还没到位，优先调整火力和节奏，再决定是否补调料。',
      fallbackCue: '香味更集中，汁水或表面状态开始接近成品描述。',
    },
    {
      title: '收汁或装盘',
      fallbackInstruction: '确认味道和熟度后收尾，按原攻略完成装盘。',
      fallbackDetail: '最后一步的目标是把状态停在最好吃的瞬间，不要拖到过火。',
      fallbackCue: '外观和香味已经稳定，锅里没有继续明显变化的必要。',
    },
  ]

  return buckets.map((bucket, index) => {
    const evidenceStep = evidence?.timeline[index]
    const sentence = evidenceStep?.action || sentences[index] || ''
    const voice = sentence || bucket.fallbackInstruction
    const detailParts = [
      evidenceStep?.detail,
      sentence ? `原始链接里提到了这一步：${sentence}` : '',
      !sentence ? bucket.fallbackDetail : '',
      evidence?.criticalTips[index] ?? '',
    ].filter(Boolean)
    const commonMistakes =
      evidence?.commonMistakes.length && index < 2
        ? evidence.commonMistakes.slice(0, 2)
        : ['只看时间，不看锅里状态', '节奏过快，上一小步没到位就进入下一步']

    return {
      title: evidenceStep?.title || bucket.title,
      instruction: sentence || bucket.fallbackInstruction,
      detail: detailParts.join('。').slice(0, 240),
      durationMinutes:
        evidenceStep?.durationMinutes ??
        (index === 0 ? 4 : index === buckets.length - 1 ? 3 : 5),
      sensoryCue: evidenceStep?.sensoryCue || bucket.fallbackCue,
      checkpoints: [
        '这一步的动作顺序和原链接大体一致',
        '食材状态比上一步更接近成品',
        '没有明显糊锅、过生或过火',
      ],
      commonMistakes,
      demoFrames: [
        `先看清这一步：${evidenceStep?.title || bucket.title}`,
        sentence || bucket.fallbackInstruction,
        (evidenceStep?.sensoryCue || '确认状态差不多了再继续').slice(0, 24),
      ],
      voiceover: `${voice}。如果你拿不准，就对照原视频继续确认这一步。`,
      video: {
        url: source.url,
        caption: '原始攻略链接',
        creditLabel: source.sourceType === 'video' ? '视频来源' : '文章来源',
        creditUrl: source.url,
      },
    }
  })
}

function buildFallbackRecipeDraft(source: FetchableSource, evidence?: RecipeEvidence): Recipe {
  const description =
    evidence?.summary ||
    source.description ||
    splitIntoSentences(source.content)[0] ||
    '这是根据外部攻略链接自动整理出的菜谱草稿。'
  const title = source.title.replace(/_哔哩哔哩.*$/i, '').replace(/- 抖音.*$/i, '').trim() || '导入菜谱草稿'
  const tags = normalizeStringArray(
    splitIntoSentences(source.content)
      .flatMap((sentence) => sentence.match(/[\u4e00-\u9fa5]{2,8}/g) ?? [])
      .slice(0, 6),
    [],
  )

  return {
    id: `imported-${randomUUID()}`,
    title: evidence?.dishName || title,
    subtitle: '由链接内容自动整理出的基础草稿',
    scene: source.sourceType === 'video' ? '根据视频攻略生成' : '根据文章攻略生成',
    difficulty: '轻松进阶',
    duration:
      evidence && evidence.timeline.length > 0
        ? Math.max(20, evidence.timeline.reduce((total, step) => total + step.durationMinutes, 0))
        : 25,
    servings: 2,
    highlight:
      evidence && evidence.keyTechniques.length > 0
        ? `已优先保留这些关键做法：${evidence.keyTechniques.slice(0, 3).join('、')}`
        : '即使大模型超时，也能先生成一版可继续编辑和跟做的菜谱草稿。',
    riskNote: '当前是基础草稿版，建议对照原链接再次确认食材、火候和关键顺序。',
    description,
    tags: tags.length > 0 ? tags : ['导入菜谱', source.sourceType === 'video' ? '视频草稿' : '文章草稿'],
    searchTokens: [title, '导入', '草稿', ...tags].filter(Boolean),
    tools: evidence?.tools.length ? evidence.tools.slice(0, 8) : ['锅', '刀', '案板', '碗'],
    ingredients: extractIngredientHints(source, evidence),
    substitutions: [
      {
        ingredient: '部分调料',
        replacement: '根据原链接灵活调整',
        tip: '当前草稿没有完全提取出所有克数和替代方案，建议按原视频补充。',
      },
    ],
    rescueTips:
      evidence && evidence.rescueTips.length > 0
        ? evidence.rescueTips.map((item) => ({
            issue: item.issue,
            keywords: item.keywords ?? [],
            answer: item.answer,
          }))
        : [
            {
              issue: '状态和原视频不一样怎么办',
              keywords: ['不一样', '状态不对', '不像视频'],
              answer:
                '先放慢节奏，对照原链接确认食材大小、火力和顺序，优先让当前状态接近视频画面，再决定是否继续。',
            },
            {
              issue: '调味拿不准怎么办',
              keywords: ['调味', '咸淡', '味道不对'],
              answer: '这版是基础草稿，建议先少量调味，边尝边补，不要一次加太多。',
            },
          ],
    steps: buildFallbackSteps(source, evidence),
    palette: {
      start: '#FFE0B2',
      end: '#FFCC80',
    },
  }
}

export async function importRecipeFromUrl(url: string): Promise<{
  recipe: Recipe
  source: FetchableSource
  generationMode?: 'deepseek' | 'fallback-draft'
}> {
  const apiKey = process.env.DEEPSEEK_API_KEY?.trim()
  if (!apiKey) {
    throw new Error('当前未配置大模型密钥，暂时无法从链接生成菜谱。')
  }

  const source = await fetchSourceFromUrl(url)
  let evidence: RecipeEvidence | null = null
  let sourceWithNotes = source

  try {
    evidence = await extractRecipeEvidence(apiKey, source)
    sourceWithNotes = {
      ...sourceWithNotes,
      extractionNotes: [...sourceWithNotes.extractionNotes, '已通过大模型先提炼视频/文章证据，再生成最终攻略。'],
      mediaSignals: [
        ...sourceWithNotes.mediaSignals,
        ...(evidence.timeline.length > 0 ? ['结构化步骤证据'] : []),
        ...(evidence.ingredients.length > 0 ? ['结构化食材证据'] : []),
      ],
    }
  } catch (error) {
    sourceWithNotes = {
      ...sourceWithNotes,
      extractionNotes: [
        ...sourceWithNotes.extractionNotes,
        error instanceof Error
          ? `做菜证据提炼失败，已直接尝试生成攻略：${error.message}`
          : '做菜证据提炼失败，已直接尝试生成攻略。',
      ],
    }
  }

  try {
    const parsed = await callDeepSeekJson(
      apiKey,
      [
        {
          role: 'system',
          content: buildImportSystemPrompt(),
        },
        {
          role: 'user',
          content: evidence
            ? buildImportUserPromptWithEvidence(sourceWithNotes, evidence)
            : buildImportUserPrompt(sourceWithNotes),
        },
      ],
      4200,
    )
    const recipe = normalizeImportedRecipe(parsed, sourceWithNotes)

    return {
      recipe,
      source: sourceWithNotes,
      generationMode: 'deepseek',
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return {
        recipe: buildFallbackRecipeDraft(sourceWithNotes, evidence ?? undefined),
        source: {
          ...sourceWithNotes,
          extractionNotes: [
            ...sourceWithNotes.extractionNotes,
            evidence
              ? '最终菜谱生成超时，已回退到基于结构化证据的草稿生成。'
              : '大模型生成超时，已回退到基础草稿生成。',
          ],
        },
        generationMode: 'fallback-draft',
      }
    }

    return {
      recipe: buildFallbackRecipeDraft(sourceWithNotes, evidence ?? undefined),
      source: {
        ...sourceWithNotes,
        extractionNotes: [
          ...sourceWithNotes.extractionNotes,
          error instanceof Error
            ? `大模型生成失败，已回退到${evidence ? '结构化证据草稿' : '基础草稿'}：${error.message}`
            : `大模型生成失败，已回退到${evidence ? '结构化证据草稿' : '基础草稿'}。`,
        ],
      },
      generationMode: 'fallback-draft',
    }
  }
}
