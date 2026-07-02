import crypto from 'node:crypto'
import { execFile } from 'node:child_process'
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const require = createRequire(import.meta.url)
const ffmpegStaticPath = require('ffmpeg-static') as string | null

export type UploadedVideoInfo = {
  originalName: string
  size: number
  mimeType: string
  durationSeconds: number
  durationLabel: string
}

export type ExtractedFrame = {
  frameId: string
  timeSeconds: number
  timeLabel: string
  imagePath: string
  imageUrl: string
}

export type SavedVideoUpload = {
  uploadId: string
  videoPath: string
  publicDir: string
  uploadedVideo: UploadedVideoInfo
}

type MultipartFile = {
  fieldName: string
  originalName: string
  mimeType: string
  buffer: Buffer
}

const uploadRoot = path.join(process.cwd(), 'tmp', 'demo-video-analysis')
const publicRoot = path.join(process.cwd(), 'tmp', 'demo-video-analysis-public')

function getFfmpegBinary(): string {
  return process.env.FFMPEG_PATH?.trim() || ffmpegStaticPath || 'ffmpeg'
}

function getFfprobeBinary(): string {
  return process.env.FFPROBE_PATH?.trim() || 'ffprobe'
}

function formatTimeLabel(seconds: number): string {
  const safeSeconds = Math.max(0, Math.round(seconds))
  const mins = Math.floor(safeSeconds / 60)
  const secs = safeSeconds % 60
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
}

export function formatDurationLabel(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return '未知'
  }

  const rounded = Math.round(seconds)
  const mins = Math.floor(rounded / 60)
  const secs = rounded % 60
  if (mins === 0) {
    return `${secs} 秒`
  }

  return secs === 0 ? `${mins} 分钟` : `${mins} 分 ${secs} 秒`
}

function sanitizeFilename(filename: string): string {
  const basename = path.basename(filename || 'video.mp4')
  return basename.replace(/[^\w.\-\u4e00-\u9fa5]/g, '_').slice(0, 120) || 'video.mp4'
}

function parseHeaderValue(headers: string, name: string): string {
  const pattern = new RegExp(`${name}="([^"]*)"`, 'i')
  return headers.match(pattern)?.[1] ?? ''
}

export function parseMultipartVideoUpload(
  contentType: string,
  body: Buffer,
): { file: MultipartFile | null; fields: Record<string, string> } {
  const boundary = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i)?.[1]
    ?? contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i)?.[2]

  if (!boundary) {
    throw new Error('multipart boundary missing')
  }

  const boundaryBuffer = Buffer.from(`--${boundary}`)
  const parts: Buffer[] = []
  let cursor = body.indexOf(boundaryBuffer)

  while (cursor !== -1) {
    const next = body.indexOf(boundaryBuffer, cursor + boundaryBuffer.length)
    if (next === -1) {
      break
    }

    const part = body.subarray(cursor + boundaryBuffer.length, next)
    parts.push(part)
    cursor = next
  }

  const fields: Record<string, string> = {}
  let file: MultipartFile | null = null

  for (const rawPart of parts) {
    let part = rawPart
    if (part.subarray(0, 2).toString() === '\r\n') {
      part = part.subarray(2)
    }
    if (part.subarray(part.length - 2).toString() === '\r\n') {
      part = part.subarray(0, part.length - 2)
    }

    const separator = Buffer.from('\r\n\r\n')
    const separatorIndex = part.indexOf(separator)
    if (separatorIndex === -1) {
      continue
    }

    const headerText = part.subarray(0, separatorIndex).toString('utf8')
    const content = part.subarray(separatorIndex + separator.length)
    const disposition = headerText.match(/content-disposition:\s*([^\r\n]+)/i)?.[1] ?? ''
    const fieldName = parseHeaderValue(disposition, 'name')
    const filename = parseHeaderValue(disposition, 'filename')
    const mimeType = headerText.match(/content-type:\s*([^\r\n]+)/i)?.[1]?.trim() ?? 'application/octet-stream'

    if (!fieldName) {
      continue
    }

    if (filename) {
      file = {
        fieldName,
        originalName: sanitizeFilename(filename),
        mimeType,
        buffer: content,
      }
    } else {
      fields[fieldName] = content.toString('utf8').trim()
    }
  }

  return { file, fields }
}

