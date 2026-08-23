import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { VoiceBudgetError, VoiceBudgetStore } from '../server/voiceBudget.js'

test('voice budget persists numeric usage and fails closed on corruption', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'kitchen-voice-budget-'))
  const file = path.join(directory, 'voice-usage.json')
  try {
    const store = new VoiceBudgetStore(file)
    await store.assertAvailable('asr', 1000)
    const usage = await store.recordAsr(1000)
    assert.equal(usage.asrMs, 1000)
    assert.ok(usage.estimatedCostCny > 0)

    const concurrentFile = path.join(directory, 'concurrent.json')
    const concurrent = new VoiceBudgetStore(concurrentFile)
    await Promise.all(Array.from({ length: 20 }, () => concurrent.recordTts(1)))
    assert.equal((await concurrent.snapshot()).ttsCharacters, 20)

    await writeFile(file, '{broken json', 'utf8')
    const corrupt = new VoiceBudgetStore(file)
    await assert.rejects(corrupt.snapshot(), (error) =>
      error instanceof VoiceBudgetError && error.reason === 'usage_file_invalid')
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
