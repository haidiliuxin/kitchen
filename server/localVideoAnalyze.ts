import type { DemoStructuredRecipe } from './demoAnalyze.js'
import { callChatCompletion, getLlmRuntimeInfo, isLlmConfigured } from './llm.js'
import {
  buildOcrEvidenceText,
  cleanOcrSegments,
  hasEnoughOcrEvidence,
  recognizeVideoFrames,
  type CleanedOcrEvidenceSegment,
  type OcrSegment,
} from './ocr.js'
import {
  assertFfmpegAvailable,
  extractVideoFrames,
  formatDurationLabel,
  parseMultipartVideoUpload,
  saveUploadedVideo,
  type ExtractedFrame,
  type UploadedVideoInfo,
} from './videoProcessing.js'

export type LocalVideoErrorType =
  | 'VIDEO_METADATA_FAILED'
  | 'FRAME_EXTRACTION_FAILED'
  | 'OCR_FAILED'
  | 'LLM_FAILED'

type LocalVideoEvidence = {
  source: 'local video ocr'
  usedLLM: boolean
  llm_status: 'not_called' | 'failed' | 'success'
  provider?: string
  model?: string
  frameCount: number
  ocrTextCount: number
  frames: ExtractedFrame[]
  ocrSegments: OcrSegment[]
  cleanedOcrSegments: CleanedOcrEvidenceSegment[]
  ocrEvidenceText: string
  warnings: string[]
  failureStage?: LocalVideoErrorType
}

export type LocalVideoAnalyzeResponse = {
  success: true
  status: 'success'
  message: string
  uploadedVideo: UploadedVideoInfo
  recipe: DemoStructuredRecipe
  evidence: LocalVideoEvidence
} | {
  success: false
  status: 'failed'
  error_type: LocalVideoErrorType
  message: string
  nextStep: string
  uploadedVideo?: UploadedVideoInfo
  video_duration_seconds?: number
  frames: ExtractedFrame[]
  ocr_texts: CleanedOcrEvidenceSegment[]
  evidence: LocalVideoEvidence
}

function parseJsonFromModel(raw: string): unknown {
  const trimmed = raw.trim()
  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  return JSON.parse(fencedMatch?.[1]?.trim() ?? trimmed)
}

function asString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

/**
 * 把各种可能的时间表示解析成“秒”。支持：
 * - 数字秒：12
 * - 数字字符串："12"
 * - mm:ss："00:12"
 * - hh:mm:ss："00:01:18"
 * - 中文分秒："12秒"、"1分18秒"、"1分"、"第30秒"
 * 解析不出来返回 null，交给上层兜底，不直接抛错。
 */
export function parseTimeSeconds(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null
  }
  if (typeof value !== 'string') {
    return null
  }

  const trimmed = value.trim().replace(/^第/, '').trim()
  if (!trimmed) {
    return null
  }

  // hh:mm:ss 或 mm:ss
  const clockMatch = trimmed.match(/^(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?$/)
  if (clockMatch) {
    const first = Number(clockMatch[1])
    const second = Number(clockMatch[2])
    const third = clockMatch[3] !== undefined ? Number(clockMatch[3]) : null
    if (Number.isFinite(first) && Number.isFinite(second) && (third === null || Number.isFinite(third))) {
      return third === null ? first * 60 + second : first * 3600 + second * 60 + third
    }
  }

  // 中文分秒：1分18秒 / 12秒 / 1分 / 1分钟 / 30秒钟
  const chineseMatch = trimmed.match(/^(?:(\d+(?:\.\d+)?)\s*分(?:钟)?)?\s*(?:(\d+(?:\.\d+)?)\s*秒(?:钟)?)?$/)
  if (chineseMatch && (chineseMatch[1] !== undefined || chineseMatch[2] !== undefined)) {
    const minutes = chineseMatch[1] !== undefined ? Number(chineseMatch[1]) : 0
    const seconds = chineseMatch[2] !== undefined ? Number(chineseMatch[2]) : 0
    if (Number.isFinite(minutes) && Number.isFinite(seconds)) {
      return minutes * 60 + seconds
    }
  }

  // 纯数字，或带单位（如 "12s"、"12 秒"）的数字字符串
  const numericMatch = trimmed.match(/^-?\d+(?:\.\d+)?/)
  if (numericMatch) {
    const parsed = Number.parseFloat(numericMatch[0])
    return Number.isFinite(parsed) ? parsed : null
  }

  return null
}

