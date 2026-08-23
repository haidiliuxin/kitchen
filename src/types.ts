export type Difficulty = '零失败' | '轻松进阶' | '周末进阶'

export type Ingredient = {
  name: string
  amount: string
}

export type RecipeVisibility = 'official' | 'public' | 'private'

export type RecipeSourceType = 'official' | 'imported' | 'user'

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
  visibility?: RecipeVisibility
  sourceType?: RecipeSourceType
  ownerUserId?: string | null
}

export type PrepIngredient = {
  name: string
  originalAmount: string
  scaledAmount: string
  note?: string
}

export type MissingIngredient = {
  name: string
  amount: string
}

export type PrepPlan = {
  recipeId: string
  recipeTitle: string
  requestedServings: number
  baseServings: number
  sourceType: RecipeSourceType
  ingredients: PrepIngredient[]
  tools: string[]
  shoppingLinks: Array<{
    platform: 'meituan' | 'jd' | 'taobao'
    label: string
    url: string
  }>
  note: string
}

export type AuthUser = {
  id: string
  identifier: string
  displayName: string
}

export type AuthSession = {
  user: AuthUser
  token: string
  isNewUser?: boolean
}

export type RecipeDraftPayload = {
  title: string
  subtitle?: string
  description: string
  scene?: string
  difficulty?: Difficulty
  servings: number
  ingredients: Ingredient[]
  tools?: string[]
  steps: Array<{
    title: string
    instruction: string
    detail?: string
    durationMinutes?: number
    sensoryCue?: string
  }>
  tags?: string[]
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

export type CookingConversationTurn = {
  role: 'user' | 'assistant'
  content: string
}

export type CookingContext = {
  recipeName: string
  currentStep: {
    index: number
    total: number
    title: string
    instruction: string
  }
  timer: {
    remainingSeconds: number
    running: boolean
  } | null
  missingIngredients: string[]
  safetyNotes: string[]
  conversation: CookingConversationTurn[]
}

export type AssistantUsage = {
  inputTokens: number
  outputTokens: number
  firstTokenMs: number | null
  totalMs: number
  estimatedCostCny: number
}

export type AssistantAnswer = {
  answer: string
  provider: 'deepseek' | 'local'
  usage: AssistantUsage
  errorCategory?: 'budget_limited' | 'not_configured' | 'rate_limited' | 'upstream' | 'timeout' | 'aborted'
}
