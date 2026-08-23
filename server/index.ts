import 'dotenv/config'
import { existsSync } from 'node:fs'
import { createServer } from 'node:http'
import path from 'node:path'
import { Readable } from 'node:stream'
import express from 'express'
import { getUserByToken, registerOrLoginUser, revokeAuthToken } from './auth.js'
import type { AuthUser } from './auth.js'
import { getAiRuntimeInfo, getKitchenCoachReply } from './ai.js'
import { analyzeDemoVideo } from './demoAnalyze.js'
import { getDemoCoachReply } from './demoCoach.js'
import { analyzeLocalVideoUpload } from './localVideoAnalyze.js'
import { createDatabase, databaseFilePath } from './database.js'
import { importRecipeFromUrl } from './importer.js'
import { getPublicUploadRoot } from './videoProcessing.js'
import { createVoiceServices } from './voiceServer.js'
import {
  createPrepPlan,
  getCookingHistory,
  getRecommendations,
  getRecipeById,
  listRecipes,
  recordCookingCompletion,
  saveImportedRecipe,
  saveUserRecipe,
  updateRecipeVisibility,
} from './repository.js'
import type { CookingContext, Difficulty, Recipe } from '../src/types.js'

const port = Number(process.env.PORT ?? 8787)
const host = process.env.HOST ?? '0.0.0.0'
const app = express()
const db = createDatabase()

function getBearerToken(request: express.Request): string | null {
  const authorization = request.headers.authorization
  if (!authorization?.startsWith('Bearer ')) {
    return null
  }

  const token = authorization.slice('Bearer '.length).trim()
  return token || null
}

function getRequestUser(request: express.Request): AuthUser | null {
  const token = getBearerToken(request)
  return token ? getUserByToken(db, token) : null
}

function getRequestUserId(request: express.Request): string | null {
  const user = getRequestUser(request)
  if (user) {
    return user.id
  }

  const headerValue = request.headers['x-kitchen-user-id']
  const userId = Array.isArray(headerValue) ? headerValue[0] : headerValue
  return typeof userId === 'string' && userId.trim() ? userId.trim().slice(0, 120) : null
}

function requireRequestUser(request: express.Request, response: express.Response): AuthUser | null {
  const user = getRequestUser(request)
  if (!user) {
    response.status(401).json({ message: '请先登录。' })
    return null
  }

  return user
}

function parseCookingContext(value: unknown): CookingContext | null {
  if (!value || typeof value !== 'object') return null
  const context = value as Record<string, unknown>
  const currentStep = context.currentStep && typeof context.currentStep === 'object'
    ? context.currentStep as Record<string, unknown>
    : null
  if (
    typeof context.recipeName !== 'string'
    || !currentStep
    || typeof currentStep.index !== 'number'
    || typeof currentStep.total !== 'number'
    || typeof currentStep.title !== 'string'
    || typeof currentStep.instruction !== 'string'
  ) return null

  const timerRecord = context.timer && typeof context.timer === 'object'
    ? context.timer as Record<string, unknown>
    : null
  const timer = timerRecord
    && typeof timerRecord.remainingSeconds === 'number'
    && typeof timerRecord.running === 'boolean'
    ? {
        remainingSeconds: Math.max(0, Math.min(86_400, timerRecord.remainingSeconds)),
        running: timerRecord.running,
      }
    : null
  const strings = (input: unknown, max: number) => Array.isArray(input)
    ? input.filter((item): item is string => typeof item === 'string').slice(0, max)
    : []
  const conversation = Array.isArray(context.conversation)
    ? context.conversation
        .map((item) => {
          if (!item || typeof item !== 'object') return null
          const turn = item as Record<string, unknown>
          return (turn.role === 'user' || turn.role === 'assistant') && typeof turn.content === 'string'
            ? { role: turn.role, content: turn.content.slice(0, 600) }
            : null
        })
        .filter((item): item is { role: 'user' | 'assistant'; content: string } => item !== null)
        .slice(-2)
    : []

  return {
    recipeName: context.recipeName.slice(0, 80),
    currentStep: {
      index: Math.max(0, Math.round(currentStep.index)),
      total: Math.max(1, Math.round(currentStep.total)),
      title: currentStep.title.slice(0, 80),
      instruction: currentStep.instruction.slice(0, 400),
    },
    timer,
    missingIngredients: strings(context.missingIngredients, 10).map((item) => item.slice(0, 30)),
    safetyNotes: strings(context.safetyNotes, 5).map((item) => item.slice(0, 80)),
    conversation,
  }
}

