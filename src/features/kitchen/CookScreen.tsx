import { useEffect, useRef, useState } from 'react'
import { formatTimer, speak } from './shared.js'
import type { Recipe, Step } from '../../types.js'
import type { ChatMessage, VoiceStatus } from './shared.js'

type CookScreenProps = {
  selectedRecipe: Recipe
  currentStep: Step
  currentStepIndex: number
  timerLeft: number
  isTimerRunning: boolean
  voiceEnabled: boolean
  voiceStatus: VoiceStatus
  lastVoiceCommand: string
  wakeWords: string[]
  liveCoachNote: string
  messages: ChatMessage[]
  quickPrompts: string[]
  assistantInput: string
  isAssistantLoading: boolean
  isFinishing: boolean
  onBackToDiscover: () => void
  onJumpToStep: (nextIndex: number) => void
  onToggleTimer: () => void
  onResetTimer: () => void
  onToggleVoice: () => void
  onPromptClick: (question: string) => void
  onAssistantInputChange: (value: string) => void
  onAssistantSubmit: () => void
  onFinishCooking: () => void
}

type StepMedia =
  | { kind: 'none' }
  | { kind: 'image'; url: string }
  | { kind: 'video'; url: string }
  | { kind: 'embed'; url: string; provider: 'bilibili' | 'youtube' }
  | { kind: 'external'; url: string }

type StepVideoSegment = {
  startSeconds: number
  endSeconds: number
}

function parseVideoUrl(value: string): URL | null {
  try {
    return new URL(value)
  } catch {
    return null
  }
}

function getYouTubeEmbedUrl(url: URL, segment?: StepVideoSegment): string | null {
  const host = url.hostname.replace(/^www\./, '')
  if (host === 'youtu.be') {
    const id = url.pathname.split('/').filter(Boolean)[0]
    return id ? `https://www.youtube.com/embed/${id}?rel=0&playsinline=1` : null
  }

  if (!host.endsWith('youtube.com')) {
    return null
  }

  const watchId = url.searchParams.get('v')
  const pathParts = url.pathname.split('/').filter(Boolean)
  const embeddedId =
    watchId ||
    (pathParts[0] === 'shorts' || pathParts[0] === 'embed' ? pathParts[1] : undefined)

  if (!embeddedId) {
    return null
  }

  const params = new URLSearchParams({
    rel: '0',
    playsinline: '1',
    start: String(Math.floor(segment?.startSeconds ?? 0)),
  })

  if (segment && segment.endSeconds > segment.startSeconds) {
    params.set('end', String(Math.floor(segment.endSeconds)))
  }

  return `https://www.youtube.com/embed/${embeddedId}?${params.toString()}`
}

function getBilibiliEmbedUrl(url: URL, segment?: StepVideoSegment): string | null {
  const segmentQuery = segment ? `&t=${Math.floor(segment.startSeconds)}` : ''
  const bvMatch = url.pathname.match(/\/video\/(BV[a-zA-Z0-9]+)/)
  if (bvMatch?.[1]) {
    return `https://player.bilibili.com/player.html?bvid=${bvMatch[1]}&page=1&high_quality=1&autoplay=0${segmentQuery}`
  }

  const avMatch = url.pathname.match(/\/video\/av(\d+)/i)
  if (avMatch?.[1]) {
    return `https://player.bilibili.com/player.html?aid=${avMatch[1]}&page=1&high_quality=1&autoplay=0${segmentQuery}`
  }

  return null
}

