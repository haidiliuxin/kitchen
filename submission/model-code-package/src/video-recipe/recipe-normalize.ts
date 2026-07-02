/**
 * Readable summary of the recipe normalization rules.
 *
 * Full implementation:
 * - localVideoAnalyze.ts normalizeRecipeFromOcrModel()
 */

import type { StructuredRecipe, VideoRecipeModelOutput } from '../llm/schemas'

export function assertStructuredRecipe(output: VideoRecipeModelOutput): StructuredRecipe {
  if ('status' in output && output.status === 'evidence_insufficient') {
    throw new Error(`evidence_insufficient: ${output.reason}`)
  }

  if (!output.recipeName) {
    throw new Error('model output missing recipeName')
  }
  if (!Array.isArray(output.ingredients) || output.ingredients.length === 0) {
    throw new Error('model output missing ingredients')
  }
  if (!Array.isArray(output.prepItems) || output.prepItems.length === 0) {
    throw new Error('model output missing prepItems')
  }
  if (!Array.isArray(output.steps) || output.steps.length === 0) {
    throw new Error('model output missing steps')
  }

  for (const step of output.steps) {
    if (step.endTime <= step.startTime) {
      throw new Error(`invalid step time range: ${step.stepId}`)
    }
  }

  return output
}

export function normalizeUnclearAmount(name: string, amount: string): string {
  const unclear = /^(适量|少许|少量|一点|一点点|若干)$/.test(amount.trim())
  if (!unclear) {
    return amount
  }

  return `${amount}（需结合 OCR 画面或人工校准确认：${name}）`
}
