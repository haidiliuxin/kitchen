import { randomUUID } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import type {
  CookingHistoryEntry,
  MissingIngredient,
  PrepIngredient,
  PrepPlan,
  Recipe,
  RecipeFilters,
  RecipeSourceType,
  RecipeVisibility,
} from '../src/types.js'

type RecipeRow = {
  id: string
  title: string
  subtitle: string
  scene: string
  difficulty: Recipe['difficulty']
  duration: number
  servings: number
  highlight: string
  risk_note: string
  description: string
  palette_start: string
  palette_end: string
  visibility: RecipeVisibility
  source_type: RecipeSourceType
  owner_user_id: string | null
}

type StepRow = {
  recipe_id: string
  step_index: number
  title: string
  instruction: string
  detail: string
  duration_minutes: number
  sensory_cue: string
  voiceover: string
}

type StepVideoRow = {
  video_url: string
  poster_url: string | null
  caption: string
  credit_label: string | null
  credit_url: string | null
  start_seconds: number | null
  end_seconds: number | null
}

type TextValueRow = {
  value: string
}

type RescueTipRow = {
  issue: string
  keywords_json: string
  answer: string
}

function queryTextValues(
  db: DatabaseSync,
  tableName: 'recipe_tags' | 'recipe_search_tokens' | 'recipe_tools',
  recipeId: string,
): string[] {
  const rows = db
    .prepare(
      `SELECT value FROM ${tableName} WHERE recipe_id = ? ORDER BY sort_order ASC`,
    )
    .all(recipeId) as TextValueRow[]

  return rows.map((row) => row.value)
}

function queryStepValues(
  db: DatabaseSync,
  tableName: 'step_checkpoints' | 'step_common_mistakes' | 'step_demo_frames',
  recipeId: string,
  stepIndex: number,
): string[] {
  const rows = db
    .prepare(
      `SELECT value FROM ${tableName} WHERE recipe_id = ? AND step_index = ? ORDER BY sort_order ASC`,
    )
    .all(recipeId, stepIndex) as TextValueRow[]

  return rows.map((row) => row.value)
}

function assembleRecipe(db: DatabaseSync, row: RecipeRow): Recipe {
  const ingredients = db
    .prepare(`
      SELECT name, amount
      FROM ingredients
      WHERE recipe_id = ?
      ORDER BY sort_order ASC
    `)
    .all(row.id) as Array<{ name: string; amount: string }>

  const substitutions = db
    .prepare(`
      SELECT ingredient, replacement, tip
      FROM substitutions
      WHERE recipe_id = ?
      ORDER BY sort_order ASC
    `)
    .all(row.id) as Array<{
      ingredient: string
      replacement: string
      tip: string
    }>

  const rescueTips = db
    .prepare(`
      SELECT issue, keywords_json, answer
      FROM rescue_tips
      WHERE recipe_id = ?
      ORDER BY sort_order ASC
    `)
    .all(row.id) as RescueTipRow[]

  const steps = db
    .prepare(`
      SELECT
        recipe_id,
        step_index,
        title,
        instruction,
        detail,
        duration_minutes,
        sensory_cue,
        voiceover
      FROM steps
      WHERE recipe_id = ?
      ORDER BY step_index ASC
    `)
    .all(row.id) as StepRow[]

  return {
    id: row.id,
    title: row.title,
    subtitle: row.subtitle,
    scene: row.scene,
    difficulty: row.difficulty,
    duration: row.duration,
    servings: row.servings,
    highlight: row.highlight,
    riskNote: row.risk_note,
    description: row.description,
    tags: queryTextValues(db, 'recipe_tags', row.id),
    searchTokens: queryTextValues(db, 'recipe_search_tokens', row.id),
    tools: queryTextValues(db, 'recipe_tools', row.id),
    ingredients,
    substitutions,
    rescueTips: rescueTips.map((tip) => ({
      issue: tip.issue,
      keywords: JSON.parse(tip.keywords_json) as string[],
      answer: tip.answer,
    })),
    steps: steps.map((step) => ({
      ...(function () {
        const videoRow = db
          .prepare(`
            SELECT video_url, poster_url, caption, credit_label, credit_url, start_seconds, end_seconds
            FROM step_videos
            WHERE recipe_id = ? AND step_index = ?
          `)
          .get(step.recipe_id, step.step_index) as StepVideoRow | undefined

        return {
          video: videoRow
            ? {
                url: videoRow.video_url,
                posterUrl: videoRow.poster_url ?? undefined,
                caption: videoRow.caption,
                creditLabel: videoRow.credit_label ?? undefined,
                creditUrl: videoRow.credit_url ?? undefined,
                startSeconds: videoRow.start_seconds ?? undefined,
                endSeconds: videoRow.end_seconds ?? undefined,
              }
            : undefined,
        }
      })(),
      title: step.title,
      instruction: step.instruction,
      detail: step.detail,
      durationMinutes: step.duration_minutes,
      sensoryCue: step.sensory_cue,
      checkpoints: queryStepValues(db, 'step_checkpoints', step.recipe_id, step.step_index),
      commonMistakes: queryStepValues(
        db,
        'step_common_mistakes',
        step.recipe_id,
        step.step_index,
      ),
      demoFrames: queryStepValues(
        db,
        'step_demo_frames',
        step.recipe_id,
        step.step_index,
      ) as [string, string, string],
      voiceover: step.voiceover,
    })),
    palette: {
      start: row.palette_start,
      end: row.palette_end,
    },
    visibility: row.visibility,
    sourceType: row.source_type,
    ownerUserId: row.owner_user_id,
  }
}