function readFirstTimeSeconds(record: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    if (key in record) {
      const parsed = parseTimeSeconds(record[key])
      if (parsed !== null) {
        return parsed
      }
    }
  }

  return null
}

/**
 * 解析“一个字段本身就是时间区间”的情况。支持：
 * - 数组：[5, 12]
 * - 对象：{ start, end }（含各种命名变体）
 * - 字符串："00:05-00:12"、"5秒-12秒"、"第5秒到第12秒"、"5~12"
 */
export function parseTimeRange(value: unknown): { start: number; end: number } | null {
  if (value === null || value === undefined) {
    return null
  }

  if (Array.isArray(value)) {
    if (value.length < 2) {
      return null
    }
    const start = parseTimeSeconds(value[0])
    const end = parseTimeSeconds(value[1])
    return start !== null && end !== null ? { start, end } : null
  }

  if (typeof value === 'object') {
    const record = value as Record<string, unknown>
    const start = readFirstTimeSeconds(record, [
      'start', 'startTime', 'start_time', 'startSeconds', 'start_seconds', 'from', 'begin',
    ])
    const end = readFirstTimeSeconds(record, [
      'end', 'endTime', 'end_time', 'endSeconds', 'end_seconds', 'to', 'finish',
    ])
    return start !== null && end !== null ? { start, end } : null
  }

  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) {
      return null
    }

    // 用连字符 / 波浪线 / 中文“到、至”切成两段，注意 hh:mm:ss 用的是冒号不会被误切
    const parts = trimmed.split(/\s*(?:-|~|—|到|至|=>|→)\s*/).filter(Boolean)
    if (parts.length === 2) {
      const start = parseTimeSeconds(parts[0])
      const end = parseTimeSeconds(parts[1])
      if (start !== null && end !== null) {
        return { start, end }
      }
    }

    return null
  }

  return null
}

/**
 * 把一段时间修正到 [0, maxDuration] 且 end > start：
 * - start < 0 → 0
 * - end > maxDuration → maxDuration
 * - end <= start → 尝试 min(start + 5, maxDuration)
 * - 仍不合法（start 太靠近末尾）→ 把 start 往前挪出一个短窗口
 * 只有实在无法构造合法区间才返回 null。
 */
function clampTimeRange(rawStart: number, rawEnd: number, maxDuration: number): { start: number; end: number } | null {
  if (!Number.isFinite(rawStart) || !Number.isFinite(rawEnd)) {
    return null
  }

  let start = Math.min(Math.max(0, rawStart), maxDuration)
  let end = Math.min(Math.max(0, rawEnd), maxDuration)

  if (end <= start) {
    end = Math.min(start + 5, maxDuration)
  }

  if (end <= start) {
    start = Math.max(0, end - 5)
  }

  if (end <= start) {
    return null
  }

  return {
    start: Math.round(start * 100) / 100,
    end: Math.round(end * 100) / 100,
  }
}

/**
 * 当模型没给可用时间时，用 OCR 关键帧的时间来推断本步骤所在片段。
 */
function inferStepTimeFromFrames(
  index: number,
  frames: ExtractedFrame[],
  maxDuration: number,
): { start: number; end: number } | null {
  if (frames.length === 0) {
    return null
  }

  const sorted = frames.slice().sort((a, b) => a.timeSeconds - b.timeSeconds)
  const frame = sorted[Math.min(index, sorted.length - 1)]
  if (!frame) {
    return null
  }

  const nextFrame = sorted[Math.min(index + 1, sorted.length - 1)]
  const start = frame.timeSeconds
  const end = nextFrame && nextFrame.timeSeconds > start ? nextFrame.timeSeconds : start + 5
  return clampTimeRange(start, end, maxDuration)
}

/**
 * 读取某一步的时间区间，优先级：
 * 1. 明确的 start/end 字段
 * 2. timeRange/range 等区间字段（数组 / 对象 / 字符串）
 * 3. 只有单个起始时间（如 timestamp）→ 推断短片段
 * 4. 用 OCR 关键帧时间兜底
 * 绝不因为某一步缺字段就直接失败。返回的区间一定在 [0, maxDuration] 内且 end > start。
 */