const voiceServices = createVoiceServices({ getUser: getRequestUser })

function createUserRecipeFromPayload(payload: unknown, ownerUserId: string): Recipe {
  const record = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {}
  const title = typeof record.title === 'string' && record.title.trim() ? record.title.trim() : '我的新菜谱'
  const description = typeof record.description === 'string' && record.description.trim()
    ? record.description.trim()
    : '由用户手动创建的菜谱。'
  const servings = typeof record.servings === 'number' && Number.isFinite(record.servings)
    ? Math.max(1, Math.min(12, Math.round(record.servings)))
    : 2
  const difficulty: Difficulty =
    record.difficulty === '轻松进阶' || record.difficulty === '周末进阶' || record.difficulty === '零失败'
      ? record.difficulty
      : '零失败'
  const ingredients = Array.isArray(record.ingredients)
    ? record.ingredients
        .map((item) => {
          const ingredient = item && typeof item === 'object' ? item as Record<string, unknown> : {}
          const name = typeof ingredient.name === 'string' ? ingredient.name.trim() : ''
          const amount = typeof ingredient.amount === 'string' ? ingredient.amount.trim() : ''
          return name ? { name, amount: amount || '约 100 克' } : null
        })
        .filter((item): item is { name: string; amount: string } => item !== null)
    : []
  const steps = Array.isArray(record.steps)
    ? record.steps
        .map((item, index) => {
          const step = item && typeof item === 'object' ? item as Record<string, unknown> : {}
          const title = typeof step.title === 'string' && step.title.trim()
            ? step.title.trim()
            : `第 ${index + 1} 步`
          const instruction = typeof step.instruction === 'string' && step.instruction.trim()
            ? step.instruction.trim()
            : title
          return {
            title,
            instruction,
            detail: typeof step.detail === 'string' && step.detail.trim() ? step.detail.trim() : instruction,
            durationMinutes:
              typeof step.durationMinutes === 'number' && Number.isFinite(step.durationMinutes)
                ? Math.max(1, Math.round(step.durationMinutes))
                : 3,
            sensoryCue: typeof step.sensoryCue === 'string' && step.sensoryCue.trim()
              ? step.sensoryCue.trim()
              : '观察状态稳定后再进入下一步。',
            checkpoints: ['确认这一步已经完成'],
            commonMistakes: ['不要着急跳到下一步'],
            demoFrames: [title, instruction.slice(0, 24) || title, '完成后再继续'] as [string, string, string],
            voiceover: `${title}。${instruction}`,
          }
        })
        .filter((step) => step.instruction.trim())
    : []

  if (ingredients.length === 0) {
    throw new Error('至少需要填写 1 个食材。')
  }

  if (steps.length === 0) {
    throw new Error('至少需要填写 1 个步骤。')
  }

  return {
    id: `user-${ownerUserId.slice(0, 8)}-${Date.now()}`,
    title,
    subtitle: typeof record.subtitle === 'string' && record.subtitle.trim()
      ? record.subtitle.trim()
      : '自己创建的菜谱',
    scene: typeof record.scene === 'string' && record.scene.trim() ? record.scene.trim() : '自定义做饭任务',
    difficulty,
    duration: steps.reduce((sum, step) => sum + step.durationMinutes, 0),
    servings,
    highlight: typeof record.highlight === 'string' && record.highlight.trim()
      ? record.highlight.trim()
      : '这是你自己整理的做饭流程。',
    riskNote: typeof record.riskNote === 'string' && record.riskNote.trim()
      ? record.riskNote.trim()
      : '第一次做建议边看步骤边确认状态。',
    description,
    tags: Array.isArray(record.tags)
      ? record.tags.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).slice(0, 6)
      : ['自制菜谱'],
    searchTokens: [title, ...ingredients.map((ingredient) => ingredient.name)],
    tools: Array.isArray(record.tools)
      ? record.tools.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).slice(0, 8)
      : ['锅', '碗', '铲子'],
    ingredients,
    substitutions: [],
    rescueTips: [],
    steps,
    palette: {
      start: '#fed7aa',
      end: '#fb923c',
    },
    visibility: 'private',
    sourceType: 'user',
    ownerUserId,
  }
}

app.use((request, response, next) => {
  const origin = typeof request.headers.origin === 'string' ? request.headers.origin : '*'

  response.header('Access-Control-Allow-Origin', origin)
  response.header('Vary', 'Origin')
  response.header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  response.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  response.header('Access-Control-Allow-Private-Network', 'true')

  if (request.method === 'OPTIONS') {
    response.sendStatus(204)
    return
  }

  next()
})

