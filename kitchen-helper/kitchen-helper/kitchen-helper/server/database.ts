import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { recipes } from '../src/data/recipes.js'

const recipeSeedVersion = '2026-03-31-v2'

export const databaseFilePath = path.join(process.cwd(), 'data', 'kitchen.sqlite')

function createTables(db: DatabaseSync): void {
  db.exec(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS app_metadata (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS recipes (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      subtitle TEXT NOT NULL,
      scene TEXT NOT NULL,
      difficulty TEXT NOT NULL,
      duration INTEGER NOT NULL,
      servings INTEGER NOT NULL,
      highlight TEXT NOT NULL,
      risk_note TEXT NOT NULL,
      description TEXT NOT NULL,
      palette_start TEXT NOT NULL,
      palette_end TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS recipe_tags (
      recipe_id TEXT NOT NULL,
      sort_order INTEGER NOT NULL,
      value TEXT NOT NULL,
      PRIMARY KEY (recipe_id, sort_order),
      FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS recipe_search_tokens (
      recipe_id TEXT NOT NULL,
      sort_order INTEGER NOT NULL,
      value TEXT NOT NULL,
      PRIMARY KEY (recipe_id, sort_order),
      FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS recipe_tools (
      recipe_id TEXT NOT NULL,
      sort_order INTEGER NOT NULL,
      value TEXT NOT NULL,
      PRIMARY KEY (recipe_id, sort_order),
      FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS ingredients (
      recipe_id TEXT NOT NULL,
      sort_order INTEGER NOT NULL,
      name TEXT NOT NULL,
      amount TEXT NOT NULL,
      PRIMARY KEY (recipe_id, sort_order),
      FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS substitutions (
      recipe_id TEXT NOT NULL,
      sort_order INTEGER NOT NULL,
      ingredient TEXT NOT NULL,
      replacement TEXT NOT NULL,
      tip TEXT NOT NULL,
      PRIMARY KEY (recipe_id, sort_order),
      FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS rescue_tips (
      recipe_id TEXT NOT NULL,
      sort_order INTEGER NOT NULL,
      issue TEXT NOT NULL,
      keywords_json TEXT NOT NULL,
      answer TEXT NOT NULL,
      PRIMARY KEY (recipe_id, sort_order),
      FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS steps (
      recipe_id TEXT NOT NULL,
      step_index INTEGER NOT NULL,
      title TEXT NOT NULL,
      instruction TEXT NOT NULL,
      detail TEXT NOT NULL,
      duration_minutes INTEGER NOT NULL,
      sensory_cue TEXT NOT NULL,
      voiceover TEXT NOT NULL,
      PRIMARY KEY (recipe_id, step_index),
      FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS step_checkpoints (
      recipe_id TEXT NOT NULL,
      step_index INTEGER NOT NULL,
      sort_order INTEGER NOT NULL,
      value TEXT NOT NULL,
      PRIMARY KEY (recipe_id, step_index, sort_order),
      FOREIGN KEY (recipe_id, step_index)
        REFERENCES steps(recipe_id, step_index)
        ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS step_common_mistakes (
      recipe_id TEXT NOT NULL,
      step_index INTEGER NOT NULL,
      sort_order INTEGER NOT NULL,
      value TEXT NOT NULL,
      PRIMARY KEY (recipe_id, step_index, sort_order),
      FOREIGN KEY (recipe_id, step_index)
        REFERENCES steps(recipe_id, step_index)
        ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS step_demo_frames (
      recipe_id TEXT NOT NULL,
      step_index INTEGER NOT NULL,
      sort_order INTEGER NOT NULL,
      value TEXT NOT NULL,
      PRIMARY KEY (recipe_id, step_index, sort_order),
      FOREIGN KEY (recipe_id, step_index)
        REFERENCES steps(recipe_id, step_index)
        ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS step_videos (
      recipe_id TEXT NOT NULL,
      step_index INTEGER NOT NULL,
      video_url TEXT NOT NULL,
      poster_url TEXT,
      caption TEXT NOT NULL,
      credit_label TEXT,
      credit_url TEXT,
      PRIMARY KEY (recipe_id, step_index),
      FOREIGN KEY (recipe_id, step_index)
        REFERENCES steps(recipe_id, step_index)
        ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS cooking_history (
      id TEXT PRIMARY KEY,
      recipe_id TEXT NOT NULL,
      finished_at TEXT NOT NULL,
      FOREIGN KEY (recipe_id) REFERENCES recipes(id)
    );

    CREATE INDEX IF NOT EXISTS idx_cooking_history_finished_at
      ON cooking_history (finished_at DESC);
  `)
}

function getMetadata(db: DatabaseSync, key: string): string | null {
  const row = db
    .prepare('SELECT value FROM app_metadata WHERE key = ?')
    .get(key) as { value: string } | undefined

  return row?.value ?? null
}

function setMetadata(db: DatabaseSync, key: string, value: string): void {
  db.prepare(`
    INSERT INTO app_metadata (key, value)
    VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(key, value)
}

function seedRecipes(db: DatabaseSync): void {
  const currentVersion = getMetadata(db, 'recipe_seed_version')
  if (currentVersion === recipeSeedVersion) {
    return
  }

  db.exec('BEGIN')

  try {
    db.exec('DELETE FROM recipes')

    const insertRecipe = db.prepare(`
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
        palette_end
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    const insertTag = db.prepare(`
      INSERT INTO recipe_tags (recipe_id, sort_order, value)
      VALUES (?, ?, ?)
    `)
    const insertSearchToken = db.prepare(`
      INSERT INTO recipe_search_tokens (recipe_id, sort_order, value)
      VALUES (?, ?, ?)
    `)
    const insertTool = db.prepare(`
      INSERT INTO recipe_tools (recipe_id, sort_order, value)
      VALUES (?, ?, ?)
    `)
    const insertIngredient = db.prepare(`
      INSERT INTO ingredients (recipe_id, sort_order, name, amount)
      VALUES (?, ?, ?, ?)
    `)
    const insertSubstitution = db.prepare(`
      INSERT INTO substitutions (recipe_id, sort_order, ingredient, replacement, tip)
      VALUES (?, ?, ?, ?, ?)
    `)
    const insertRescueTip = db.prepare(`
      INSERT INTO rescue_tips (recipe_id, sort_order, issue, keywords_json, answer)
      VALUES (?, ?, ?, ?, ?)
    `)
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
        credit_url
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `)

    for (const recipe of recipes) {
      insertRecipe.run(
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
      )

      recipe.tags.forEach((tag, index) => {
        insertTag.run(recipe.id, index, tag)
      })
      recipe.searchTokens.forEach((token, index) => {
        insertSearchToken.run(recipe.id, index, token)
      })
      recipe.tools.forEach((tool, index) => {
        insertTool.run(recipe.id, index, tool)
      })
      recipe.ingredients.forEach((ingredient, index) => {
        insertIngredient.run(recipe.id, index, ingredient.name, ingredient.amount)
      })
      recipe.substitutions.forEach((substitution, index) => {
        insertSubstitution.run(
          recipe.id,
          index,
          substitution.ingredient,
          substitution.replacement,
          substitution.tip,
        )
      })
      recipe.rescueTips.forEach((tip, index) => {
        insertRescueTip.run(
          recipe.id,
          index,
          tip.issue,
          JSON.stringify(tip.keywords),
          tip.answer,
        )
      })
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
          )
        }
      })
    }

    setMetadata(db, 'recipe_seed_version', recipeSeedVersion)
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}

export function createDatabase(): DatabaseSync {
  mkdirSync(path.dirname(databaseFilePath), { recursive: true })

  const db = new DatabaseSync(databaseFilePath)
  createTables(db)
  seedRecipes(db)
  return db
}
