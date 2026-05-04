import { useEffect, useState } from 'react'
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

export function CookScreen({
  selectedRecipe,
  currentStep,
  currentStepIndex,
  timerLeft,
  isTimerRunning,
  voiceEnabled,
  voiceStatus,
  lastVoiceCommand,
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
  const [offlineFrameIndex, setOfflineFrameIndex] = useState(0)
  const mediaUrl = currentStep.video?.url ?? ''
  const isAnimatedImage = mediaUrl.endsWith('.svg') || mediaUrl.endsWith('.gif') || mediaUrl.endsWith('.webp')

  useEffect(() => {
    setOfflineFrameIndex(0)
    const timer = window.setInterval(() => {
      setOfflineFrameIndex((previous) => (previous + 1) % currentStep.demoFrames.length)
    }, 1800)

    return () => window.clearInterval(timer)
  }, [currentStep.demoFrames])

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
            <h3>动作演示</h3>
          </div>

          {currentStep.video && (
            <section className="step-video-card">
              {isAnimatedImage ? (
                <img
                  className="step-video-player step-media-image"
                  src={mediaUrl}
                  alt={`${currentStep.title} 离线动作演示`}
                />
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
              <p className="step-video-caption">{currentStep.video.caption}</p>
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
              <span>{voiceEnabled ? '已开启' : '已关闭'}</span>
            </button>
          </div>
          <p>
            {voiceStatus === 'unsupported'
              ? '当前浏览器不支持语音识别，仍然可以通过按钮操作。'
              : voiceEnabled
                ? '正在监听：你可以说“下一步”“重复一遍”或“计时 3 分钟”。'
                : '开启后可以用语音切换步骤、朗读步骤和启动计时。'}
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