app.use(express.json())
app.use('/demo-uploads', express.static(getPublicUploadRoot()))

app.get('/api/health', (_request, response) => {
  response.json({
    status: 'ok',
    databaseFilePath,
    ai: getAiRuntimeInfo(),
    voice: {
      wakeWord: '小白小白',
      kwsModelBundled: false,
      asrConfigured: Boolean(process.env.DOUBAO_ASR_API_KEY?.trim()
        || (process.env.DOUBAO_SPEECH_APP_ID?.trim() && process.env.DOUBAO_SPEECH_ACCESS_TOKEN?.trim())),
      ttsConfigured: Boolean(process.env.DOUBAO_SPEECH_APP_ID?.trim()
        && process.env.DOUBAO_SPEECH_ACCESS_TOKEN?.trim()),
    },
    timestamp: new Date().toISOString(),
  })
})

app.post('/api/demo/analyze-video', async (_request, response) => {
  const result = await analyzeDemoVideo()
  response.json(result)
})

app.post(
  '/api/demo/analyze-local-video',
  express.raw({ type: () => true, limit: '500mb' }),
  async (request, response) => {
    const contentType = request.headers['content-type']
    if (typeof contentType !== 'string' || !contentType.includes('multipart/form-data')) {
      response.status(400).json({ message: '请使用 FormData 上传本地视频。' })
      return
    }

    const hostHeader = request.headers.host ?? `${host}:${port}`
    const publicBaseUrl = `${request.protocol}://${hostHeader}`

    try {
      const result = await analyzeLocalVideoUpload({
        contentType,
        body: Buffer.isBuffer(request.body) ? request.body : Buffer.from([]),
        publicBaseUrl,
      })
      response.json(result)
    } catch (error) {
      response.status(400).json({
        message: error instanceof Error ? error.message : '本地视频解析失败。',
      })
    }
  },
)

app.post('/api/auth/login', (request, response) => {
  const identifier = request.body?.identifier
  const password = request.body?.password

  if (typeof identifier !== 'string' || !identifier.trim()) {
    response.status(400).json({ message: 'identifier 是必填项。' })
    return
  }

  if (typeof password !== 'string' || password.length < 4) {
    response.status(400).json({ message: '密码至少需要 4 位。' })
    return
  }

  try {
    const result = registerOrLoginUser(db, identifier, password)
    response.status(result.isNewUser ? 201 : 200).json(result)
  } catch (error) {
    response.status(401).json({
      message: error instanceof Error ? error.message : '登录失败。',
    })
  }
})

app.get('/api/auth/me', (request, response) => {
  const user = getRequestUser(request)
  response.json({ user })
})

app.post('/api/auth/logout', (request, response) => {
  const token = getBearerToken(request)
  if (token) {
    revokeAuthToken(db, token)
  }

  response.json({ status: 'ok' })
})

app.get('/api/recipes', (request, response) => {
  const userId = getRequestUserId(request)
  const query = typeof request.query.query === 'string' ? request.query.query : undefined
  const difficulty =
    typeof request.query.difficulty === 'string'
      ? request.query.difficulty
      : undefined
  const timeLimitParam =
    typeof request.query.timeLimit === 'string'
      ? Number(request.query.timeLimit)
      : undefined

  const recipes = listRecipes(
    db,
    {
      query,
      difficulty:
        difficulty === '全部' || difficulty === '零失败' || difficulty === '轻松进阶' || difficulty === '周末进阶'
          ? difficulty
          : undefined,
      timeLimit:
        timeLimitParam && Number.isFinite(timeLimitParam) ? timeLimitParam : undefined,
    },
    userId,
  )

  response.json(recipes)
})

app.get('/api/recipes/:recipeId', (request, response) => {
  const recipe = getRecipeById(db, request.params.recipeId, getRequestUserId(request))
  if (!recipe) {
    response.status(404).json({ message: '菜谱不存在。' })
    return
  }

  response.json(recipe)
})

app.post('/api/recipes', (request, response) => {
  const user = requireRequestUser(request, response)
  if (!user) {
    return
  }

  try {
    const recipe = createUserRecipeFromPayload(request.body, user.id)
    const savedRecipe = saveUserRecipe(db, recipe, user.id, 'private')
    response.status(201).json(savedRecipe)
  } catch (error) {
    response.status(400).json({
      message: error instanceof Error ? error.message : '创建菜谱失败。',
    })
  }
})