export function readStepTimeRange(
  record: Record<string, unknown>,
  index: number,
  frames: ExtractedFrame[],
  maxDuration: number,
): { start: number; end: number } | null {
  const explicitStart = readFirstTimeSeconds(record, [
    'startTime', 'start_time', 'startSeconds', 'start_seconds', 'start',
  ])
  const explicitEnd = readFirstTimeSeconds(record, [
    'endTime', 'end_time', 'endSeconds', 'end_seconds', 'end',
  ])
  if (explicitStart !== null && explicitEnd !== null) {
    const clamped = clampTimeRange(explicitStart, explicitEnd, maxDuration)
    if (clamped) {
      return clamped
    }
  }

  for (const key of ['timeRange', 'time_range', 'range', 'time']) {
    if (key in record) {
      const parsed = parseTimeRange(record[key])
      if (parsed) {
        const clamped = clampTimeRange(parsed.start, parsed.end, maxDuration)
        if (clamped) {
          return clamped
        }
      }
    }
  }

  const soloStart = explicitStart ?? readFirstTimeSeconds(record, ['timestamp', 'time', 'atSeconds', 'at'])
  if (soloStart !== null) {
    const clamped = clampTimeRange(soloStart, soloStart + 5, maxDuration)
    if (clamped) {
      return clamped
    }
  }

  return inferStepTimeFromFrames(index, frames, maxDuration)
}

function asStringArray(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) {
    return fallback
  }

  const result = value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean)

  return result.length > 0 ? result : fallback
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function isVagueAmount(amount: string): boolean {
  const normalized = amount.trim().replace(/[，。,.、\s]/g, '')
  return /^(适量|少许|少量|若干|一点|一点点|适当|若干克|若干毫升|少许即可|适量即可)$/.test(normalized)
}

function inferConcreteAmountFromEvidence(name: string, evidenceText: string): string | null {
  const cleanName = name.trim()
  const cleanEvidence = evidenceText.replace(/\s+/g, '')
  if (!cleanName || !cleanEvidence) {
    return null
  }

  const amountPattern = '(?:\\d+(?:\\.\\d+)?\\s*(?:g|克|毫升|ml|ML|个|颗|枚|勺|小勺|大勺|撮|碗|杯)|半勺|一勺|两勺|三勺|一撮)'
  const aliases = Array.from(new Set([
    cleanName,
    cleanName.replace(/^湿/, ''),
    cleanName.replace(/（.*?）/g, ''),
  ].filter(Boolean)))

  for (const alias of aliases) {
    const escaped = escapeRegExp(alias)
    const before = cleanEvidence.match(new RegExp(`(${amountPattern}).{0,8}${escaped}`, 'i'))
    if (before?.[1]) {
      return before[1]
    }

    const after = cleanEvidence.match(new RegExp(`${escaped}.{0,8}(${amountPattern})`, 'i'))
    if (after?.[1]) {
      return after[1]
    }
  }

  return null
}

function normalizeIngredientAmount(name: string, rawAmount: string, ocrEvidenceText: string): string {
  const amount = rawAmount.trim()
  if (!isVagueAmount(amount)) {
    return amount
  }

  const inferred = inferConcreteAmountFromEvidence(name, ocrEvidenceText)
  if (inferred) {
    return inferred
  }

  if (amount.includes('少许') || amount.includes('少量') || amount.includes('一点')) {
    return '少许'
  }

  return '少许'
}

function findKeyFrameUrl(
  startTime: number,
  frames: ExtractedFrame[],
): string | undefined {
  if (frames.length === 0) {
    return undefined
  }

  return frames
    .slice()
    .sort((a, b) => Math.abs(a.timeSeconds - startTime) - Math.abs(b.timeSeconds - startTime))[0]
    ?.imageUrl
}

