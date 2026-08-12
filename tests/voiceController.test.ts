import assert from 'node:assert/strict'
import test from 'node:test'
import {
  initialVoiceSnapshot,
  voiceReducer,
  VoiceTransitionError,
} from '../src/features/kitchen/voiceController.js'

test('voice reducer follows the normal path and rejects illegal transitions', () => {
  let state = voiceReducer(initialVoiceSnapshot, { type: 'ENABLE' })
  const firstGeneration = state.generation
  state = voiceReducer(state, { type: 'PERMISSION_GRANTED' })
  state = voiceReducer(state, { type: 'PREPARED' })
  state = voiceReducer(state, { type: 'WAKE', generation: firstGeneration + 1 })
  state = voiceReducer(state, { type: 'CAPTURE', generation: firstGeneration + 1 })
  state = voiceReducer(state, { type: 'TRANSCRIBE' })
  state = voiceReducer(state, { type: 'PROCESS_LOCAL' })
  state = voiceReducer(state, { type: 'SPEAK' })
  state = voiceReducer(state, { type: 'SPEECH_DONE' })
  assert.equal(state.state, 'conversation_window')
  state = voiceReducer(state, { type: 'WINDOW_TIMEOUT' })
  assert.equal(state.state, 'waiting_for_wake_word')
  assert.throws(() => voiceReducer(state, { type: 'SPEAK' }), VoiceTransitionError)
})

test('diagnostics never change the voice state', () => {
  const state = voiceReducer(initialVoiceSnapshot, {
    type: 'DIAGNOSTIC',
    patch: { partial: '下一步', provider: 'doubao-asr' },
  })
  assert.equal(state.state, 'disabled')
  assert.equal(state.partial, '下一步')
})

test('one recovery recollects with a new generation and then returns to wake word', () => {
  let state = voiceReducer(initialVoiceSnapshot, { type: 'ENABLE' })
  state = voiceReducer(state, { type: 'PERMISSION_GRANTED' })
  state = voiceReducer(state, { type: 'WAKE', generation: 2 })
  state = voiceReducer(state, { type: 'CAPTURE', generation: 2 })
  state = voiceReducer(state, { type: 'RECOVER' })
  state = voiceReducer(state, { type: 'CAPTURE', generation: 3 })
  state = voiceReducer(state, { type: 'RECOVERY_FAILED' })
  assert.equal(state.state, 'waiting_for_wake_word')
  assert.equal(state.generation, 3)
})
