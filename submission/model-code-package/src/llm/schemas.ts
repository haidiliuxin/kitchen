/**
 * Minimal schemas for the LLM-facing contract.
 * The production code performs defensive normalization in:
 * - src/video-recipe/localVideoAnalyze.ts normalizeRecipeFromOcrModel()
 * - src/video-recipe/demoAnalyze.ts normalizeDemoRecipe()
 */

export type RecipeIngredient = {
  name: string
  amount: string
  note: string
}

export type RecipePrepItem = {
  name: string
  action: string
}

export type RecipeStep = {
  stepId: string
  title: string
  instruction: string
  startTime: number
  endTime: number
  duration: string
  tips: string[]
  commonMistakes: string[]
  rescue: string
  keyFrameUrl?: string
}

export type StructuredRecipe = {
  recipeName: string
  estimatedTime: string
  servings: number
  ingredients: RecipeIngredient[]
  prepItems: RecipePrepItem[]
  steps: RecipeStep[]
}

export type EvidenceInsufficientResponse = {
  status: 'evidence_insufficient'
  reason: string
}

export type VideoRecipeModelOutput = StructuredRecipe | EvidenceInsufficientResponse

export type CurrentStepCoachInput = {
  recipeName: string
  currentStep: {
    title: string
    instruction: string
    tips: string[]
    commonMistakes: string[]
  }
  userQuestion: string
}

export type CurrentStepCoachOutput = {
  status: 'success' | 'fallback'
  answer: string
  provider?: string
  model?: string
}

export type VoiceIntent =
  | { type: 'next_step' }
  | { type: 'prev_step' }
  | { type: 'repeat_step' }
  | { type: 'play_video' }
  | { type: 'timer'; durationSeconds: number }
  | { type: 'question'; question: string }
  | { type: 'unknown'; text: string }
