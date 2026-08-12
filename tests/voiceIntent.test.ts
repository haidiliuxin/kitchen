import assert from 'node:assert/strict'
import test from 'node:test'
import { parseVoiceIntent, stripWakeWord } from '../src/features/kitchen/voiceIntent.js'

test('voice intent parses wake prefix and deterministic kitchen commands', () => {
  assert.deepEqual(stripWakeWord('小白小白，下一步'), { text: '下一步', hadWakeWord: true })
  assert.deepEqual(parseVoiceIntent('小白小白'), { type: 'wake_only' })
  assert.deepEqual(parseVoiceIntent('小白小白，下一部'), { type: 'next_step' })
  assert.deepEqual(parseVoiceIntent('计时三分半'), { type: 'timer_start', durationSeconds: 210 })
  assert.deepEqual(parseVoiceIntent('倒计时1分钟30秒'), { type: 'timer_start', durationSeconds: 90 })
  assert.deepEqual(parseVoiceIntent('暂停计时'), { type: 'timer_pause' })
  assert.deepEqual(parseVoiceIntent('还有多久'), { type: 'timer_query' })
  assert.deepEqual(parseVoiceIntent('停止视频'), { type: 'pause_video' })
  assert.deepEqual(parseVoiceIntent('结束对话'), { type: 'exit' })
  assert.deepEqual(parseVoiceIntent('鸡蛋为什么变老了'), { type: 'question', question: '鸡蛋为什么变老了' })
  assert.equal(parseVoiceIntent('计时121分钟').type, 'unknown')
})
