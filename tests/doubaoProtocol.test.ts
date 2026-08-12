import assert from 'node:assert/strict'
import test from 'node:test'
import { gzipSync } from 'node:zlib'
import {
  buildAsrAudioRequest,
  buildAsrFullClientRequest,
  buildTtsSendTextRequest,
  parseAsrResponse,
  parseTtsResponse,
} from '../server/doubaoProtocol.js'

function int32(value: number): Buffer {
  const result = Buffer.alloc(4)
  result.writeInt32BE(value)
  return result
}

function uint32(value: number): Buffer {
  const result = Buffer.alloc(4)
  result.writeUInt32BE(value)
  return result
}

test('ASR requests use v1 binary framing and negative sequence for the final packet', () => {
  const initial = buildAsrFullClientRequest('test-user')
  assert.deepEqual([...initial.subarray(0, 4)], [0x11, 0x10, 0x11, 0])
  const audio = buildAsrAudioRequest(2, Buffer.alloc(3200), false)
  assert.equal(audio[1], 0x21)
  assert.equal(audio.readInt32BE(4), 2)
  const final = buildAsrAudioRequest(3, Buffer.alloc(0), true)
  assert.equal(final[1], 0x23)
  assert.equal(final.readInt32BE(4), -3)
})

test('ASR and TTS downstream frames parse without exposing raw upstream envelopes', () => {
  const asrJson = gzipSync(Buffer.from(JSON.stringify({ result: { text: '下一步' } })))
  const asrFrame = Buffer.concat([
    Buffer.from([0x11, 0x91, 0x11, 0]),
    int32(-1),
    uint32(asrJson.length),
    asrJson,
  ])
  const asr = parseAsrResponse(asrFrame)
  assert.equal(asr.sequence, -1)
  assert.deepEqual(asr.payload, { result: { text: '下一步' } })

  const pcm = Buffer.from([1, 2, 3, 4])
  const ttsFrame = Buffer.concat([
    Buffer.from([0x11, 0x94, 0, 0]),
    int32(352),
    uint32(pcm.length),
    pcm,
  ])
  assert.deepEqual(parseTtsResponse(ttsFrame), {
    messageType: 9,
    event: 352,
    payload: pcm,
    json: null,
  })
  assert.deepEqual([...buildTtsSendTextRequest('user', '你好', 'voice').subarray(0, 4)], [0x11, 0x10, 0x10, 0])
})