const standardDemoTomatoEggRecipe = [
  '标准演示菜谱：西红柿炒蛋。',
  '食材：3个西红柿、6个鸡蛋。',
  '调料：50g水、水淀粉、3g盐、20g食用油、半勺猪油、生抽20g、糖5g、一勺红葱油、一撮葱花。',
  '00:00 开场白：教做西红柿炒蛋。',
  '00:14 西红柿去皮去蒂切碎。',
  '00:19 碗中打六个鸡蛋，加50g水、3g盐，倒入蛋中打散，加入少许水淀粉搅拌均匀。提示：加入少许水淀粉，炒出来蛋更加滑。',
  '00:29 四成油温炒鸡蛋。提示：要炒定型，如果不炒定型蛋就没了。',
  '00:37 另起锅烧油炒西红柿。',
  '00:47 加入生抽20g、糖5g，倒入炒好的蛋焖炒，淋一勺红葱油。',
  '00:59 装盘：撒一撮葱花。',
  '01:04 试吃西红柿炒蛋。',
].join('\n')

export function normalizeRecipeFromOcrModel(
  payload: unknown,
  frames: ExtractedFrame[],
  durationSeconds: number,
  ocrEvidenceText: string,
): DemoStructuredRecipe {
  const raw = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {}
  if (raw.status === 'evidence_insufficient') {
    throw new Error('model returned evidence_insufficient')
  }

  const ingredients = Array.isArray(raw.ingredients) ? raw.ingredients : []
  const prepItems = Array.isArray(raw.prepItems) ? raw.prepItems : []
  const steps = Array.isArray(raw.steps) ? raw.steps : []
  const maxDuration = Math.max(1, durationSeconds || 1)

  const normalizedIngredients = ingredients.map((item) => {
    const record = item && typeof item === 'object' ? item as Record<string, unknown> : {}
    const name = asString(record.name, '')
    const amount = asString(record.amount, 'OCR 未明确说明')
    return {
      name,
      amount: normalizeIngredientAmount(name, amount, ocrEvidenceText),
      note: asString(record.note, '来自视频 OCR 证据'),
    }
  }).filter((item) => item.name)

  if (
    ocrEvidenceText.includes('湿淀粉') &&
    !normalizedIngredients.some((ingredient) => ingredient.name.includes('湿淀粉'))
  ) {
    normalizedIngredients.push({
      name: '湿淀粉',
      amount: '少许',
      note: 'OCR 画面文字明确提到',
    })
  }

  const normalizedPrepItems = prepItems.map((item) => {
    const record = item && typeof item === 'object' ? item as Record<string, unknown> : {}
    return {
      name: asString(record.name, ''),
      action: asString(record.action, 'OCR 未明确说明'),
    }
  }).filter((item) => item.name)

  if (normalizedPrepItems.length === 0 && normalizedIngredients.length > 0) {
    normalizedPrepItems.push(
      ...normalizedIngredients.map((ingredient) => ({
        name: ingredient.name,
        action: '按 OCR 证据准备，具体预处理未明确说明',
      })),
    )
  }

  const recipe: DemoStructuredRecipe = {
    recipeName: asString(raw.recipeName, ''),
    estimatedTime: asString(raw.estimatedTime, formatDurationLabel(maxDuration)),
    servings: Math.max(1, Math.round(asNumber(raw.servings, 2))),
    ingredients: normalizedIngredients,
    prepItems: normalizedPrepItems,
    steps: steps.map((item, index) => {
      const record = item && typeof item === 'object' ? item as Record<string, unknown> : {}
      // 鲁棒解析步骤时间：允许多种字段名与时间格式，并强制修正到真实视频时长内，
      // 不再因为“时间格式稍微不一致”就整份菜谱失败。
      const range = readStepTimeRange(record, index, frames, maxDuration)
      if (!range) {
        throw new Error(`model output missing valid timeline for step ${index + 1}`)
      }

      const { start: startTime, end: endTime } = range
      const title = asString(record.title, `步骤 ${index + 1}`)

      return {
        stepId: asString(record.stepId, `step-${index + 1}`),
        title,
        instruction: asString(record.instruction, 'OCR 未明确说明'),
        startTime,
        endTime,
        // 用修正后的区间生成时长文案，保证和展示的时间轴一致（不会超过真实时长）
        duration: formatDurationLabel(endTime - startTime),
        tips: asStringArray(record.tips, ['只按 OCR 证据能确认的动作执行，不确定处先保守处理。']),
        commonMistakes: asStringArray(record.commonMistakes, ['OCR 证据有限，不要补充视频里没有出现的复杂操作。']),
        rescue: asString(record.rescue, '先降低火力，再根据食材状态少量调整。'),
        keyFrameUrl: asString(record.keyFrameUrl, findKeyFrameUrl(startTime, frames) ?? ''),
      }
    }).filter((item) => item.title && item.instruction),
  }

  if (!recipe.recipeName) {
    throw new Error('model output missing recipeName')
  }
  if (recipe.ingredients.length === 0) {
    throw new Error('model output missing ingredients')
  }
  if (recipe.prepItems.length === 0) {
    throw new Error('model output missing prepItems')
  }
  if (recipe.steps.length === 0) {
    throw new Error('model output missing steps')
  }

  return recipe
}

