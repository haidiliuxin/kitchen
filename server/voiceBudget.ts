import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'

export type VoiceUsage = {
  date: string
  asrMs: number
  deepseekInputTokens: number
  deepseekOutputTokens: number
  ttsCharacters: number
  estimatedCostCny: number
}

export type VoiceBudgetKind = 'asr' | 'deepseek' | 'tts'

export class VoiceBudgetError extends Error {
  constructor(public readonly reason: 'budget_limited' | 'usage_file_invalid') {
    super(reason)
    this.name = 'VoiceBudgetError'
  }
}

const emptyUsage = (date: string): VoiceUsage => ({
  date,
  asrMs: 0,
  deepseekInputTokens: 0,
  deepseekOutputTokens: 0,
  ttsCharacters: 0,
  estimatedCostCny: 0,
})

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

function finiteNonNegative(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

function validateUsage(value: unknown): VoiceUsage | null {
  if (!value || typeof value !== 'object') {
    return null
  }
  const usage = value as Partial<VoiceUsage>
  if (
    typeof usage.date !== 'string'
    || !/^\d{4}-\d{2}-\d{2}$/.test(usage.date)
    || !finiteNonNegative(usage.asrMs)
    || !finiteNonNegative(usage.deepseekInputTokens)
    || !finiteNonNegative(usage.deepseekOutputTokens)
    || !finiteNonNegative(usage.ttsCharacters)
    || !finiteNonNegative(usage.estimatedCostCny)
  ) {
    return null
  }
  return usage as VoiceUsage
}

function numberEnv(name: string, fallback: number): number {
  const value = Number(process.env[name] ?? fallback)
  return Number.isFinite(value) && value >= 0 ? value : fallback
}

export class VoiceBudgetStore {
  private usage: VoiceUsage | null = null
  private invalid = false
  private writeQueue: Promise<void> = Promise.resolve()
  private operationQueue: Promise<void> = Promise.resolve()

  constructor(
    private readonly filePath = path.join(process.cwd(), 'data', 'voice-usage.json'),
  ) {}

  private async load(): Promise<VoiceUsage> {
    if (this.invalid) {
      throw new VoiceBudgetError('usage_file_invalid')
    }
    if (this.usage?.date === today()) {
      return this.usage
    }

    try {
      const parsed = validateUsage(JSON.parse(await readFile(this.filePath, 'utf8')))
      if (!parsed) {
        this.invalid = true
        throw new VoiceBudgetError('usage_file_invalid')
      }
      this.usage = parsed.date === today() ? parsed : emptyUsage(today())
      if (parsed.date !== today()) {
        await this.persist()
      }
      return this.usage
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        this.usage = emptyUsage(today())
        await this.persist()
        return this.usage
      }
      if (error instanceof VoiceBudgetError) {
        throw error
      }
      this.invalid = true
      throw new VoiceBudgetError('usage_file_invalid')
    }
  }

  private async persist(): Promise<void> {
    if (!this.usage) {
      return
    }
    const snapshot = JSON.stringify(this.usage, null, 2)
    const directory = path.dirname(this.filePath)
    const temporary = `${this.filePath}.${process.pid}.tmp`
    this.writeQueue = this.writeQueue.then(async () => {
      await mkdir(directory, { recursive: true })
      await writeFile(temporary, snapshot, { encoding: 'utf8', mode: 0o600 })
      await rename(temporary, this.filePath)
    })
    await this.writeQueue
  }

  private serialize<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.operationQueue.then(operation, operation)
    this.operationQueue = result.then(() => undefined, () => undefined)
    return result
  }

  private limits() {
    return {
      asrMs: numberEnv('VOICE_DAILY_ASR_SECONDS', 600) * 1000,
      inputTokens: numberEnv('VOICE_DAILY_DEEPSEEK_INPUT_TOKENS', 50_000),
      outputTokens: numberEnv('VOICE_DAILY_DEEPSEEK_OUTPUT_TOKENS', 15_000),
      ttsCharacters: numberEnv('VOICE_DAILY_TTS_CHARACTERS', 5_000),
      totalCny: numberEnv('VOICE_DAILY_BUDGET_CNY', 5),
    }
  }

  private cost(asrMs = 0, inputTokens = 0, outputTokens = 0, ttsCharacters = 0): number {
    return (
      (asrMs / 3_600_000) * numberEnv('VOICE_ASR_CNY_PER_HOUR', 4.5)
      + (inputTokens / 1_000_000) * numberEnv('VOICE_DEEPSEEK_INPUT_CNY_PER_MTOKENS', 1)
      + (outputTokens / 1_000_000) * numberEnv('VOICE_DEEPSEEK_OUTPUT_CNY_PER_MTOKENS', 2)
      + (ttsCharacters / 10_000) * numberEnv('VOICE_TTS_CNY_PER_10000_CHARS', 5)
    )
  }

  async assertAvailable(kind: VoiceBudgetKind, amount = 0): Promise<VoiceUsage> {
    return this.serialize(() => this.assertAvailableNow(kind, amount))
  }

  private async assertAvailableNow(kind: VoiceBudgetKind, amount: number): Promise<VoiceUsage> {
    const usage = await this.load()
    const limits = this.limits()
    const projectedCost = usage.estimatedCostCny + (
      kind === 'asr' ? this.cost(amount) : kind === 'tts' ? this.cost(0, 0, 0, amount) : 0
    )
    const limited =
      projectedCost > limits.totalCny
      || (kind === 'asr' && usage.asrMs + amount > limits.asrMs)
      || (kind === 'tts' && usage.ttsCharacters + amount > limits.ttsCharacters)
      || (kind === 'deepseek'
        && (usage.deepseekInputTokens >= limits.inputTokens
          || usage.deepseekOutputTokens >= limits.outputTokens))
    if (limited) {
      throw new VoiceBudgetError('budget_limited')
    }
    return { ...usage }
  }

  async recordAsr(milliseconds: number): Promise<VoiceUsage> {
    return this.serialize(() => this.recordAsrNow(milliseconds))
  }

  private async recordAsrNow(milliseconds: number): Promise<VoiceUsage> {
    const usage = await this.load()
    const value = Math.max(0, Math.round(milliseconds))
    usage.asrMs += value
    usage.estimatedCostCny = Number((usage.estimatedCostCny + this.cost(value)).toFixed(6))
    await this.persist()
    return { ...usage }
  }

  async recordDeepSeek(inputTokens: number, outputTokens: number): Promise<VoiceUsage> {
    return this.serialize(() => this.recordDeepSeekNow(inputTokens, outputTokens))
  }

  private async recordDeepSeekNow(inputTokens: number, outputTokens: number): Promise<VoiceUsage> {
    const usage = await this.load()
    const input = Math.max(0, Math.round(inputTokens))
    const output = Math.max(0, Math.round(outputTokens))
    usage.deepseekInputTokens += input
    usage.deepseekOutputTokens += output
    usage.estimatedCostCny = Number((usage.estimatedCostCny + this.cost(0, input, output)).toFixed(6))
    await this.persist()
    return { ...usage }
  }

  async recordTts(characters: number): Promise<VoiceUsage> {
    return this.serialize(() => this.recordTtsNow(characters))
  }

  private async recordTtsNow(characters: number): Promise<VoiceUsage> {
    const usage = await this.load()
    const value = Math.max(0, Math.round(characters))
    const limits = this.limits()
    if (usage.ttsCharacters + value > limits.ttsCharacters
      || usage.estimatedCostCny + this.cost(0, 0, 0, value) > limits.totalCny) {
      throw new VoiceBudgetError('budget_limited')
    }
    usage.ttsCharacters += value
    usage.estimatedCostCny = Number((usage.estimatedCostCny + this.cost(0, 0, 0, value)).toFixed(6))
    await this.persist()
    return { ...usage }
  }

  async snapshot(): Promise<VoiceUsage> {
    return this.serialize(async () => ({ ...(await this.load()) }))
  }
}

export const voiceBudget = new VoiceBudgetStore()
