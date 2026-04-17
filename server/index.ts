import 'dotenv/config'
import { existsSync } from 'node:fs'
import path from 'node:path'
import express from 'express'
import { getAiRuntimeInfo, getKitchenCoachReply } from './ai.js'
import { createDatabase, databaseFilePath } from './database.js'
import {
  getCookingHistory,
  getRecommendations,
  getRecipeById,
  listRecipes,
  recordCookingCompletion,
} from './repository.js'

const port = Number(process.env.PORT ?? 8787)
const host = process.env.HOST ?? '0.0.0.0'
const app = express()
const db = createDatabase()

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