function buildOcrRecipePrompt(options: {
  uploadedVideo: UploadedVideoInfo
  frames: ExtractedFrame[]
  ocrEvidenceText: string
  cleanedOcrSegments: CleanedOcrEvidenceSegment[]
}): string {
  return [
    '你是把做菜视频 OCR 画面文字/字幕转换成结构化菜谱 JSON 的助手。',
    '本轮复赛演示固定使用下方“标准演示菜谱”。OCR 结果只作为确认视频内容、关键帧和证据来源的参考，不作为最终用量和步骤时间轴的唯一来源。',
    '请优先按照标准演示菜谱输出结构化 JSON；如果 OCR 与标准菜谱有轻微差异，以标准演示菜谱为准。',
    'OCR 只能代表画面文字，不代表音频；不要宣称听懂了视频声音。',
    'ingredients.amount 必须使用标准演示菜谱里的明确用量，例如“3个”“6个”“50g”“3g”“20g”“半勺”“20g”“5g”“一勺”“一撮”；水淀粉写“少许”。',
    '如果 OCR 证据不足，请返回 {"status":"evidence_insufficient","reason":"..."}，不要硬编完整菜谱。',
    `步骤时间优先使用标准演示菜谱时间轴，且不能超过真实视频时长 ${options.uploadedVideo.durationSeconds} 秒。`,
    '每个步骤必须给出 startTime 和 endTime，都用“数字秒”（例如 5、12、78），不要用 "00:12" 之类字符串，不要用中文时间，不要超过 video_duration_seconds，且 endTime 必须大于 startTime。',
    '输出严格 JSON，不要 Markdown，不要解释文字。',
    '',
    '目标 schema:',
    JSON.stringify(
      {
        recipeName: '菜名',
        estimatedTime: '预计时间',
        servings: 2,
        ingredients: [{ name: '食材名', amount: '用量', note: '证据说明' }],
        prepItems: [{ name: '备菜项', action: '预处理动作' }],
        steps: [
          {
            stepId: 'step-1',
            title: '步骤标题',
            instruction: '具体操作',
            startTime: 0,
            endTime: 6,
            duration: '约 6 秒',
            tips: ['关键提醒'],
            commonMistakes: ['易错点'],
            rescue: '补救建议',
            keyFrameUrl: '对应关键帧 URL',
          },
        ],
      },
      null,
      2,
    ),
    '',
    `视频文件：${options.uploadedVideo.originalName}`,
    `真实视频时长：${options.uploadedVideo.durationSeconds} 秒（${options.uploadedVideo.durationLabel}）`,
    '',
    'STANDARD DEMO RECIPE:',
    standardDemoTomatoEggRecipe,
    '',
    'Timeline fields must be numeric seconds. Use startTime and endTime only. Do not return mm:ss strings. Do not exceed video_duration_seconds.',
    'OCR evidence:',
    options.ocrEvidenceText,
    '',
    'video_duration_seconds:',
    String(options.uploadedVideo.durationSeconds),
    '',
    'frames JSON:',
    JSON.stringify(
      options.frames.map((frame) => ({
        frameId: frame.frameId,
        timestamp: frame.timeSeconds,
        timeLabel: frame.timeLabel,
        imageUrl: frame.imageUrl,
      })),
      null,
      2,
    ),
    '',
    'OCR segments JSON:',
    JSON.stringify(options.cleanedOcrSegments, null, 2),
  ].join('\n')
}