export async function saveUploadedVideo(options: {
  file: MultipartFile
  durationSecondsFromClient?: number
}): Promise<SavedVideoUpload> {
  const uploadId = crypto.randomUUID()
  const uploadDir = path.join(uploadRoot, uploadId)
  const publicDir = path.join(publicRoot, uploadId)
  await mkdir(uploadDir, { recursive: true })
  await mkdir(publicDir, { recursive: true })

  const videoPath = path.join(uploadDir, options.file.originalName)
  await writeFile(videoPath, options.file.buffer)

  const probedDuration = await probeVideoDuration(videoPath).catch(() => 0)
  const durationSeconds = probedDuration > 0
    ? probedDuration
    : Math.max(0, options.durationSecondsFromClient ?? 0)

  return {
    uploadId,
    videoPath,
    publicDir,
    uploadedVideo: {
      originalName: options.file.originalName,
      size: options.file.buffer.byteLength,
      mimeType: options.file.mimeType,
      durationSeconds,
      durationLabel: formatDurationLabel(durationSeconds),
    },
  }
}

export async function probeVideoDuration(videoPath: string): Promise<number> {
  const { stdout } = await execFileAsync(getFfprobeBinary(), [
    '-v',
    'error',
    '-show_entries',
    'format=duration',
    '-of',
    'default=noprint_wrappers=1:nokey=1',
    videoPath,
  ])
  const duration = Number.parseFloat(stdout.trim())
  return Number.isFinite(duration) && duration > 0 ? duration : 0
}

export async function assertFfmpegAvailable(): Promise<void> {
  await execFileAsync(getFfmpegBinary(), ['-version'])
}

function getFrameTimes(durationSeconds: number): number[] {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    return [0]
  }

  const endGuard = Math.max(0, durationSeconds - 2)
  const requiredTimes = [
    0,
    durationSeconds * 0.25,
    durationSeconds * 0.5,
    durationSeconds * 0.75,
    endGuard,
  ]
  const interval = durationSeconds <= 90 ? 5 : Math.max(8, durationSeconds / 12)
  const times = new Set<number>()

  for (let time = 0; time <= endGuard; time += interval) {
    times.add(Math.min(endGuard, Math.max(0, Math.round(time))))
  }

  for (const time of requiredTimes) {
    times.add(Math.min(endGuard, Math.max(0, Math.round(time))))
  }

  return Array.from(times).sort((a, b) => a - b)
}

export async function extractVideoFrames(options: {
  videoPath: string
  publicDir: string
  durationSeconds: number
  publicBaseUrl: string
}): Promise<ExtractedFrame[]> {
  await rm(options.publicDir, { recursive: true, force: true })
  await mkdir(options.publicDir, { recursive: true })

  const times = getFrameTimes(options.durationSeconds)
  const frames: ExtractedFrame[] = []

  for (const [index, timeSeconds] of times.entries()) {
    const frameId = `frame-${String(index + 1).padStart(2, '0')}`
    const filename = `${frameId}-${timeSeconds}s.jpg`
    const imagePath = path.join(options.publicDir, filename)

    await execFileAsync(getFfmpegBinary(), [
      '-y',
      '-ss',
      String(timeSeconds),
      '-i',
      options.videoPath,
      '-frames:v',
      '1',
      '-q:v',
      '2',
      imagePath,
    ])

    frames.push({
      frameId,
      timeSeconds,
      timeLabel: formatTimeLabel(timeSeconds),
      imagePath,
      imageUrl: `${options.publicBaseUrl.replace(/\/$/, '')}/${filename}`,
    })
  }

  const generated = await readdir(options.publicDir)
  return frames.filter((frame) => generated.includes(path.basename(frame.imagePath)))
}

export function getPublicUploadRoot(): string {
  return publicRoot
}

export function toTimeLabel(seconds: number): string {
  return formatTimeLabel(seconds)
}