function matchesFilters(recipe: Recipe, filters: RecipeFilters): boolean {
  const query = filters.query?.trim().toLowerCase()
  const matchesDifficulty =
    !filters.difficulty ||
    filters.difficulty === '全部' ||
    recipe.difficulty === filters.difficulty
  const matchesTime =
    !filters.timeLimit ||
    filters.timeLimit === '全部' ||
    recipe.duration <= filters.timeLimit

  if (!matchesDifficulty || !matchesTime) {
    return false
  }

  if (!query) {
    return true
  }

  const haystack = [
    recipe.title,
    recipe.subtitle,
    recipe.scene,
    recipe.description,
    ...recipe.tags,
    ...recipe.searchTokens,
    ...recipe.ingredients.map((ingredient) => ingredient.name),
  ]
    .join(' ')
    .toLowerCase()

  return haystack.includes(query)
}

function userVisibilityWhereClause(): string {
  return `
    WHERE visibility IN ('official', 'public')
       OR (? IS NOT NULL AND owner_user_id = ?)
  `
}

export function listRecipes(
  db: DatabaseSync,
  filters: RecipeFilters = {},
  userId?: string | null,
): Recipe[] {
  const rows = db
    .prepare(`
      SELECT
        id,
        title,
        subtitle,
        scene,
        difficulty,
        duration,
        servings,
        highlight,
        risk_note,
        description,
        palette_start,
        palette_end,
        visibility,
        source_type,
        owner_user_id
      FROM recipes
      ${userVisibilityWhereClause()}
      ORDER BY duration ASC, title ASC
    `)
    .all(userId ?? null, userId ?? null) as RecipeRow[]

  return rows.map((row) => assembleRecipe(db, row)).filter((recipe) => matchesFilters(recipe, filters))
}

export function getRecipeById(
  db: DatabaseSync,
  recipeId: string,
  userId?: string | null,
): Recipe | null {
  const row = db
    .prepare(`
      SELECT
        id,
        title,
        subtitle,
        scene,
        difficulty,
        duration,
        servings,
        highlight,
        risk_note,
        description,
        palette_start,
        palette_end,
        visibility,
        source_type,
        owner_user_id
      FROM recipes
      WHERE id = ?
        AND (
          visibility IN ('official', 'public')
          OR (? IS NOT NULL AND owner_user_id = ?)
        )
    `)
    .get(recipeId, userId ?? null, userId ?? null) as RecipeRow | undefined

  if (!row) {
    return null
  }

  return assembleRecipe(db, row)
}

export function getCookingHistory(db: DatabaseSync, userId?: string | null): CookingHistoryEntry[] {
  const rows = db
    .prepare(`
      SELECT h.id, h.recipe_id, h.finished_at
      FROM cooking_history h
      JOIN recipes r ON r.id = h.recipe_id
      WHERE (? IS NULL OR h.user_id IS NULL OR h.user_id = ?)
        AND (
          r.visibility IN ('official', 'public')
          OR (? IS NOT NULL AND r.owner_user_id = ?)
        )
      ORDER BY finished_at DESC
    `)
    .all(
      userId ?? null,
      userId ?? null,
      userId ?? null,
      userId ?? null,
    ) as Array<{ id: string; recipe_id: string; finished_at: string }>

  return rows.map((row) => ({
    id: row.id,
    recipeId: row.recipe_id,
    finishedAt: row.finished_at,
  }))
}