function resolveStepMedia(mediaUrl: string, segment?: StepVideoSegment): StepMedia {
  const trimmedUrl = mediaUrl.trim()
  if (!trimmedUrl) {
    return { kind: 'none' }
  }

  const lowerUrl = trimmedUrl.toLowerCase()
  if (/\.(svg|gif|webp|png|jpe?g)(\?|#|$)/.test(lowerUrl)) {
    return { kind: 'image', url: trimmedUrl }
  }

  if (
    /\.(mp4|webm|ogg|mov)(\?|#|$)/.test(lowerUrl) ||
    lowerUrl.includes('mime_type=video_mp4') ||
    lowerUrl.includes('video_mp4') ||
    lowerUrl.includes('douyinvod.com') ||
    lowerUrl.includes('bytecdn.cn') ||
    lowerUrl.includes('bilivideo.com') ||
    lowerUrl.includes('mcdn.bilivideo.cn') ||
    lowerUrl.includes('upos')
  ) {
    return { kind: 'video', url: trimmedUrl }
  }

  const parsedUrl = parseVideoUrl(trimmedUrl)
  if (!parsedUrl) {
    return { kind: 'external', url: trimmedUrl }
  }

  const bilibiliEmbedUrl = getBilibiliEmbedUrl(parsedUrl, segment)
  if (bilibiliEmbedUrl) {
    return { kind: 'embed', provider: 'bilibili', url: bilibiliEmbedUrl }
  }

  const youtubeEmbedUrl = getYouTubeEmbedUrl(parsedUrl, segment)
  if (youtubeEmbedUrl) {
    return { kind: 'embed', provider: 'youtube', url: youtubeEmbedUrl }
  }

  return { kind: 'external', url: trimmedUrl }
}

function getStepVideoSegment(recipe: Recipe, stepIndex: number): StepVideoSegment | undefined {
  const currentVideo = recipe.steps[stepIndex]?.video
  const explicitStart =
    typeof currentVideo?.startSeconds === 'number' && Number.isFinite(currentVideo.startSeconds)
      ? Math.max(0, currentVideo.startSeconds)
      : undefined
  const explicitEnd =
    typeof currentVideo?.endSeconds === 'number' && Number.isFinite(currentVideo.endSeconds)
      ? Math.max(0, currentVideo.endSeconds)
      : undefined

  if (explicitStart !== undefined && explicitEnd !== undefined && explicitEnd > explicitStart) {
    return {
      startSeconds: explicitStart,
      endSeconds: explicitEnd,
    }
  }

  return undefined
}

export function CookScreen({
  selectedRecipe,
  currentStep,
  currentStepIndex,
  timerLeft,
  isTimerRunning,
  voiceEnabled,
  voiceStatus,
  lastVoiceCommand,
  wakeWords,
  liveCoachNote,
  messages,
  quickPrompts,
  assistantInput,
  isAssistantLoading,
  isFinishing,
  onBackToDiscover,
  onJumpToStep,
  onToggleTimer,
  onResetTimer,
  onToggleVoice,
  onPromptClick,
  onAssistantInputChange,
  onAssistantSubmit,
  onFinishCooking,
}: CookScreenProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [offlineFrameIndex, setOfflineFrameIndex] = useState(0)
  const mediaUrl = currentStep.video?.url ?? ''
  const stepVideoSegment = getStepVideoSegment(selectedRecipe, currentStepIndex)
  const stepMedia = resolveStepMedia(mediaUrl, stepVideoSegment)

  useEffect(() => {
    setOfflineFrameIndex(0)
    const timer = window.setInterval(() => {
      setOfflineFrameIndex((previous) => (previous + 1) % currentStep.demoFrames.length)
    }, 1800)

    return () => window.clearInterval(timer)
  }, [currentStep.demoFrames])

  useEffect(() => {
    const video = videoRef.current
    if (!video || stepMedia.kind !== 'video') {
      return
    }

    const seekToStepStart = () => {
      if (stepVideoSegment && Number.isFinite(stepVideoSegment.startSeconds)) {
        video.currentTime = stepVideoSegment.startSeconds
      }
    }

    if (video.readyState >= HTMLMediaElement.HAVE_METADATA) {
      seekToStepStart()
    } else {
      video.addEventListener('loadedmetadata', seekToStepStart, { once: true })
    }

    return () => {
      video.removeEventListener('loadedmetadata', seekToStepStart)
    }
  }, [stepMedia.kind, stepMedia.kind === 'video' ? stepMedia.url : '', stepVideoSegment?.startSeconds])

  const stopAtStepEnd = (video: HTMLVideoElement) => {
    if (!stepVideoSegment) {
      return
    }

    if (video.currentTime >= stepVideoSegment.endSeconds) {
      video.pause()
      video.currentTime = stepVideoSegment.endSeconds
    }
  }

  return (
    <main className="cook-layout">
      <header className="cook-header">
        <button className="back-button ghost-button small-button" onClick={onBackToDiscover}>
          <span className="back-button-icon" aria-hidden="true">
            ←
          </span>
          <span>返回选菜</span>
        </button>
        <div className="cook-header-copy">
          <span className="eyebrow">跟做模式</span>
          <h2>{selectedRecipe.title}</h2>
          <p>
            第 {currentStepIndex + 1} / {selectedRecipe.steps.length} 步，专注做好眼前这一步。
          </p>
        </div>
        <div className="progress-block">
          <div className="progress-track progress-track-gradient">
            <div
              className="progress-value progress-value-animated"
              style={{
                width: `${((currentStepIndex + 1) / selectedRecipe.steps.length) * 100}%`,
              }}
            />
          </div>
          <span>{Math.round(((currentStepIndex + 1) / selectedRecipe.steps.length) * 100)}%</span>
        </div>
      </header>

      <div className="cook-primary-column">
        <section className="panel step-panel step-panel-active cook-page-section" data-page-kind="step">
          <div className="page-module-heading">
            <span className="section-kicker">页面 01</span>
            <h3>步骤操作</h3>
          </div>

          <div className="step-panel-head">
            <div>
              <span className="section-kicker">当前步骤</span>
              <h1 className="step-title">{currentStep.title}</h1>
            </div>
            <button
              className="ghost-button"
              onClick={() => {
                void speak(`第 ${currentStepIndex + 1} 步，${currentStep.title}。${currentStep.voiceover}`)
              }}
            >
              朗读这一步
            </button>
          </div>

          <p className="step-lead">{currentStep.instruction}</p>
          <p className="step-detail">{currentStep.detail}</p>

          <div className="timer-card">
            <div>
              <span className="section-kicker">步骤计时器</span>
              <h3>{formatTimer(timerLeft)}</h3>
              <p>默认按照当前步骤建议时长计时，也可以通过语音说“计时 3 分钟”。</p>
            </div>
            <div className="timer-actions">
              <button className="primary-button" onClick={onToggleTimer}>
                {isTimerRunning ? '暂停计时' : '开始计时'}
              </button>
              <button className="ghost-button" onClick={onResetTimer}>
                重置为建议时长
              </button>
            </div>
          </div>

          <div className="step-nav">
            <button
              className="ghost-button"
              disabled={currentStepIndex === 0}
              onClick={() => onJumpToStep(currentStepIndex - 1)}
            >
              上一步
            </button>
            {currentStepIndex < selectedRecipe.steps.length - 1 ? (
              <button className="primary-button" onClick={() => onJumpToStep(currentStepIndex + 1)}>
                下一步
              </button>
            ) : (
              <button className="primary-button" onClick={onFinishCooking} disabled={isFinishing}>
                {isFinishing ? '正在保存完成记录...' : '我做完了'}
              </button>
            )}
          </div>
        </section>

        <section className="panel cook-page-section cook-media-section" data-page-kind="media">
          <div className="page-module-heading">
            <span className="section-kicker">页面 02</span>
            <h3>动作演示</h3>
          </div>

          {currentStep.video && (
            <section className="step-video-card">
              <div className="step-video-head">
                <div>
                  <span className="section-kicker">
                    {stepMedia.kind === 'image' ? '本地离线演示' : '教学视频'}
                  </span>
                  <h3>{stepMedia.kind === 'external' ? '打开原视频对照跟做' : '边看边做'}</h3>
                </div>
              </div>
              {stepMedia.kind === 'image' ? (
                <img
                  className="step-video-player step-media-image"
                  src={stepMedia.url}
                  alt={`${currentStep.title} 离线动作演示`}
                />
              ) : stepMedia.kind === 'video' ? (
                <video
                  ref={videoRef}
                  key={`${stepMedia.url}-${stepVideoSegment?.startSeconds ?? 'full'}-${stepVideoSegment?.endSeconds ?? 'full'}`}
                  className="step-video-player"
                  src={stepMedia.url}
                  poster={currentStep.video.posterUrl}
                  controls
                  playsInline
                  preload="metadata"
                  onLoadedMetadata={(event) => {
                    if (stepVideoSegment) {
                      event.currentTarget.currentTime = stepVideoSegment.startSeconds
                    }
                  }}
                  onTimeUpdate={(event) => stopAtStepEnd(event.currentTarget)}
                >
                  当前浏览器不支持直接播放这个视频，请打开原视频链接查看。
                </video>
              ) : stepMedia.kind === 'embed' ? (
                <iframe
                  className="step-video-player step-video-frame"
                  src={stepMedia.url}
                  title={`${currentStep.title} 教学视频`}
                  allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                />
              ) : stepMedia.kind === 'external' ? (
                <div className="offline-video-player" role="group" aria-label={`${currentStep.title} 教学视频入口`}>
                  <div className="offline-video-stage video-open-stage">
                    <span className="offline-video-badge">原视频</span>
                    <strong>这个平台不允许页面内嵌播放</strong>
                    <p>你可以点下面的按钮打开原视频，对照当前步骤边看边做。</p>
                  </div>
                  <a className="primary-button video-open-link" href={stepMedia.url} target="_blank" rel="noreferrer">
                    打开教学视频
                  </a>
                </div>
              ) : (
                <div className="offline-video-player" role="img" aria-label={`${currentStep.title} 离线动作演示`}>
                  <div className="offline-video-stage">
                    <span className="offline-video-badge">{`动作 ${offlineFrameIndex + 1}`}</span>
                    <strong>{currentStep.demoFrames[offlineFrameIndex]}</strong>
                    <p>{currentStep.voiceover}</p>
                  </div>
                  <div className="offline-video-dots">
                    {currentStep.demoFrames.map((frame, index) => (
                      <button
                        key={frame}
                        className={`offline-video-dot ${index === offlineFrameIndex ? 'offline-video-dot-active' : ''}`}
                        onClick={() => setOfflineFrameIndex(index)}
                        aria-label={`查看动作 ${index + 1}`}
                      />
                    ))}
                  </div>
                </div>
              )}
              {stepMedia.kind !== 'image' && stepVideoSegment && (
                <p className="step-video-segment">
                  当前步骤片段：{formatTimer(stepVideoSegment.startSeconds)} - {formatTimer(stepVideoSegment.endSeconds)}
                </p>
              )}
              {stepMedia.kind !== 'image' && !stepVideoSegment && (
                <p className="step-video-segment">
                  暂无可靠时间轴：先播放完整原视频，对照当前步骤看关键动作。
                </p>
              )}
              <p className="step-video-caption">{currentStep.video.caption}</p>
              {currentStep.video.creditUrl && (
                <a className="video-credit-link" href={currentStep.video.creditUrl} target="_blank" rel="noreferrer">
                  {currentStep.video.creditLabel ?? '打开原始链接'}
                </a>
              )}
            </section>
          )}

          <div className="demo-board">
            {currentStep.demoFrames.map((frame, index) => (
              <article key={frame} className="demo-frame">
                <span>{`动作 ${index + 1}`}</span>
                <strong>{frame}</strong>
              </article>
            ))}
          </div>

          <div className="step-insight-grid">
            <article className="info-card emphasis-card">
              <span>观察重点</span>
              <strong>{currentStep.sensoryCue}</strong>
              <ul>
                {currentStep.checkpoints.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </article>

            <article className="info-card">
              <span>最容易翻车的地方</span>
              <ul>
                {currentStep.commonMistakes.map((mistake) => (
                  <li key={mistake}>{mistake}</li>
                ))}
              </ul>
            </article>
          </div>
        </section>
      </div>

      <aside className="panel coach-panel cook-page-section cook-support-section" data-page-kind="coach">
        <div className="page-module-heading">
          <span className="section-kicker">页面 03</span>
          <h3>语音与教练</h3>
        </div>

        <section className="coach-note coach-note-accent">
          <span className="section-kicker">实时提醒</span>
          <h3>AI 厨房教练</h3>
          <p>{liveCoachNote}</p>
        </section>

        <section className="voice-panel">
          <div className="voice-header">
            <div>
              <span className="section-kicker">免手动操作</span>
              <h3>语音控制</h3>
            </div>
            <button
              className={`toggle-button voice-toggle ${voiceEnabled ? 'voice-toggle-active' : ''}`}
              onClick={onToggleVoice}
              aria-pressed={voiceEnabled}
            >
              <span className="voice-toggle-dot" aria-hidden="true" />
              <span>{voiceEnabled ? '持续监听中' : '开启监听'}</span>
            </button>
          </div>
          <p>
            {voiceStatus === 'unsupported'
              ? '当前浏览器不支持语音识别，仍然可以通过按钮操作。'
              : voiceEnabled
                ? `持续监听中：可以说“${wakeWords.join('”或“')}，下一步”，也可以直接问做菜问题。`
                : `开启后会持续监听，用语音切换步骤、朗读步骤和启动计时。当前唤醒词：${wakeWords.join(' / ')}。`}
          </p>
          {lastVoiceCommand && (
            <div className="last-command">
              <span>最近识别到</span>
              <strong>{lastVoiceCommand}</strong>
            </div>
          )}
        </section>

        <section className="prompt-panel">
          <span className="section-kicker">一键求助</span>
          <h3>先问最常见的问题</h3>
          <div className="prompt-grid">
            {quickPrompts.map((prompt) => (
              <button
                key={prompt}
                className="prompt-chip"
                onClick={() => onPromptClick(prompt)}
                disabled={isAssistantLoading}
              >
                {prompt}
              </button>
            ))}
          </div>
        </section>

        <section className="chat-panel">
          <div className="chat-log">
            {messages.map((message) => (
              <article
                key={message.id}
                className={`chat-bubble ${
                  message.role === 'assistant' ? 'assistant-bubble' : 'user-bubble'
                }`}
              >
                <span>{message.role === 'assistant' ? 'AI 教练' : '我'}</span>
                <p>{message.text}</p>
              </article>
            ))}
            {isAssistantLoading && (
              <article className="chat-bubble assistant-bubble">
                <span>AI 教练</span>
                <p>正在结合当前菜谱和步骤状态生成回复...</p>
              </article>
            )}
          </div>

          <form
            className="chat-form"
            onSubmit={(event) => {
              event.preventDefault()
              onAssistantSubmit()
            }}
          >
            <textarea
              value={assistantInput}
              onChange={(event) => onAssistantInputChange(event.target.value)}
              rows={3}
              placeholder="例如：这一步做到什么程度算好？或者：太咸了怎么办？"
            />
            <button className="primary-button" type="submit" disabled={isAssistantLoading}>
              {isAssistantLoading ? 'AI 正在思考...' : '问 AI 教练'}
            </button>
          </form>
        </section>

        <section className="rescue-panel">
          <span className="section-kicker">快捷补救</span>
          <h3>常见翻车一键处理</h3>
          <div className="prompt-grid">
            {selectedRecipe.rescueTips.map((tip) => (
              <button
                key={tip.issue}
                className="prompt-chip rescue-chip"
                onClick={() => onPromptClick(tip.issue)}
                disabled={isAssistantLoading}
              >
                {tip.issue}
              </button>
            ))}
          </div>
        </section>
      </aside>
    </main>
  )
}
