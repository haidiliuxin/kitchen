import 'dotenv/config'
import { existsSync } from 'node:fs'
import path from 'node:path'
import express from 'express'
import { getAiRuntimeInfo, getKitchenCoachReply } from './ai.js'
import { createDatabase, databaseFilePath } from './database.js'
import { importRecipeFromUrl } from './importer.js'
import {
  getCookingHistory,
  getRecommendations,
  getRecipeById,
  listRecipes,
  recordCookingCompletion,
  saveImportedRecipe,
} from './repository.js'

const port = Number(process.env.PORT ?? 8787)
const host = process.env.HOST ?? '0.0.0.0'
const app = express()
const db = createDatabase()
const configuredWakeWords = (process.env.VOICE_WAKE_WORDS ?? '小白下厨,小白教练')
  .split(/[,\n]/)
  .map((item) => item.trim())
  .filter(Boolean)

function normalizeSpeechText(value: string): string {
  return value.replace(/[，。！？、；：,.!?;:"'“”‘’\s]/g, '').toLowerCase()
}

function interpretVoiceTranscript(transcript: string) {
  const trimmedTranscript = transcript.trim()
  const normalizedTranscript = normalizeSpeechText(trimmedTranscript)
  const matchedWakeWord = configuredWakeWords.find((wakeWord) =>
    normalizedTranscript.includes(normalizeSpeechText(wakeWord)),
  )

  if (!matchedWakeWord) {
    return {
      activated: false,
      wakeWords: configuredWakeWords,
      transcript: trimmedTranscript,
      cleanedTranscript: '',
      matchedWakeWord: null,
    }
  }

  const matchedWakeWordNormalized = normalizeSpeechText(matchedWakeWord)
  const cleanedTranscript = trimmedTranscript
    .replace(new RegExp(matchedWakeWord, 'g'), '')
    .trim()
  const cleanedNormalizedTranscript = normalizedTranscript.replace(matchedWakeWordNormalized, '').trim()

  return {
    activated: true,
    wakeWords: configuredWakeWords,
    transcript: trimmedTranscript,
    cleanedTranscript: cleanedTranscript || cleanedNormalizedTranscript,
    matchedWakeWord,
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

app.get('/api/health', (_request, response) => {
  response.json({
    status: 'ok',
    databaseFilePath,
    ai: getAiRuntimeInfo(),
    voice: {
      wakeWords: configuredWakeWords,
    },
    timestamp: new Date().toISOString(),
  })
})

app.get('/api/recipes', (request, response) => {
  const query = typeof request.query.query === 'string' ? request.query.query : undefined
  const difficulty =
    typeof request.query.difficulty === 'string'
      ? request.query.difficulty
      : undefined
  const timeLimitParam =
    typeof request.query.timeLimit === 'string'
      ? Number(request.query.timeLimit)
      : undefined

  const recipes = listRecipes(db, {
    query,
    difficulty:
      difficulty === '全部' || difficulty === '零失败' || difficulty === '轻松进阶' || difficulty === '周末进阶'
        ? difficulty
        : undefined,
    timeLimit:
      timeLimitParam && Number.isFinite(timeLimitParam) ? timeLimitParam : undefined,
  })

  response.json(recipes)
})

app.get('/api/recipes/:recipeId', (request, response) => {
  const recipe = getRecipeById(db, request.params.recipeId)
  if (!recipe) {
    response.status(404).json({ message: '菜谱不存在。' })
    return
  }

  response.json(recipe)
})

app.get('/api/history', (_request, response) => {
  response.json(getCookingHistory(db))
})

app.post('/api/history', (request, response) => {
  const recipeId = request.body?.recipeId

  if (typeof recipeId !== 'string' || !recipeId.trim()) {
    response.status(400).json({ message: 'recipeId 是必填项。' })
    return
  }

  const recipe = getRecipeById(db, recipeId)
  if (!recipe) {
    response.status(404).json({ message: '要记录的菜谱不存在。' })
    return
  }

  const entry = recordCookingCompletion(db, recipeId)
  response.status(201).json(entry)
})

app.get('/api/recommendations', (request, response) => {
  const excludeRecipeId =
    typeof request.query.excludeRecipeId === 'string'
      ? request.query.excludeRecipeId
      : undefined

  response.json(getRecommendations(db, excludeRecipeId))
})

app.post('/api/voice/interpret', (request, response) => {
  const transcript = request.body?.transcript

  if (typeof transcript !== 'string') {
    response.status(400).json({ message: 'transcript 是必填项。' })
    return
  }

  response.json(interpretVoiceTranscript(transcript))
})

app.post('/api/imports/from-link', async (request, response) => {
  const url = request.body?.url

  if (typeof url !== 'string' || !url.trim()) {
    response.status(400).json({ message: 'url 是必填项。' })
    return
  }

  try {
    const imported = await importRecipeFromUrl(url.trim())
    const savedRecipe = saveImportedRecipe(db, imported.recipe)

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
    const savedRecipe = saveImportedRecipe(db, imported.recipe)

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
  const recipeId = request.body?.recipeId
  const stepIndex = request.body?.stepIndex
  const question = request.body?.question

  if (typeof recipeId !== 'string' || typeof question !== 'string') {
    response.status(400).json({ message: 'recipeId 和 question 是必填项。' })
    return
  }

  if (typeof stepIndex !== 'number' || !Number.isInteger(stepIndex)) {
    response.status(400).json({ message: 'stepIndex 必须是整数。' })
    return
  }

  const recipe = getRecipeById(db, recipeId)
  if (!recipe) {
    response.status(404).json({ message: '菜谱不存在。' })
    return
  }

  const step = recipe.steps[stepIndex]
  if (!step) {
    response.status(400).json({ message: '步骤不存在。' })
    return
  }

  const result = await getKitchenCoachReply({
    recipe,
    step,
    stepIndex,
    question,
  })

  response.json(result)
})

const distDir = path.join(process.cwd(), 'dist')
if (existsSync(distDir)) {
  app.use(express.static(distDir))
  app.get(/^(?!\/api).*/, (_request, response) => {
    response.sendFile(path.join(distDir, 'index.html'))
  })
}

app.listen(port, host, () => {
  console.log(`Kitchen server listening on http://${host}:${port}`)
})
