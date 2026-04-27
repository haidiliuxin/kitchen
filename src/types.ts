export type Difficulty = '零失败' | '轻松进阶' | '周末进阶'

export type Ingredient = {
  name: string
  amount: string
}

export type RescueTip = {
  issue: string
  keywords: string[]
  answer: string
}

export type Substitution = {
  ingredient: string
  replacement: string
  tip: string
}

export type StepVideo = {
  url: string
  posterUrl?: string
  caption: string
  creditLabel?: string
  creditUrl?: string
  startSeconds?: number
  endSeconds?: number
}

export type Step = {
  title: string
  instruction: string
  detail: string
  durationMinutes: number
  sensoryCue: string
  checkpoints: string[]
  commonMistakes: string[]
  demoFrames: [string, string, string]
  voiceover: string
  video?: StepVideo
}

export type Recipe = {
  id: string
  title: string
  subtitle: string
  scene: string
  difficulty: Difficulty
  duration: number
  servings: number
  highlight: string
  riskNote: string
  description: string
  tags: string[]
  searchTokens: string[]
  tools: string[]
  ingredients: Ingredient[]
  substitutions: Substitution[]
  rescueTips: RescueTip[]
  steps: Step[]
  palette: {
    start: string
    end: string
  }
}

export type CookingHistoryEntry = {
  id: string
  recipeId: string
  finishedAt: string
}

export type ImportSourceType = 'video' | 'document'

export type ImportedRecipeSummary = {
  id: string
  title: string
  sourceLabel: string
  summary: string
  tags: string[]
  recipeId: string | null
}

export type ImportAnalyzeResponse = {
  status: 'ok' | 'mock'
  message: string
  importedRecipes: ImportedRecipeSummary[]
}

export type RecipeFilters = {
  query?: string
  difficulty?: '全部' | Difficulty
  timeLimit?: '全部' | number
}

export type VoiceInterpretation = {
  activated: boolean
  wakeWords: string[]
  transcript: string
  cleanedTranscript: string
  matchedWakeWord: string | null
}