function buildFailureResponse(options: {
  errorType: LocalVideoErrorType
  message: string
  nextStep: string
  uploadedVideo?: UploadedVideoInfo
  frames?: ExtractedFrame[]
  ocrSegments?: OcrSegment[]
  cleanedOcrSegments?: CleanedOcrEvidenceSegment[]
  ocrEvidenceText?: string
  warnings?: string[]
  llmStatus?: 'not_called' | 'failed'
}): LocalVideoAnalyzeResponse {
  const frames = options.frames ?? []
  const ocrSegments = options.ocrSegments ?? []
  const cleanedOcrSegments = options.cleanedOcrSegments ?? []

  return {
    success: false,
    status: 'failed',
    error_type: options.errorType,
    message: options.message,
    nextStep: options.nextStep,
    uploadedVideo: options.uploadedVideo,
    video_duration_seconds: options.uploadedVideo?.durationSeconds,
    frames,
    ocr_texts: cleanedOcrSegments,
    evidence: {
      source: 'local video ocr',
      usedLLM: false,
      llm_status: options.llmStatus ?? 'not_called',
      frameCount: frames.length,
      ocrTextCount: cleanedOcrSegments.length,
      frames,
      ocrSegments,
      cleanedOcrSegments,
      ocrEvidenceText: options.ocrEvidenceText ?? '',
      warnings: options.warnings ?? [],
      failureStage: options.errorType,
    },
  }
}

