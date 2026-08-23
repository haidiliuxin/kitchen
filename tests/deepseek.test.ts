import assert from 'node:assert/strict'
import test from 'node:test'
import { callChatCompletionWithUsage, LanguageModelError } from '../server/llm.js'

test('DeepSeek request fixes model, disables thinking and reads streamed usage', async () => {
  const originalFetch = globalThis.fetch
  const originalKey = process.env.DEEPSEEK_API_KEY
  const originalModel = process.env.DEEPSEEK_MODEL
  process.env.DEEPSEEK_API_KEY = 'test-key'
  delete process.env.DEEPSEEK_MODEL
  let requestBody: Record<string, unknown> | null = null
  globalThis.fetch = async (_input, init) => {
    requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>
    const stream = [
      'data: {"choices":[{"delta":{"content":"先关小火"}}]}\n\n',
      'data: {"choices":[],"usage":{"prompt_tokens":800,"completion_tokens":160}}\n\n',
      'data: [DONE]\n\n',
    ].join('')
    return new Response(stream, { status: 200, headers: { 'Content-Type': 'text/event-stream' } })
  }

  try {
    const result = await callChatCompletionWithUsage({
      messages: [{ role: 'user', content: '糊了怎么办' }],
    })
    assert.equal(result.content, '先关小火')
    assert.equal(result.usage.inputTokens, 800)
    assert.equal(result.usage.outputTokens, 160)
    assert.equal(requestBody?.model, 'deepseek-v4-flash')
    assert.deepEqual(requestBody?.thinking, { type: 'disabled' })
    assert.equal(requestBody?.max_tokens, 320)
    assert.equal(requestBody?.stream, true)
  } finally {
    globalThis.fetch = originalFetch
    if (originalKey === undefined) delete process.env.DEEPSEEK_API_KEY
    else process.env.DEEPSEEK_API_KEY = originalKey
    if (originalModel === undefined) delete process.env.DEEPSEEK_MODEL
    else process.env.DEEPSEEK_MODEL = originalModel
  }
})

test('DeepSeek honors a signal that was already aborted', async () => {
  const originalFetch = globalThis.fetch
  const originalKey = process.env.DEEPSEEK_API_KEY
  process.env.DEEPSEEK_API_KEY = 'test-key'
  globalThis.fetch = async (_input, init) => {
    assert.equal(init?.signal?.aborted, true)
    throw new DOMException('aborted', 'AbortError')
  }
  const controller = new AbortController()
  controller.abort()

  try {
    await assert.rejects(
      callChatCompletionWithUsage({ messages: [{ role: 'user', content: 'test' }], signal: controller.signal }),
      (error) => error instanceof LanguageModelError && error.category === 'aborted',
    )
  } finally {
    globalThis.fetch = originalFetch
    if (originalKey === undefined) delete process.env.DEEPSEEK_API_KEY
    else process.env.DEEPSEEK_API_KEY = originalKey
  }
})