app.post('/api/recipes/:recipeId/visibility', (request, response) => {
  const user = requireRequestUser(request, response)
  if (!user) {
    return
  }

  const visibility = request.body?.visibility
  if (visibility !== 'public' && visibility !== 'private') {
    response.status(400).json({ message: 'visibility 必须是 public 或 private。' })
    return
  }

  const recipe = updateRecipeVisibility(db, request.params.recipeId, user.id, visibility)
  if (!recipe) {
    response.status(404).json({ message: '菜谱不存在，或你没有权限修改。' })
    return
  }

  response.json(recipe)
})

app.post('/api/recipes/:recipeId/prep-plan', (request, response) => {
  const recipeId = request.params.recipeId
  const requestedServings = Number(request.body?.servings ?? 1)
  const missingIngredients = Array.isArray(request.body?.missingIngredients)
    ? request.body.missingIngredients
        .map((item: unknown) => {
          if (!item || typeof item !== 'object') {
            return null
          }

          const record = item as { name?: unknown; amount?: unknown }
          if (typeof record.name !== 'string' || !record.name.trim()) {
            return null
          }

          return {
            name: record.name.trim(),
            amount: typeof record.amount === 'string' ? record.amount.trim() : '',
          }
        })
        .filter((item: { name: string; amount: string } | null): item is { name: string; amount: string } => item !== null)
    : []

  if (!Number.isFinite(requestedServings) || requestedServings < 1) {
    response.status(400).json({ message: 'servings 必须是大于 0 的数字。' })
    return
  }

  const plan = createPrepPlan(
    db,
    recipeId,
    requestedServings,
    getRequestUserId(request),
    missingIngredients,
  )

  if (!plan) {
    response.status(404).json({ message: '菜谱不存在或当前用户无权访问。' })
    return
  }

  response.json(plan)
})

app.get('/api/history', (request, response) => {
  response.json(getCookingHistory(db, getRequestUserId(request)))
})

app.post('/api/history', (request, response) => {
  const recipeId = request.body?.recipeId

  if (typeof recipeId !== 'string' || !recipeId.trim()) {
    response.status(400).json({ message: 'recipeId 是必填项。' })
    return
  }

  const recipe = getRecipeById(db, recipeId, getRequestUserId(request))
  if (!recipe) {
    response.status(404).json({ message: '要记录的菜谱不存在。' })
    return
  }

  const entry = recordCookingCompletion(db, recipeId, getRequestUserId(request))
  response.status(201).json(entry)
})

app.get('/api/recommendations', (request, response) => {
  const userId = getRequestUserId(request)
  const excludeRecipeId =
    typeof request.query.excludeRecipeId === 'string'
      ? request.query.excludeRecipeId
      : undefined

  response.json(getRecommendations(db, excludeRecipeId, userId))
})

app.post('/api/voice/session-ticket', voiceServices.sessionTicket)
app.post('/api/voice/tts', (request, response) => void voiceServices.tts(request, response))

app.get('/api/media/proxy', async (request, response) => {
  const rawUrl = typeof request.query.url === 'string' ? request.query.url : ''
  const referer = typeof request.query.referer === 'string' ? request.query.referer : rawUrl

  let targetUrl: URL
  try {
    targetUrl = new URL(rawUrl)
  } catch {
    response.status(400).json({ message: 'url 参数不合法。' })
    return
  }

  if (targetUrl.protocol !== 'http:' && targetUrl.protocol !== 'https:') {
    response.status(400).json({ message: '只允许代理 HTTP/HTTPS 媒体。' })
    return
  }

  const upstreamHeaders: Record<string, string> = {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36',
    Accept: '*/*',
    Referer: referer || rawUrl,
  }
  const range = request.headers.range
  if (typeof range === 'string') {
    upstreamHeaders.Range = range
  }

  try {
    const upstream = await fetch(targetUrl, {
      headers: upstreamHeaders,
      redirect: 'follow',
    })

    response.status(upstream.status)
    const passthroughHeaders = [
      'content-type',
      'content-length',
      'content-range',
      'accept-ranges',
      'last-modified',
      'etag',
      'cache-control',
    ]
    for (const header of passthroughHeaders) {
      const value = upstream.headers.get(header)
      if (value) {
        response.setHeader(header, value)
      }
    }
    response.setHeader('Access-Control-Allow-Origin', '*')

    if (!upstream.body) {
      response.end()
      return
    }

    Readable.fromWeb(upstream.body as Parameters<typeof Readable.fromWeb>[0]).pipe(response)
  } catch (error) {
    response.status(502).json({
      message: error instanceof Error ? `媒体代理失败：${error.message}` : '媒体代理失败。',
    })
  }
})