export function recordCookingCompletion(
  db: DatabaseSync,
  recipeId: string,
  userId?: string | null,
): CookingHistoryEntry {
  const entry: CookingHistoryEntry = {
    id: randomUUID(),
    recipeId,
    finishedAt: new Date().toISOString(),
  }

  db.prepare(`
    INSERT INTO cooking_history (id, recipe_id, user_id, finished_at)
    VALUES (?, ?, ?, ?)
  `).run(entry.id, entry.recipeId, userId ?? null, entry.finishedAt)

  return entry
}

export function getRecommendations(
  db: DatabaseSync,
  excludeRecipeId: string | undefined,
  userId?: string | null,
  limit = 3,
): Recipe[] {
  const rows = db
    .prepare(`
      SELECT
        r.id,
        COUNT(h.id) AS completion_count
      FROM recipes r
      LEFT JOIN cooking_history h ON h.recipe_id = r.id
      WHERE (? IS NULL OR r.id <> ?)
        AND (
          r.visibility IN ('official', 'public')
          OR (? IS NOT NULL AND r.owner_user_id = ?)
        )
      GROUP BY r.id
      ORDER BY completion_count ASC, r.duration ASC, r.title ASC
      LIMIT ?
    `)
    .all(
      excludeRecipeId ?? null,
      excludeRecipeId ?? null,
      userId ?? null,
      userId ?? null,
      limit,
    ) as Array<{
      id: string
    }>

  return rows
    .map((row) => getRecipeById(db, row.id, userId))
    .filter((recipe): recipe is Recipe => recipe !== null)
}

