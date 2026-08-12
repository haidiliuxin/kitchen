import assert from 'node:assert/strict'
import test from 'node:test'
import { VoiceTicketStore, isVoiceOriginAllowed } from '../server/voiceServer.js'

test('voice tickets are one-time and expire', () => {
  const tickets = new VoiceTicketStore()
  const { ticket } = tickets.issue('user', 'device-12345678', 1000)
  assert.equal(tickets.consume(ticket)?.userId, 'user')
  assert.equal(tickets.consume(ticket), null)
  const expired = tickets.issue('user', 'device-12345678', -1).ticket
  assert.equal(tickets.consume(expired), null)
})

test('voice origin allowlist never accepts wildcard', () => {
  const original = process.env.VOICE_ALLOWED_ORIGINS
  process.env.VOICE_ALLOWED_ORIGINS = 'https://kitchen.example,capacitor://localhost,*'
  try {
    assert.equal(isVoiceOriginAllowed('https://kitchen.example'), true)
    assert.equal(isVoiceOriginAllowed('capacitor://localhost'), true)
    assert.equal(isVoiceOriginAllowed('https://evil.example'), false)
  } finally {
    if (original === undefined) delete process.env.VOICE_ALLOWED_ORIGINS
    else process.env.VOICE_ALLOWED_ORIGINS = original
  }
})