app.post('/api/imports/from-link', async (request, response) => {
  const user = requireRequestUser(request, response)
  if (!user) {
    return
  }

  const url = request.body?.url

  if (typeof url !== 'string' || !url.trim()) {
    response.status(400).json({ message: 'url 是必填项。' })
    return
  }

  try {
    const imported = await importRecipeFromUrl(url.trim())
    const savedRecipe = saveImportedRecipe(db, imported.recipe, user.id)

    response.status(201).json({
      recipe: savedRecipe,
      generationMode: imported.generationMode ?? 'deepseek',
      source: {
        url: imported.source.url,
        title: imported.source.title,
        sourceType: imported.source.sourceType,
      },
    })
  } catch (error) {
    response.status(500).json({
      message:
        error instanceof Error
          ? error.message
          : '链接导入失败，请稍后重试。',
    })
  }
})

app.post('/api/imports/analyze', async (request, response) => {
  const user = requireRequestUser(request, response)
  if (!user) {
    return
  }

  const url = request.body?.url
  const sourceType = request.body?.sourceType

  if (typeof url !== 'string' || !url.trim()) {
    response.status(400).json({ message: 'url 是必填项。' })
    return
  }

  if (sourceType !== 'video' && sourceType !== 'document') {
    response.status(400).json({ message: 'sourceType 必须是 video 或 document。' })
    return
  }

  try {
    const imported = await importRecipeFromUrl(url.trim())
    const savedRecipe = saveImportedRecipe(db, imported.recipe, user.id)

    response.status(201).json({
      status: 'ok',
      message: `已根据${sourceType === 'video' ? '视频' : '文档'}链接生成菜谱：${savedRecipe.title}`,
      importedRecipes: [
        {
          id: savedRecipe.id,
          title: savedRecipe.title,
          sourceLabel: sourceType === 'video' ? '视频链接' : '文档链接',
          summary: savedRecipe.description || savedRecipe.highlight,
          tags: savedRecipe.tags.slice(0, 4),
          recipeId: savedRecipe.id,
        },
      ],
      generationMode: imported.generationMode ?? 'deepseek',
      source: {
        url: imported.source.url,
        title: imported.source.title,
        sourceType: imported.source.sourceType,
      },
    })
  } catch (error) {
    response.status(500).json({
      message:
        error instanceof Error
          ? error.message
          : '链接识别失败，请稍后重试。',
    })
  }
})

app.post('/api/assistant/reply', async (request, response) => {
  const question = request.body?.question
  const context = parseCookingContext(request.body?.context)
  if (typeof question !== 'string' || !question.trim() || question.length > 300 || !context) {
    response.status(400).json({ message: 'context 或 question 不合法。' })
    return
  }
  const controller = new AbortController()
  request.once('aborted', () => controller.abort())
  response.once('close', () => controller.abort())
  const result = await getKitchenCoachReply(context, question.trim(), controller.signal)
  response.json(result)
})

app.post('/api/demo/coach-reply', async (request, response) => {
  const currentStep = request.body?.currentStep
  const userQuestion = request.body?.userQuestion
  if (!currentStep || typeof currentStep !== 'object'
    || typeof userQuestion !== 'string' || !userQuestion.trim()) {
    response.status(400).json({ message: 'currentStep 和 userQuestion 是必填项。' })
    return
  }
  const step = currentStep as Record<string, unknown>
  response.json(await getDemoCoachReply({
    recipeName: typeof request.body?.recipeName === 'string' ? request.body.recipeName : '当前菜谱',
    currentStep: {
      title: typeof step.title === 'string' ? step.title : '当前步骤',
      instruction: typeof step.instruction === 'string' ? step.instruction : '',
      tips: Array.isArray(step.tips) ? step.tips.filter((item): item is string => typeof item === 'string') : [],
      commonMistakes: Array.isArray(step.commonMistakes)
        ? step.commonMistakes.filter((item): item is string => typeof item === 'string')
        : [],
    },
    userQuestion,
  }))
})

const distDir = path.join(process.cwd(), 'dist')
if (existsSync(distDir)) {
  app.use(express.static(distDir))
  app.get(/^(?!\/api).*/, (_request, response) => {
    response.sendFile(path.join(distDir, 'index.html'))
  })
}

const server = createServer(app)
voiceServices.attach(server)
server.listen(port, host, () => {
  console.log(`Kitchen server listening on http://${host}:${port}`)
})