export function saveImportedRecipe(
  db: DatabaseSync,
  recipe: Recipe,
  ownerUserId?: string | null,
  visibility: RecipeVisibility = 'private',
  sourceType: RecipeSourceType = 'imported',
): Recipe {
  db.exec('BEGIN')

  try {
    db.prepare(`
      INSERT INTO recipes (
        id,
        title,
        subtitle,
        scene,
        difficulty,
        duration,
        servings,
        highlight,
        risk_note,
        description,
        palette_start,
        palette_end,
        visibility,
        source_type,
        owner_user_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      recipe.id,
      recipe.title,
      recipe.subtitle,
      recipe.scene,
      recipe.difficulty,
      recipe.duration,
      recipe.servings,
      recipe.highlight,
      recipe.riskNote,
      recipe.description,
      recipe.palette.start,
      recipe.palette.end,
      visibility,
      sourceType,
      ownerUserId ?? null,
    )

    const insertTag = db.prepare(`
      INSERT INTO recipe_tags (recipe_id, sort_order, value)
      VALUES (?, ?, ?)
    `)
    recipe.tags.forEach((tag, index) => {
      insertTag.run(recipe.id, index, tag)
    })

    const insertSearchToken = db.prepare(`
      INSERT INTO recipe_search_tokens (recipe_id, sort_order, value)
      VALUES (?, ?, ?)
    `)
    recipe.searchTokens.forEach((token, index) => {
      insertSearchToken.run(recipe.id, index, token)
    })

    const insertTool = db.prepare(`
      INSERT INTO recipe_tools (recipe_id, sort_order, value)
      VALUES (?, ?, ?)
    `)
    recipe.tools.forEach((tool, index) => {
      insertTool.run(recipe.id, index, tool)
    })

    const insertIngredient = db.prepare(`
      INSERT INTO ingredients (recipe_id, sort_order, name, amount)
      VALUES (?, ?, ?, ?)
    `)
    recipe.ingredients.forEach((ingredient, index) => {
      insertIngredient.run(recipe.id, index, ingredient.name, ingredient.amount)
    })

    const insertSubstitution = db.prepare(`
      INSERT INTO substitutions (recipe_id, sort_order, ingredient, replacement, tip)
      VALUES (?, ?, ?, ?, ?)
    `)
    recipe.substitutions.forEach((substitution, index) => {
      insertSubstitution.run(
        recipe.id,
        index,
        substitution.ingredient,
        substitution.replacement,
        substitution.tip,
      )
    })

    const insertRescueTip = db.prepare(`
      INSERT INTO rescue_tips (recipe_id, sort_order, issue, keywords_json, answer)
      VALUES (?, ?, ?, ?, ?)
    `)
    recipe.rescueTips.forEach((tip, index) => {
      insertRescueTip.run(
        recipe.id,
        index,
        tip.issue,
        JSON.stringify(tip.keywords),
        tip.answer,
      )
    })

    const insertStep = db.prepare(`
      INSERT INTO steps (
        recipe_id,
        step_index,
        title,
        instruction,
        detail,
        duration_minutes,
        sensory_cue,
        voiceover
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `)
    const insertStepCheckpoint = db.prepare(`
      INSERT INTO step_checkpoints (recipe_id, step_index, sort_order, value)
      VALUES (?, ?, ?, ?)
    `)
    const insertStepMistake = db.prepare(`
      INSERT INTO step_common_mistakes (recipe_id, step_index, sort_order, value)
      VALUES (?, ?, ?, ?)
    `)
    const insertStepDemoFrame = db.prepare(`
      INSERT INTO step_demo_frames (recipe_id, step_index, sort_order, value)
      VALUES (?, ?, ?, ?)
    `)
    const insertStepVideo = db.prepare(`
      INSERT INTO step_videos (
        recipe_id,
        step_index,
        video_url,
        poster_url,
        caption,
        credit_label,
        credit_url,
        start_seconds,
        end_seconds
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    recipe.steps.forEach((step, stepIndex) => {
      insertStep.run(
        recipe.id,
        stepIndex,
        step.title,
        step.instruction,
        step.detail,
        step.durationMinutes,
        step.sensoryCue,
        step.voiceover,
      )

      step.checkpoints.forEach((value, index) => {
        insertStepCheckpoint.run(recipe.id, stepIndex, index, value)
      })
      step.commonMistakes.forEach((value, index) => {
        insertStepMistake.run(recipe.id, stepIndex, index, value)
      })
      step.demoFrames.forEach((value, index) => {
        insertStepDemoFrame.run(recipe.id, stepIndex, index, value)
      })

      if (step.video) {
        insertStepVideo.run(
          recipe.id,
          stepIndex,
          step.video.url,
          step.video.posterUrl ?? null,
          step.video.caption,
          step.video.creditLabel ?? null,
          step.video.creditUrl ?? null,
          step.video.startSeconds ?? null,
          step.video.endSeconds ?? null,
        )
      }
    })

    db.exec('COMMIT')
    return {
      ...recipe,
      visibility,
      sourceType,
      ownerUserId: ownerUserId ?? null,
    }
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}

export function saveUserRecipe(
  db: DatabaseSync,
  recipe: Recipe,
  ownerUserId: string,
  visibility: RecipeVisibility = 'private',
): Recipe {
  return saveImportedRecipe(db, recipe, ownerUserId, visibility, 'user')
}

export function updateRecipeVisibility(
  db: DatabaseSync,
  recipeId: string,
  ownerUserId: string,
  visibility: Extract<RecipeVisibility, 'public' | 'private'>,
): Recipe | null {
  const row = db
    .prepare(`
      SELECT id
      FROM recipes
      WHERE id = ?
        AND owner_user_id = ?
        AND source_type IN ('imported', 'user')
    `)
    .get(recipeId, ownerUserId) as { id: string } | undefined

  if (!row) {
    return null
  }

  db.prepare(`
    UPDATE recipes
    SET visibility = ?
    WHERE id = ?
      AND owner_user_id = ?
  `).run(visibility, recipeId, ownerUserId)

  return getRecipeById(db, recipeId, ownerUserId)
}

function scaleIngredientAmount(amount: string, multiplier: number, ingredientName = ''): string {
  const preparedAmount = isVagueAmount(amount) ? inferConcreteIngredientAmount(ingredientName) : amount
  if (!Number.isFinite(multiplier) || multiplier <= 0 || Math.abs(multiplier - 1) < 0.01) {
    return preparedAmount
  }

  const round = (value: number) => {
    const rounded = Math.round(value * 10) / 10
    return Number.isInteger(rounded) ? String(rounded) : String(rounded)
  }
  const normalized = preparedAmount
    .replace(/(\d+)\s*到\s*(\d+)/g, '$1-$2')
    .replace(/(\d+)\s*\/\s*(\d+)/g, (_match, numerator, denominator) => {
      const value = Number(numerator) / Number(denominator)
      return Number.isFinite(value) ? String(value) : _match
    })
  const scaled = normalized.replace(/(\d+(?:\.\d+)?)(?:\s*-\s*(\d+(?:\.\d+)?))?/g, (match, left, right) => {
    const first = Number(left)
    if (!Number.isFinite(first)) {
      return match
    }

    if (right) {
      const second = Number(right)
      return `${round(first * multiplier)}-${round(second * multiplier)}`
    }

    return round(first * multiplier)
  })
  const friendlyScaled = scaled.replace(
    /(\d+\.5)(\s*(?:个|根|颗|只|块|瓣))/g,
    (_match, value, unit) => `约 ${Math.ceil(Number(value))}${unit}`,
  )

  return friendlyScaled === preparedAmount ? `${preparedAmount} × ${Math.round(multiplier * 10) / 10}` : friendlyScaled
}

function isVagueAmount(value: string): boolean {
  return !value.trim() || /(适量|少许|若干|按需|随意|看情况|酌情)/.test(value)
}

function inferConcreteIngredientAmount(name: string): string {
  const normalized = name.replace(/\s+/g, '')
  const rules: Array<{ pattern: RegExp; amount: string }> = [
    { pattern: /(西瓜|冬瓜|南瓜|土豆|茄子|萝卜|莲藕|花菜|包菜|白菜|青菜|豆角|菌菇|蘑菇|黄瓜|青椒|彩椒)/, amount: '约 300 克' },
    { pattern: /(猪肉|牛肉|羊肉|鸡肉|鸡胸|鸡腿|排骨|大肠|肥肠|鱼|虾|肉片|肉丝)/, amount: '约 250 克' },
    { pattern: /(鸡蛋|鸭蛋)/, amount: '2 个' },
    { pattern: /(番茄|西红柿)/, amount: '2 个（约 300 克）' },
    { pattern: /(葱|小葱|香葱)/, amount: '2 根' },
    { pattern: /姜/, amount: '约 10 克' },
    { pattern: /蒜/, amount: '3 瓣' },
    { pattern: /(辣椒|小米辣|干辣椒)/, amount: '2 个' },
    { pattern: /(盐)/, amount: '约 2 克' },
    { pattern: /(糖|白糖)/, amount: '约 5 克' },
    { pattern: /(生抽|酱油|料酒|醋|蚝油)/, amount: '1 汤勺（约 15 毫升）' },
    { pattern: /(老抽)/, amount: '1 小勺（约 5 毫升）' },
    { pattern: /(食用油|油)/, amount: '约 20 毫升' },
    { pattern: /(淀粉)/, amount: '约 10 克' },
    { pattern: /(水|清水|高汤)/, amount: '约 100 毫升' },
  ]

  return rules.find((rule) => rule.pattern.test(normalized))?.amount ?? '约 100 克'
}

function buildShoppingQuery(missingIngredients: MissingIngredient[]): string {
  return missingIngredients
    .map((item) => `${item.name}${item.amount ? ` ${item.amount}` : ''}`.trim())
    .filter(Boolean)
    .join(' ')
}

export function createPrepPlan(
  db: DatabaseSync,
  recipeId: string,
  requestedServings: number,
  userId?: string | null,
  missingIngredients: MissingIngredient[] = [],
): PrepPlan | null {
  const recipe = getRecipeById(db, recipeId, userId)
  if (!recipe) {
    return null
  }

  const safeServings = Math.max(1, Math.min(12, Math.round(requestedServings)))
  const baseServings = Math.max(1, recipe.servings)
  const multiplier = safeServings / baseServings
  const isImported = recipe.sourceType === 'imported' || recipe.id.startsWith('imported-')
  const ingredients: PrepIngredient[] = recipe.ingredients.map((ingredient) => ({
    name: ingredient.name,
    originalAmount: ingredient.amount,
    scaledAmount: scaleIngredientAmount(ingredient.amount, multiplier, ingredient.name),
    note: isImported
      ? '视频导入菜谱已按原视频识别到的基础份量换算，建议按实际锅具和食量微调。'
      : undefined,
  }))
  const shoppingQuery = buildShoppingQuery(missingIngredients)
  const encodedQuery = encodeURIComponent(shoppingQuery || ingredients.map((item) => item.name).join(' '))

  return {
    recipeId: recipe.id,
    recipeTitle: recipe.title,
    requestedServings: safeServings,
    baseServings,
    sourceType: recipe.sourceType ?? 'official',
    ingredients,
    tools: recipe.tools,
    shoppingLinks: [
      {
        platform: 'meituan',
        label: '去美团买菜搜索缺少食材',
        url: `imeituan://www.meituan.com/search?q=${encodedQuery}`,
      },
      {
        platform: 'jd',
        label: '去京东到家搜索缺少食材',
        url: `https://search.jd.com/Search?keyword=${encodedQuery}`,
      },
      {
        platform: 'taobao',
        label: '去淘宝搜索缺少食材',
        url: `https://s.taobao.com/search?q=${encodedQuery}`,
      },
    ],
    note: isImported
      ? '这是由视频/文章生成的菜谱，食材克数会先按视频信息和目标人数换算，最终仍建议按食材大小、锅具容量和个人口味确认。'
      : '已按菜谱原始份量等比例换算。确认食材齐全后即可进入跟做模式。',
  }
}