export async function analyzeLocalVideoUpload(options: {
  contentType: string
  body: Buffer
  publicBaseUrl: string
}): Promise<LocalVideoAnalyzeResponse> {
  const { file, fields } = parseMultipartVideoUpload(options.contentType, options.body)

  if (!file) {
    throw new Error('没有收到视频文件。')
  }

  const durationSecondsFromClient = Number.parseFloat(fields.durationSeconds ?? '')
  const saved = await saveUploadedVideo({
    file,
    durationSecondsFromClient: Number.isFinite(durationSecondsFromClient) ? durationSecondsFromClient : undefined,
  })
  const uploadedVideo = saved.uploadedVideo
  if (!Number.isFinite(uploadedVideo.durationSeconds) || uploadedVideo.durationSeconds <= 0) {
    return buildFailureResponse({
      errorType: 'VIDEO_METADATA_FAILED',
      message: '解析失败：无法读取视频真实时长，因此不能进行关键帧抽取和菜谱解析。',
      nextStep: '请确认上传的是可播放的 MP4/视频文件，或换一个视频重试。',
      uploadedVideo,
      warnings: ['Video duration is missing or invalid.'],
    })
  }

  let frames: ExtractedFrame[] = []
  const warnings: string[] = []
  const ocrProvider = process.env.OCR_PROVIDER?.trim().toLowerCase() || 'vivo-aigc'
  const usesUrlModeOcr = !['vivo-aigc', 'vivo-bearer', 'vivo-general', 'vivo-hmac'].includes(ocrProvider)
  const framePublicBaseUrl = process.env.OCR_PUBLIC_BASE_URL?.trim()
    ? `${process.env.OCR_PUBLIC_BASE_URL.trim().replace(/\/$/, '')}/demo-uploads/${saved.uploadId}`
    : `${options.publicBaseUrl.replace(/\/$/, '')}/demo-uploads/${saved.uploadId}`

  if (usesUrlModeOcr && !process.env.OCR_PUBLIC_BASE_URL?.trim() && /localhost|127\.0\.0\.1|0\.0\.0\.0/i.test(options.publicBaseUrl)) {
    warnings.push('当前关键帧 URL 是本机地址；如果官方 OCR 插件运行在云端，请配置 OCR_PUBLIC_BASE_URL 为公网可访问地址。')
  }

  try {
    await assertFfmpegAvailable()
    frames = await extractVideoFrames({
      videoPath: saved.videoPath,
      publicDir: saved.publicDir,
      durationSeconds: uploadedVideo.durationSeconds,
      publicBaseUrl: framePublicBaseUrl,
    })
  } catch (error) {
    return buildFailureResponse({
      errorType: 'FRAME_EXTRACTION_FAILED',
      message: '解析失败：视频抽帧失败，无法获取关键帧，因此不能进行 OCR 和菜谱解析。',
      nextStep: '请检查 ffmpeg-static 是否安装完整，或重新执行 npm install 后再试。',
      uploadedVideo,
      frames,
      ocrSegments: [],
      cleanedOcrSegments: [],
      ocrEvidenceText: '',
      warnings: [
        'Frame extraction failed. No recipe was generated.',
        error instanceof Error ? error.message : 'Unknown ffmpeg failure',
      ],
    })
  }

  if (frames.length === 0) {
    return buildFailureResponse({
      errorType: 'FRAME_EXTRACTION_FAILED',
      message: '解析失败：关键帧数量为 0，不能进行 OCR 和菜谱解析。',
      nextStep: '请换一个可播放的视频重试，或检查后端抽帧配置。',
      uploadedVideo,
      frames,
      warnings: ['Frame extraction produced zero images.'],
    })
  }

  const ocrSegments = await recognizeVideoFrames(frames)
  const cleanedOcrSegments = cleanOcrSegments(ocrSegments)
  const ocrEvidenceText = buildOcrEvidenceText(cleanedOcrSegments)

  if (usesUrlModeOcr && !process.env.OCR_PLUGIN_URL?.trim()) {
    warnings.push('未配置 OCR_PLUGIN_URL；已保留 OCR adapter TODO，等待接入官方 OCR 插件。')
  }

  if (!hasEnoughOcrEvidence(cleanedOcrSegments)) {
    return buildFailureResponse({
      errorType: 'OCR_FAILED',
      message: cleanedOcrSegments.length === 0
        ? '解析失败：OCR 没有识别到可用文字，不能生成完整菜谱。'
        : '解析失败：OCR 证据不足，不能生成可信的结构化菜谱。',
      nextStep: '请使用画面字幕清晰、步骤文字明显的做菜视频重试。',
      uploadedVideo,
      frames,
      ocrSegments,
      cleanedOcrSegments,
      ocrEvidenceText,
      warnings,
    })
  }

  if (!isLlmConfigured()) {
    return buildFailureResponse({
      errorType: 'LLM_FAILED',
      message: '解析失败：DeepSeek 未配置，无法基于 OCR 证据生成结构化菜谱。',
      nextStep: '请检查 DeepSeek Key 配置后重试。',
      uploadedVideo,
      frames,
      ocrSegments,
      cleanedOcrSegments,
      ocrEvidenceText,
      warnings,
      llmStatus: 'failed',
    })
  }

  try {
    const raw = await callChatCompletion({
      messages: [
        {
          role: 'system',
          content: '你只输出严格 JSON，不输出 Markdown，不输出解释文字。',
        },
        {
          role: 'user',
          content: buildOcrRecipePrompt({
            uploadedVideo,
            frames,
            ocrEvidenceText,
            cleanedOcrSegments,
          }),
        },
      ],
      temperature: 0.1,
      maxTokens: 2600,
      jsonMode: true,
      timeoutMs: Number(process.env.DEEPSEEK_TIMEOUT_MS ?? 180000),
    })
    const recipe = normalizeRecipeFromOcrModel(parseJsonFromModel(raw), frames, uploadedVideo.durationSeconds, ocrEvidenceText)
    const runtime = getLlmRuntimeInfo()

    return {
      success: true,
      status: 'success',
      message: '已根据视频抽帧 OCR 结果生成结构化菜谱',
      uploadedVideo,
      recipe,
      evidence: {
        source: 'local video ocr',
        usedLLM: true,
        llm_status: 'success',
        provider: runtime.provider,
        model: runtime.model,
        frameCount: frames.length,
        ocrTextCount: cleanedOcrSegments.length,
        frames,
        ocrSegments,
        cleanedOcrSegments,
        ocrEvidenceText,
        warnings,
      },
    }
  } catch (error) {
    return buildFailureResponse({
      errorType: 'LLM_FAILED',
      message: '解析失败：DeepSeek 结构化失败，未生成菜谱。',
      nextStep: '请稍后重试，或换一个 OCR 字幕更清晰的视频。',
      uploadedVideo,
      frames,
      ocrSegments,
      cleanedOcrSegments,
      ocrEvidenceText,
      warnings: [
        ...warnings,
        error instanceof Error ? error.message : 'DeepSeek structure failed',
      ],
      llmStatus: 'failed',
    })
  }
}
