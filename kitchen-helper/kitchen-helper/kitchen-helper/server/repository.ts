import { randomUUID } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import type { CookingHistoryEntry, Recipe, RecipeFilters } from '../src/types.js'

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
            SELECT video_url, poster_url, caption, credit_label, credit_url
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

export function listRecipes(db: DatabaseSync, filters: RecipeFilters = {}): Recipe[] {
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
        palette_end
      FROM recipes
      ORDER BY duration ASC, title ASC
    `)
    .all() as RecipeRow[]

  return rows.map((row) => assembleRecipe(db, row)).filter((recipe) => matchesFilters(recipe, filters))
}

export function getRecipeById(db: DatabaseSync, recipeId: string): Recipe | null {
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
        palette_end
      FROM recipes
      WHERE id = ?
    `)
    .get(recipeId) as RecipeRow | undefined

  if (!row) {
    return null
  }

  return assembleRecipe(db, row)
}

export function getCookingHistory(db: DatabaseSync): CookingHistoryEntry[] {
  const rows = db
    .prepare(`
      SELECT id, recipe_id, finished_at
      FROM cooking_history
      ORDER BY finished_at DESC
    `)
    .all() as Array<{ id: string; recipe_id: string; finished_at: string }>

  return rows.map((row) => ({
    id: row.id,
    recipeId: row.recipe_id,
    finishedAt: row.finished_at,
  }))
}

export function recordCookingCompletion(
  db: DatabaseSync,
  recipeId: string,
): CookingHistoryEntry {
  const entry: CookingHistoryEntry = {
    id: randomUUID(),
    recipeId,
    finishedAt: new Date().toISOString(),
  }

  db.prepare(`
    INSERT INTO cooking_history (id, recipe_id, finished_at)
    VALUES (?, ?, ?)
  `).run(entry.id, entry.recipeId, entry.finishedAt)

  return entry
}

export function getRecommendations(
  db: DatabaseSync,
  excludeRecipeId: string | undefined,
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
      GROUP BY r.id
      ORDER BY completion_count ASC, r.duration ASC, r.title ASC
      LIMIT ?
    `)
    .all(excludeRecipeId ?? null, excludeRecipeId ?? null, limit) as Array<{
      id: string
    }>

  return rows
    .map((row) => getRecipeById(db, row.id))
    .filter((recipe): recipe is Recipe => recipe !== null)
}
