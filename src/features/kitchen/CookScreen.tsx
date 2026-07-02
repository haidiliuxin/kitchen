import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { formatTimer, speak, stopSpeak } from './shared.js'
import type { ChatMessage, VoiceStatus } from './shared.js'
import type { Recipe, Step } from '../../types.js'
import { buildMediaProxyUrl } from '../../lib/api.js'

type CookScreenProps = {
  selectedRecipe: Recipe
  currentStep: Step
  currentStepIndex: number
  voiceEnabled: boolean
  voiceStatus: VoiceStatus
  autoPlayRequest: number
  timerLeft: number
  timerVisible: boolean
  timerFinished: boolean
  isTimerRunning: boolean
  messages: ChatMessage[]
  assistantInput: string
  isAssistantLoading: boolean
  isFinishing: boolean
  onBackToDiscover: () => void
  onJumpToStep: (nextIndex: number) => void
  onStartTimer: (durationSeconds: number) => void
  onToggleTimer: () => void
  onCancelTimer: () => void
  onToggleVoice: () => void
  onCommandFeedback: (userText: string, assistantText: string) => void
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

type StepVideoOverlayProps = {
  title: string
  media: StepMedia
  segment?: StepVideoSegment
  posterUrl?: string
  onClose: () => void
  onPlaybackComplete: () => void
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
    lowerUrl.startsWith('blob:') ||
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

function shouldProxyVideoUrl(url: string): boolean {
  const lowerUrl = url.toLowerCase()
  return (
    lowerUrl.includes('bilivideo.com') ||
    lowerUrl.includes('mcdn.bilivideo.cn') ||
    lowerUrl.includes('douyinvod.com') ||
    lowerUrl.includes('bytecdn.cn') ||
    lowerUrl.includes('byteimg.com') ||
    lowerUrl.includes('upos') ||
    lowerUrl.includes('mime_type=video_mp4')
  )
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

function buildStepCoachMessage(step: Step): string {
  const parts: string[] = []
  parts.push(`这一步是“${step.title}”。${step.instruction}`)

  const primaryTip = step.checkpoints?.[0] ?? step.sensoryCue
  if (primaryTip) {
    parts.push(primaryTip)
  }

  const mistake = step.commonMistakes?.[0]
  if (mistake) {
    parts.push(`注意不要${mistake.replace(/[。！？.!?]$/, '')}。`)
  }

  return parts.slice(0, 4).join(' ')
}

function isBootAssistantMessage(message: ChatMessage, index: number): boolean {
  return (
    index === 0 &&
    message.role === 'assistant' &&
    (/我会结合当前步骤/.test(message.text) || /已生成《/.test(message.text) || /已根据视频解析出/.test(message.text))
  )
}

function StepVideoOverlay({
  title,
  media,
  segment,
  posterUrl,
  onClose,
  onPlaybackComplete,
}: StepVideoOverlayProps) {
  const overlayRef = useRef<HTMLDivElement | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [isPlaybackBlocked, setIsPlaybackBlocked] = useState(false)

  const closeOverlay = useCallback(() => {
    videoRef.current?.pause()
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => undefined)
    }
    onClose()
  }, [onClose])

  const retryPlayback = useCallback(() => {
    const video = videoRef.current
    if (!video) {
      return
    }

    video.currentTime = Math.max(0, segment?.startSeconds ?? 0)
    setIsPlaybackBlocked(false)
    void video.play().catch(() => setIsPlaybackBlocked(true))
  }, [segment?.startSeconds])

  useEffect(() => {
    const overlay = overlayRef.current
    const video = videoRef.current
    if (!video || media.kind !== 'video') {
      return
    }

    let closed = false
    const startSeconds = segment?.startSeconds ?? 0
    const endSeconds = segment?.endSeconds

    const closeAfterPlayback = () => {
      if (closed) {
        return
      }
      closed = true
      video.pause()
      onPlaybackComplete()
      closeOverlay()
    }

    const seekAndPlay = () => {
      video.currentTime = Math.max(0, startSeconds)
      setIsPlaybackBlocked(false)
      void video.play().catch(() => setIsPlaybackBlocked(true))
    }

    const handleTimeUpdate = () => {
      if (typeof endSeconds === 'number' && video.currentTime >= endSeconds) {
        closeAfterPlayback()
      }
    }

    video.addEventListener('timeupdate', handleTimeUpdate)
    if (video.readyState >= HTMLMediaElement.HAVE_METADATA) {
      seekAndPlay()
    } else {
      video.addEventListener('loadedmetadata', seekAndPlay, { once: true })
    }

    if (overlay?.requestFullscreen) {
      void overlay.requestFullscreen().catch(() => undefined)
    }

    return () => {
      closed = true
      video.pause()
      video.removeEventListener('timeupdate', handleTimeUpdate)
      video.removeEventListener('loadedmetadata', seekAndPlay)
    }
  }, [closeOverlay, media.kind, onPlaybackComplete, segment?.endSeconds, segment?.startSeconds])

  return (
    <div className="step-video-overlay" ref={overlayRef} role="dialog" aria-modal="true">
      <header className="step-video-overlay-header">
        <div>
          <span>当前片段</span>
          <strong>{title}</strong>
          <p>{segment ? `${formatTimer(segment.startSeconds)} - ${formatTimer(segment.endSeconds)}` : '暂无对应视频片段'}</p>
        </div>
        <button className="ghost-button step-video-overlay-close" onClick={closeOverlay}>
          关闭
        </button>
      </header>

      <div className="step-video-overlay-stage">
        {media.kind === 'video' ? (
          <>
            <video
              ref={videoRef}
              className="step-video-overlay-player"
              src={media.url}
              poster={posterUrl}
              controls
              playsInline
              preload="metadata"
            />
            {isPlaybackBlocked ? (
              <div className="step-video-playback-prompt">
                <strong>点击播放当前步骤视频</strong>
                <p>设备限制了自动播放，点一下即可继续。</p>
                <button className="primary-button" onClick={retryPlayback}>
                  点击播放当前步骤视频
                </button>
              </div>
            ) : null}
          </>
        ) : (
          <div className="step-video-overlay-empty">
            <strong>视频暂不可播放</strong>
            <p>当前步骤没有可直接播放的视频地址，请先使用手动步骤继续跟做。</p>
          </div>
        )}
      </div>

      <p className="step-video-overlay-hint">播放结束后将自动回到当前步骤。</p>
    </div>
  )
}

export function CookScreen({
  selectedRecipe,
  currentStep,
  currentStepIndex,
  voiceEnabled,
  voiceStatus,
  autoPlayRequest,
  timerLeft,
  timerVisible,
  timerFinished,
  isTimerRunning,
  messages,
  assistantInput,
  isAssistantLoading,
  isFinishing,
  onBackToDiscover,
  onJumpToStep,
  onStartTimer,
  onToggleTimer,
  onCancelTimer,
  onToggleVoice,
  onCommandFeedback,
  onPromptClick,
  onAssistantInputChange,
  onAssistantSubmit,
  onFinishCooking,
}: CookScreenProps) {
  const [isVideoOverlayOpen, setIsVideoOverlayOpen] = useState(false)
  const [videoNotice, setVideoNotice] = useState('')
  const [autoPlayStepIndex, setAutoPlayStepIndex] = useState<number | null>(null)
  const [coachHighlightToken, setCoachHighlightToken] = useState(0)
  const [isSpeakingStep, setIsSpeakingStep] = useState(false)
  const lastAutoPlayRequestRef = useRef(0)
  const hasPlayedInitialSegmentRef = useRef(false)
  const lastVideoSpokenStepRef = useRef<number | null>(null)
  const voicePointerHandledRef = useRef(false)
  const chatLogRef = useRef<HTMLDivElement | null>(null)
  const stepCoachBubbleRef = useRef<HTMLElement | null>(null)

  const mediaUrl = currentStep.video?.url ?? ''
  const stepVideoSegment = getStepVideoSegment(selectedRecipe, currentStepIndex)
  const stepMedia = resolveStepMedia(mediaUrl, stepVideoSegment)
  const playableStepMedia =
    stepMedia.kind === 'video' && shouldProxyVideoUrl(stepMedia.url)
      ? {
          ...stepMedia,
          url: buildMediaProxyUrl(stepMedia.url, currentStep.video?.creditUrl ?? selectedRecipe.steps[0]?.video?.creditUrl),
        }
      : stepMedia
  const stepCoachMessage = useMemo(() => buildStepCoachMessage(currentStep), [currentStep])
  const visibleMessages = messages.filter((message, index) => !isBootAssistantMessage(message, index))

  useEffect(() => {
    setCoachHighlightToken((previous) => previous + 1)
  }, [currentStepIndex])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const chatLog = chatLogRef.current
      if (chatLog) {
        chatLog.scrollTo({
          top: 0,
          behavior: 'smooth',
        })
        return
      }

      stepCoachBubbleRef.current?.scrollIntoView({
        block: 'start',
        behavior: 'smooth',
      })
    }, 80)

    return () => window.clearTimeout(timer)
  }, [currentStepIndex, coachHighlightToken])

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const chatLog = chatLogRef.current
      if (!chatLog) {
        return
      }

      chatLog.scrollTo({
        top: chatLog.scrollHeight,
        behavior: 'smooth',
      })
    })

    return () => window.cancelAnimationFrame(frame)
  }, [visibleMessages.length, isAssistantLoading])

  const startStepCoachSpeech = useCallback(async () => {
    setIsSpeakingStep(true)
    try {
      await speak(stepCoachMessage)
    } finally {
      setIsSpeakingStep(false)
    }
  }, [stepCoachMessage])

  const toggleStepCoachSpeech = useCallback(() => {
    if (isSpeakingStep) {
      void stopSpeak().finally(() => setIsSpeakingStep(false))
      return
    }

    void startStepCoachSpeech()
  }, [isSpeakingStep, startStepCoachSpeech])

  useEffect(() => {
    void stopSpeak().finally(() => setIsSpeakingStep(false))
  }, [currentStepIndex])

  useEffect(() => {
    return () => {
      void stopSpeak()
    }
  }, [])

  const handleVideoPlaybackComplete = useCallback(() => {
    setCoachHighlightToken((previous) => previous + 1)
    if (lastVideoSpokenStepRef.current !== currentStepIndex) {
      lastVideoSpokenStepRef.current = currentStepIndex
      void startStepCoachSpeech()
    }
  }, [currentStepIndex, startStepCoachSpeech])

  const triggerVoiceCommand = useCallback(() => {
    void stopSpeak().finally(() => setIsSpeakingStep(false))
    onToggleVoice()
  }, [onToggleVoice])

  const handleVoicePointerDown = useCallback((event: PointerEvent<HTMLButtonElement>) => {
    event.preventDefault()
    voicePointerHandledRef.current = true
    triggerVoiceCommand()
    window.setTimeout(() => {
      voicePointerHandledRef.current = false
    }, 350)
  }, [triggerVoiceCommand])

  const handleVoiceClick = useCallback(() => {
    if (voicePointerHandledRef.current) {
      return
    }

    triggerVoiceCommand()
  }, [triggerVoiceCommand])

  const handleVoiceKeyDown = useCallback((event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') {
      return
    }

    event.preventDefault()
    voicePointerHandledRef.current = true
    triggerVoiceCommand()
    window.setTimeout(() => {
      voicePointerHandledRef.current = false
    }, 350)
  }, [triggerVoiceCommand])

  const openStepVideo = useCallback(() => {
    if (!mediaUrl.trim()) {
      setVideoNotice('视频暂不可播放')
      return
    }

    if (!stepVideoSegment) {
      setVideoNotice('当前步骤暂无对应视频片段')
      return
    }

    if (playableStepMedia.kind !== 'video') {
      setVideoNotice('视频暂不可播放')
      return
    }

    setVideoNotice('')
    setIsVideoOverlayOpen(true)
  }, [mediaUrl, playableStepMedia.kind, stepVideoSegment])

  const goToNextStep = useCallback(() => {
    if (currentStepIndex >= selectedRecipe.steps.length - 1) {
      onCommandFeedback('下一步', '已进入完成页')
      onFinishCooking()
      return
    }

    const nextIndex = currentStepIndex + 1
    setAutoPlayStepIndex(nextIndex)
    onJumpToStep(nextIndex)
    onCommandFeedback('下一步', '已切换到下一步')
  }, [currentStepIndex, onCommandFeedback, onFinishCooking, onJumpToStep, selectedRecipe.steps.length])

  const goToPreviousStep = useCallback(() => {
    onJumpToStep(currentStepIndex - 1)
    onCommandFeedback('上一步', currentStepIndex === 0 ? '已经是第一步了' : '已返回上一步')
  }, [currentStepIndex, onCommandFeedback, onJumpToStep])

  const playCurrentStepVideo = useCallback(() => {
    openStepVideo()
    onCommandFeedback('播放视频', '正在播放当前步骤视频')
  }, [onCommandFeedback, openStepVideo])

  useEffect(() => {
    if (autoPlayStepIndex !== currentStepIndex) {
      return
    }

    setAutoPlayStepIndex(null)
    window.setTimeout(openStepVideo, 80)
  }, [autoPlayStepIndex, currentStepIndex, openStepVideo])

  useEffect(() => {
    if (autoPlayRequest === lastAutoPlayRequestRef.current) {
      return
    }

    lastAutoPlayRequestRef.current = autoPlayRequest
    if (autoPlayRequest > 0) {
      window.setTimeout(openStepVideo, 80)
    }
  }, [autoPlayRequest, openStepVideo])

  useEffect(() => {
    if (hasPlayedInitialSegmentRef.current) {
      return
    }

    hasPlayedInitialSegmentRef.current = true
    const timer = window.setTimeout(openStepVideo, 1000)
    return () => window.clearTimeout(timer)
  }, [openStepVideo])

  return (
    <main className="cook-layout cook-layout-focused">
      <header className="cook-header cook-header-focused">
        <button className="back-button ghost-button small-button cook-back-button" onClick={onBackToDiscover}>
          <span className="back-button-icon" aria-hidden="true">←</span>
          <span>返回备菜</span>
        </button>
        <div className="cook-header-copy">
          <span className="eyebrow">当前步骤</span>
          <h2>{currentStep.title}</h2>
          {videoNotice ? <p className="step-video-notice">{videoNotice}</p> : null}
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
          <span>{currentStepIndex + 1} / {selectedRecipe.steps.length}</span>
        </div>
      </header>

      <section className="panel voice-panel voice-panel-compact cook-voice-strip">
        <button
          className={`toggle-button voice-toggle voice-toggle-large ${voiceEnabled ? 'voice-toggle-active' : ''}`}
          onPointerDown={handleVoicePointerDown}
          onClick={handleVoiceClick}
          onKeyDown={handleVoiceKeyDown}
          aria-pressed={voiceEnabled}
        >
          <span className="voice-toggle-dot" aria-hidden="true" />
          <span>{voiceEnabled ? '正在听...' : '点击说话'}</span>
        </button>
        {voiceStatus === 'unsupported' ? (
          <p className="voice-support-note">当前设备不支持语音识别，可直接使用按钮和文字提问。</p>
        ) : null}
        <div className="voice-command-grid">
          <button className="prompt-chip" onClick={goToNextStep}>
            下一步
          </button>
          <button className="prompt-chip" onClick={playCurrentStepVideo}>
            播放视频
          </button>
          <button
            className="prompt-chip"
            onClick={() => {
              onStartTimer(180)
              onCommandFeedback('计时三分钟', '已开始 3 分钟计时')
            }}
          >
            计时三分钟
          </button>
          <button
            className="prompt-chip"
            onClick={() => {
              onPromptClick('锅糊了怎么办')
            }}
            disabled={isAssistantLoading}
          >
            锅糊了怎么办
          </button>
        </div>
      </section>

      <section className="panel chat-panel coach-answer-panel cook-coach-panel">
        <div className="coach-answer-heading">
          <h3>小白厨房教练</h3>
          <button className="ghost-button small-button" onClick={toggleStepCoachSpeech}>
            {isSpeakingStep ? '停止朗读' : '朗读这一步'}
          </button>
        </div>
        {timerVisible || timerFinished ? (
          <section className={`coach-timer-card ${timerFinished ? 'coach-timer-card-done' : ''}`}>
            <span>小白正在帮你计时</span>
            <strong>{timerFinished ? '时间到了' : formatTimer(timerLeft)}</strong>
            <p className="coach-timer-step">{currentStep.title}</p>
            <p>{timerFinished ? '时间到了，可以继续了' : '倒计时结束后，我会提醒你继续'}</p>
            {timerFinished ? (
              <button className="ghost-button small-button" onClick={onCancelTimer}>
                收起
              </button>
            ) : (
              <div className="coach-timer-actions">
                <button className="ghost-button small-button" onClick={onToggleTimer}>
                  {isTimerRunning ? '暂停' : '继续'}
                </button>
                <button className="ghost-button small-button" onClick={onCancelTimer}>
                  取消
                </button>
              </div>
            )}
          </section>
        ) : null}
        <div className="chat-log" ref={chatLogRef}>
          <article
            ref={stepCoachBubbleRef}
            key={`step-${currentStepIndex}-${coachHighlightToken}`}
            className="chat-bubble assistant-bubble step-coach-bubble"
          >
            <span>小白 · 当前步骤说明</span>
            <p>{stepCoachMessage}</p>
          </article>

          {visibleMessages.map((message) => (
            <article
              key={message.id}
              className={`chat-bubble ${message.role === 'assistant' ? 'assistant-bubble' : 'user-bubble'}`}
            >
              <span>{message.role === 'assistant' ? '小白' : '我'}</span>
              <p>{message.text}</p>
            </article>
          ))}
          {isAssistantLoading && (
            <article className="chat-bubble assistant-bubble">
              <span>小白</span>
              <p>正在结合当前菜谱和步骤状态生成回答...</p>
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
            placeholder="例如：水淀粉是什么？要不要加番茄酱？"
          />
          <button className="primary-button" type="submit" disabled={isAssistantLoading}>
            {isAssistantLoading ? '小白正在思考...' : '问 AI 教练'}
          </button>
        </form>
      </section>

      <div className="step-nav step-nav-focused">
        <button className="ghost-button" disabled={currentStepIndex === 0} onClick={goToPreviousStep}>
          上一步
        </button>
        <button className="ghost-button step-nav-video-button" onClick={playCurrentStepVideo}>
          播放视频
        </button>
        {currentStepIndex < selectedRecipe.steps.length - 1 ? (
          <button className="primary-button" onClick={goToNextStep}>
            下一步
          </button>
        ) : (
          <button className="primary-button" onClick={onFinishCooking} disabled={isFinishing}>
            {isFinishing ? '保存中...' : '我做完了'}
          </button>
        )}
      </div>

      {isVideoOverlayOpen ? (
        <StepVideoOverlay
          title={currentStep.title}
          media={playableStepMedia}
          segment={stepVideoSegment}
          posterUrl={currentStep.video?.posterUrl}
          onClose={() => setIsVideoOverlayOpen(false)}
          onPlaybackComplete={handleVideoPlaybackComplete}
        />
      ) : null}
    </main>
  )
}
