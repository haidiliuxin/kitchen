import { gunzipSync, gzipSync } from 'node:zlib'

const HEADER = 4

function uint32(value: number): Buffer {
  const buffer = Buffer.allocUnsafe(4)
  buffer.writeUInt32BE(value)
  return buffer
}

function int32(value: number): Buffer {
  const buffer = Buffer.allocUnsafe(4)
  buffer.writeInt32BE(value)
  return buffer
}

function packet(header: number[], parts: Buffer[]): Buffer {
  return Buffer.concat([Buffer.from(header), ...parts])
}

export function buildAsrFullClientRequest(userId: string): Buffer {
  const body = gzipSync(Buffer.from(JSON.stringify({
    user: { uid: userId },
    audio: { format: 'pcm', codec: 'raw', rate: 16_000, bits: 16, channel: 1 },
    request: {
      model_name: 'bigmodel',
      enable_itn: true,
      enable_punc: true,
      enable_ddc: false,
      enable_nonstream: true,
      enable_accelerate_text: true,
      show_utterances: true,
      result_type: 'full',
    },
  }), 'utf8'))
  return packet([0x11, 0x10, 0x11, 0], [uint32(body.length), body])
}

export function buildAsrAudioRequest(sequence: number, audio: Buffer, last = false): Buffer {
  const body = gzipSync(audio)
  const signedSequence = last ? -Math.max(1, Math.abs(sequence)) : Math.max(1, sequence)
  return packet(
    [0x11, 0x20 | (last ? 0x03 : 0x01), 0x01, 0],
    [int32(signedSequence), uint32(body.length), body],
  )
}

export type DoubaoAsrResponse = {
  messageType: number
  flags: number
  sequence: number | null
  errorCode: number | null
  payload: unknown
}

export function parseAsrResponse(data: Buffer): DoubaoAsrResponse {
  if (data.length < HEADER || (data[0] >> 4) !== 1) {
    throw new Error('invalid doubao ASR frame')
  }
  const headerBytes = (data[0] & 0x0f) * 4
  const messageType = data[1] >> 4
  const flags = data[1] & 0x0f
  const serialization = data[2] >> 4
  const compression = data[2] & 0x0f
  let offset = headerBytes
  let sequence: number | null = null
  let errorCode: number | null = null

  if (flags & 0x01) {
    if (offset + 4 > data.length) throw new Error('invalid doubao ASR sequence')
    sequence = data.readInt32BE(offset)
    offset += 4
  }
  if (messageType === 0x0f) {
    if (offset + 4 > data.length) throw new Error('invalid doubao ASR error')
    errorCode = data.readUInt32BE(offset)
    offset += 4
  }
  if (offset + 4 > data.length) throw new Error('invalid doubao ASR payload size')
  const size = data.readUInt32BE(offset)
  offset += 4
  if (size > data.length - offset) throw new Error('invalid doubao ASR payload')
  let body = data.subarray(offset, offset + size)
  if (compression === 1 && body.length) {
    body = gunzipSync(body)
  }
  let payload: unknown = body
  if (serialization === 1 && body.length) {
    payload = JSON.parse(body.toString('utf8')) as unknown
  }
  return { messageType, flags, sequence, errorCode, payload }
}

export function buildTtsSendTextRequest(userId: string, text: string, speaker: string): Buffer {
  const body = Buffer.from(JSON.stringify({
    user: { uid: userId },
    req_params: {
      text,
      speaker,
      audio_params: { format: 'pcm', sample_rate: 24_000 },
    },
  }), 'utf8')
  return packet([0x11, 0x10, 0x10, 0], [uint32(body.length), body])
}

export function buildTtsFinishConnection(): Buffer {
  const body = Buffer.from('{}', 'utf8')
  return packet([0x11, 0x14, 0x10, 0], [int32(2), uint32(body.length), body])
}

export type DoubaoTtsResponse = {
  messageType: number
  event: number | null
  payload: Buffer
  json: Record<string, unknown> | null
}

function readTtsPayload(data: Buffer, offset: number): Buffer {
  if (offset + 4 > data.length) throw new Error('invalid doubao TTS payload size')
  const firstSize = data.readUInt32BE(offset)
  if (firstSize === data.length - offset - 4) {
    return data.subarray(offset + 4)
  }

  // Session-scoped V3 events may carry session-id before payload size.
  const payloadSizeOffset = offset + 4 + firstSize
  if (firstSize <= 128 && payloadSizeOffset + 4 <= data.length) {
    const payloadSize = data.readUInt32BE(payloadSizeOffset)
    const payloadOffset = payloadSizeOffset + 4
    if (payloadSize === data.length - payloadOffset) {
      return data.subarray(payloadOffset)
    }
  }
  throw new Error('invalid doubao TTS payload')
}

export function parseTtsResponse(data: Buffer): DoubaoTtsResponse {
  if (data.length < HEADER || (data[0] >> 4) !== 1) {
    throw new Error('invalid doubao TTS frame')
  }
  const headerBytes = (data[0] & 0x0f) * 4
  const messageType = data[1] >> 4
  const flags = data[1] & 0x0f
  const serialization = data[2] >> 4
  const compression = data[2] & 0x0f
  let offset = headerBytes
  let event: number | null = null
  if (flags & 0x04) {
    if (offset + 4 > data.length) throw new Error('invalid doubao TTS event')
    event = data.readInt32BE(offset)
    offset += 4
  }
  let payload = readTtsPayload(data, offset)
  if (compression === 1 && payload.length) {
    payload = gunzipSync(payload)
  }
  let json: Record<string, unknown> | null = null
  if (serialization === 1 && payload.length) {
    json = JSON.parse(payload.toString('utf8')) as Record<string, unknown>
  }
  return { messageType, event, payload, json }
}
