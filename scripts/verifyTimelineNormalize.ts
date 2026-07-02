/**
 * 临时验证脚本：验证 DeepSeek 步骤时间的鲁棒解析与修正。
 *
 * 运行：npx tsx scripts/verifyTimelineNormalize.ts
 *
 * 覆盖点：
 * - 多字段名（start_time / timeRange / start+end / timestamp）
 * - 多时间格式（mm:ss、中文分秒、数字秒、区间字符串）
 * - 步骤时间永远压回真实视频时长内（endTime <= video_duration_seconds）
 */
import assert from 'node:assert/strict'
import {
  normalizeRecipeFromOcrModel,
  parseTimeRange,
  parseTimeSeconds,
  readStepTimeRange,
} from '../server/localVideoAnalyze.ts'
import type { ExtractedFrame } from '../server/videoProcessing.ts'

const DURATION = 78 // 真实视频 1 分 18 秒
const frames: ExtractedFrame[] = [0, 20, 39, 58, 76].map((timeSeconds, index) => ({
  frameId: `frame-${index + 1}`,
  timeSeconds,
  timeLabel: `${timeSeconds}s`,
  imagePath: '',
  imageUrl: `http://example.local/frame-${index + 1}.jpg`,
}))

let passed = 0
function ok(label: string): void {
  passed += 1
  console.log(`✓ ${label}`)
}

// ---- parseTimeSeconds ----
assert.equal(parseTimeSeconds(12), 12)
assert.equal(parseTimeSeconds('12'), 12)
assert.equal(parseTimeSeconds('00:12'), 12)
assert.equal(parseTimeSeconds('00:01:18'), 78)
assert.equal(parseTimeSeconds('12秒'), 12)
assert.equal(parseTimeSeconds('1分18秒'), 78)
assert.equal(parseTimeSeconds('第30秒'), 30)
assert.equal(parseTimeSeconds('乱码'), null)
ok('parseTimeSeconds 支持数字/字符串/mm:ss/hh:mm:ss/中文分秒')

// ---- parseTimeRange ----
assert.deepEqual(parseTimeRange([5, 12]), { start: 5, end: 12 })
assert.deepEqual(parseTimeRange({ start: 5, end: 12 }), { start: 5, end: 12 })
assert.deepEqual(parseTimeRange('00:05-00:12'), { start: 5, end: 12 })
assert.deepEqual(parseTimeRange('5秒-12秒'), { start: 5, end: 12 })
assert.deepEqual(parseTimeRange('第5秒到第12秒'), { start: 5, end: 12 })
ok('parseTimeRange 支持数组/对象/区间字符串')

// ---- readStepTimeRange ----
function expectRange(
  label: string,
  record: Record<string, unknown>,
  index: number,
  expected: { start: number; end: number },
): void {
  const range = readStepTimeRange(record, index, frames, DURATION)
  assert.ok(range, `${label}: 期望得到区间`)
  assert.equal(range!.start, expected.start, `${label}: start`)
  assert.equal(range!.end, expected.end, `${label}: end`)
  assert.ok(range!.start >= 0 && range!.end <= DURATION && range!.end > range!.start, `${label}: 越界`)
  ok(`${label} -> ${range!.start}~${range!.end}`)
}

expectRange('{ start_time:"00:05", end_time:"00:12" }', { start_time: '00:05', end_time: '00:12' }, 0, { start: 5, end: 12 })
expectRange('{ timeRange:"5秒-12秒" }', { timeRange: '5秒-12秒' }, 0, { start: 5, end: 12 })
expectRange('{ start:"1分10秒", end:"1分30秒" } (78s 封顶)', { start: '1分10秒', end: '1分30秒' }, 1, { start: 70, end: 78 })
expectRange('{ timestamp:20 } (推断 20~25)', { timestamp: 20 }, 2, { start: 20, end: 25 })
expectRange('{ startTime:60, endTime:168 } (168 压到 78)', { startTime: 60, endTime: 168 }, 3, { start: 60, end: 78 })

// ---- 端到端 normalize（模拟 DeepSeek 返回混合格式）----
const payload = {
  recipeName: '测试番茄鸡蛋',
  estimatedTime: '2 分钟',
  servings: 2,
  ingredients: [{ name: '鸡蛋', amount: '2 个', note: 'OCR 证据' }],
  prepItems: [{ name: '鸡蛋', action: '打散' }],
  steps: [
    { title: '切番茄', instruction: '把番茄切块', timeRange: '5秒-12秒' },
    { title: '翻炒', instruction: '中火翻炒', start: '1分10秒', end: '1分30秒' },
    { title: '收汁', instruction: '收汁装盘', startTime: 60, endTime: 168 },
    { title: '出锅', instruction: '撒葱花出锅', timestamp: 20 },
  ],
}

const recipe = normalizeRecipeFromOcrModel(payload, frames, DURATION, 'OCR: 番茄 鸡蛋 盐 翻炒 出锅')
assert.equal(recipe.steps.length, 4, '所有步骤都应被保留，step 1 不再失败')
for (const [i, step] of recipe.steps.entries()) {
  assert.ok(step.startTime >= 0, `step ${i + 1} startTime >= 0`)
  assert.ok(step.endTime <= DURATION, `step ${i + 1} endTime <= ${DURATION}`)
  assert.ok(step.endTime > step.startTime, `step ${i + 1} endTime > startTime`)
}
ok(`normalizeRecipeFromOcrModel 端到端：4 步全部合法，时间均 <= ${DURATION}s`)

console.log(`\n全部 ${passed} 组断言通过。`)
