import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import {
  analyzeLocalVideo,
  askDemoCoach,
  type DemoAnalyzeFailureResponse,
  type DemoAnalyzeVideoResponse,
  type DemoStructuredRecipe,
} from './lib/api.js'
import type { MissingIngredient, PrepPlan, Recipe, Step } from './types.js'
import { CookScreen } from './features/kitchen/CookScreen.js'
import { PrepScreen } from './features/kitchen/PrepScreen.js'
import { createMessage, speak, type ChatMessage, type VoiceStatus } from './features/kitchen/shared.js'
import {
  createSpeechRecognition,
  ensureNativeSpeechPermission,
  extractFinalTranscripts,
  isNativeSpeechPlatform,
  isSpeechRecognitionSupported,
  startNativeRecognitionOnce,
  stopNativeRecognition,
} from './features/kitchen/speechRecognition.js'
import { parseVoiceIntent } from './features/kitchen/voiceIntent.js'

type DemoStage = 'landing' | 'analyzing' | 'prep' | 'cook' | 'finish' | 'failed'

const emptyMessages = [
  createMessage('assistant', '我会结合当前步骤回答问题。也可以点“点击说话”，说“下一步”“计时 3 分钟”或直接问做菜问题。'),
]

function formatVoiceTimerDuration(seconds: number): string {
  const minutes = Math.round(seconds / 60)
  return minutes > 0 ? `${minutes} 分钟` : `${seconds} 秒`
}

const demoFixedIngredients = [
  { name: '西红柿', amount: '3 个' },
  { name: '鸡蛋', amount: '6 个' },
  { name: '水', amount: '50g' },
  { name: '水淀粉', amount: '少许' },
  { name: '盐', amount: '3g' },
  { name: '食用油', amount: '20g' },
  { name: '猪油', amount: '半勺' },
  { name: '生抽', amount: '20g' },
  { name: '糖', amount: '5g' },
  { name: '红葱油', amount: '一勺' },
  { name: '葱花', amount: '一撮' },
]

const demoFixedSteps = [
  {
    title: '西红柿去皮去蒂切碎',
    instruction: '把西红柿去皮、去蒂，再切碎，方便后面快速炒出汁。',
    startTime: 14,
    endTime: 19,
    tips: ['切得细一点，后面更容易炒出番茄汁。'],
    commonMistakes: ['西红柿块太大，后面出汁慢。'],
  },
  {
    title: '加水盐水淀粉打散鸡蛋',
    instruction: '碗中打 6 个鸡蛋，加 50g 水、3g 盐，倒入蛋中打散，再加入少许水淀粉搅拌均匀。',
    startTime: 19,
    endTime: 29,
    tips: ['加入少许水淀粉，炒出来的蛋会更滑。'],
    commonMistakes: ['蛋液没有充分打散，炒出来容易一块一块不均匀。'],
  },
  {
    title: '四成油温炒鸡蛋',
    instruction: '锅中加 20g 食用油，四成油温下蛋液，把鸡蛋炒到定型后盛出。',
    startTime: 29,
    endTime: 37,
    tips: ['要炒定型，如果不炒定型蛋就容易散掉。'],
    commonMistakes: ['火太大或炒太久，鸡蛋会变老。'],
  },
  {
    title: '另起锅炒西红柿',
    instruction: '另起锅，加半勺猪油，放入切好的西红柿翻炒出汁。',
    startTime: 37,
    endTime: 47,
    tips: ['先把西红柿炒软、炒出红色汤汁。'],
    commonMistakes: ['西红柿还没出汁就急着倒鸡蛋，味道不容易融合。'],
  },
  {
    title: '加生抽糖焖炒',
    instruction: '调味加生抽 20g、糖 5g，倒入炒好的鸡蛋焖炒，最后淋一勺红葱油。',
    startTime: 47,
    endTime: 59,
    tips: ['鸡蛋回锅后轻轻翻匀，让蛋裹上番茄汁。'],
    commonMistakes: ['翻炒太用力会把鸡蛋压碎。'],
  },
  {
    title: '装盘撒葱花',
    instruction: '出锅装盘，撒一撮葱花完成。',
    startTime: 59,
    endTime: 64,
    tips: ['装盘前确认汤汁不要收得太干。'],
    commonMistakes: ['最后收汁过久，口感会变干。'],
  },
]

function isAnalyzeSuccess(response: DemoAnalyzeVideoResponse): response is DemoAnalyzeVideoResponse & { success?: true } {
  return response.success !== false
}

function readVideoDuration(file: File): Promise<number | undefined> {
  return new Promise((resolve) => {
    const objectUrl = URL.createObjectURL(file)
    const video = document.createElement('video')

    const cleanup = () => {
      URL.revokeObjectURL(objectUrl)
      video.removeAttribute('src')
      video.load()
    }

    video.preload = 'metadata'
    video.onloadedmetadata = () => {
      const duration = Number.isFinite(video.duration) ? video.duration : undefined
      cleanup()
      resolve(duration)
    }
    video.onerror = () => {
      cleanup()
      resolve(undefined)
    }
    video.src = objectUrl
  })
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`
  }

  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function getStepMinutes(step: { startTime: number; endTime: number }): number {
  const seconds = Math.max(1, step.endTime - step.startTime)
  return Math.max(1, Math.round(seconds / 60))
}

function toDemoFrames(step: {
  title: string
  instruction: string
  tips: string[]
  commonMistakes: string[]
}): [string, string, string] {
  return [
    step.title || '查看当前动作',
    step.tips[0] || step.instruction.slice(0, 24) || '按视频步骤操作',
    step.commonMistakes[0] || '确认状态后再继续',
  ]
}

function recipeFromAnalyzedVideo(
  analyzed: DemoStructuredRecipe,
  videoUrl: string,
  originalName: string,
): Recipe {
  const steps: Step[] = demoFixedSteps.map((step) => ({
    title: step.title,
    instruction: step.instruction,
    detail: [step.instruction, ...step.tips].filter(Boolean).join(' '),
    durationMinutes: getStepMinutes(step),
    sensoryCue: step.tips[0] ?? '观察画面和锅内状态，确认到位后再继续。',
    checkpoints: step.tips.length > 0 ? step.tips : ['对照视频关键帧确认当前状态'],
    commonMistakes: step.commonMistakes.length > 0 ? step.commonMistakes : ['不要跳过视频里已经识别出的关键动作'],
    demoFrames: toDemoFrames(step),
    voiceover: `${step.title}。${step.instruction}`,
    video: {
      url: videoUrl,
      caption: `来自上传视频 ${originalName} 的真实时间片段`,
      creditLabel: '本地上传视频',
      startSeconds: step.startTime,
      endSeconds: step.endTime,
      posterUrl: analyzed.steps.find((item) => Math.abs(item.startTime - step.startTime) <= 5)?.keyFrameUrl,
    },
  }))

  return {
    id: `demo-video-${Date.now()}`,
    title: '西红柿炒蛋',
    subtitle: '由本地视频 OCR 触发解析，演示版按固定菜谱校准',
    scene: '复赛演示主链路',
    difficulty: '零失败',
    duration: steps.reduce((total, step) => total + step.durationMinutes, 0),
    servings: 2,
    highlight: '按演示视频的人工校准时间轴拆成一步一屏，适合现场跟做演示。',
    riskNote: '解析成功后使用演示视频校准菜谱；解析失败仍明确失败，不回退为假菜谱。',
    description: '本轮复赛演示固定使用西红柿炒蛋视频，食材用量和时间轴按人工校准版本展示。',
    tags: ['视频解析', 'AI 跟做', '复赛演示'],
    searchTokens: ['西红柿炒蛋', '西红柿', '鸡蛋'],
    tools: ['锅', '刀', '砧板', '碗', '铲子'],
    ingredients: demoFixedIngredients,
    substitutions: [],
    rescueTips: analyzed.steps
      .filter((step) => step.rescue)
      .map((step) => ({
        issue: `${step.title} 出问题怎么办`,
        keywords: [step.title],
        answer: step.rescue,
      })),
    steps,
    palette: {
      start: '#fed7aa',
      end: '#fb923c',
    },
    sourceType: 'imported',
    visibility: 'private',
  }
}

function prepPlanFromRecipe(
  recipe: Recipe,
  requestedServings: number,
  missingIngredients: MissingIngredient[],
): PrepPlan {
  const ratio = requestedServings / Math.max(1, recipe.servings)

  return {
    recipeId: recipe.id,
    recipeTitle: recipe.title,
    requestedServings,
    baseServings: recipe.servings,
    sourceType: recipe.sourceType ?? 'imported',
    ingredients: recipe.ingredients.map((ingredient) => ({
      name: ingredient.name,
      originalAmount: ingredient.amount,
      scaledAmount: ratio === 1 ? ingredient.amount : `${ingredient.amount} x ${ratio.toFixed(1)}`,
      note: missingIngredients.some((item) => item.name === ingredient.name)
        ? '已标记为还没准备好，请确认后再开始'
        : '来自视频解析',
    })),
    tools: recipe.tools,
    shoppingLinks: [],
    note: missingIngredients.length > 0
      ? '有食材被标记为还没准备好。请按现场实际情况确认后再进入跟做。'
      : '确认食材和工具都在手边，再进入跟做。',
  }
}

function startWebRecognitionOnce(): Promise<string> {
  return new Promise((resolve, reject) => {
    const recognition = createSpeechRecognition()
    if (!recognition) {
      reject(new Error('当前浏览器不支持语音识别。'))
      return
    }

    let settled = false
    const timeout = window.setTimeout(() => {
      if (settled) {
        return
      }
      settled = true
      recognition.abort()
      reject(new Error('没有识别到语音，请再试一次。'))
    }, 10000)

    const finish = (text: string) => {
      if (settled) {
        return
      }
      settled = true
      window.clearTimeout(timeout)
      recognition.onresult = null
      recognition.onerror = null
      recognition.onend = null
      recognition.stop()
      resolve(text)
    }

    recognition.lang = 'zh-CN'
    recognition.continuous = false
    recognition.interimResults = false
    recognition.maxAlternatives = 3
    recognition.onresult = (event) => {
      const transcript = extractFinalTranscripts(event).join(' ').trim()
      if (transcript) {
        finish(transcript)
      }
    }
    recognition.onerror = (event) => {
      if (settled) {
        return
      }
      settled = true
      window.clearTimeout(timeout)
      reject(new Error(event.message || event.error || '语音识别失败。'))
    }
    recognition.onend = () => {
      if (!settled) {
        settled = true
        window.clearTimeout(timeout)
        reject(new Error('没有识别到语音，请再试一次。'))
      }
    }
    recognition.start()
  })
}

async function recognizeSpeechOnce(): Promise<string> {
  if (isNativeSpeechPlatform()) {
    const permission = await ensureNativeSpeechPermission()
    if (permission !== 'granted') {
      throw new Error('请允许麦克风/语音识别权限后再试。')
    }

    const matches = await startNativeRecognitionOnce('zh-CN', false)
    await stopNativeRecognition()
    return matches.find((item) => item.trim())?.trim() ?? ''
  }

  if (isSpeechRecognitionSupported()) {
    return startWebRecognitionOnce()
  }

  return ''
}

function App() {
  const [stage, setStage] = useState<DemoStage>('landing')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [recipe, setRecipe] = useState<Recipe | null>(null)
  const [analysisMessage, setAnalysisMessage] = useState('')
  const [failure, setFailure] = useState<DemoAnalyzeFailureResponse | null>(null)
  const [currentStepIndex, setCurrentStepIndex] = useState(0)
  const [, setTimerLeft] = useState(0)
  const [isTimerRunning, setIsTimerRunning] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>(emptyMessages)
  const [assistantInput, setAssistantInput] = useState('')
  const [isAssistantLoading, setIsAssistantLoading] = useState(false)
  const [isListeningOnce, setIsListeningOnce] = useState(false)
  const [, setVoiceNotice] = useState('')
  const [prepServings, setPrepServings] = useState(2)
  const [missingIngredients, setMissingIngredients] = useState<MissingIngredient[]>([])
  const [cookAutoPlayRequest, setCookAutoPlayRequest] = useState(0)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const currentStep = recipe?.steps[currentStepIndex] ?? null
  const prepPlan = useMemo(
    () => (recipe ? prepPlanFromRecipe(recipe, prepServings, missingIngredients) : null),
    [missingIngredients, prepServings, recipe],
  )

  useEffect(() => {
    return () => {
      if (videoUrl) {
        URL.revokeObjectURL(videoUrl)
      }
    }
  }, [videoUrl])

  useEffect(() => {
    if (!isTimerRunning) {
      return
    }

    const timer = window.setInterval(() => {
      setTimerLeft((previous) => {
        if (previous <= 1) {
          setIsTimerRunning(false)
          return 0
        }

        return previous - 1
      })
    }, 1000)

    return () => window.clearInterval(timer)
  }, [isTimerRunning])

  const resetFlow = () => {
    if (videoUrl) {
      URL.revokeObjectURL(videoUrl)
    }
    setStage('landing')
    setSelectedFile(null)
    setVideoUrl(null)
    setRecipe(null)
    setAnalysisMessage('')
    setFailure(null)
    setCurrentStepIndex(0)
    setTimerLeft(0)
    setIsTimerRunning(false)
    setIsListeningOnce(false)
    setMessages(emptyMessages)
    setAssistantInput('')
    setVoiceNotice('')
    setMissingIngredients([])
    setCookAutoPlayRequest(0)
  }

  const applyAnalyzeResult = (response: DemoAnalyzeVideoResponse, objectUrl: string, file: File) => {
    if (!isAnalyzeSuccess(response)) {
      setFailure(response)
      setStage('failed')
      return
    }

    const nextRecipe = recipeFromAnalyzedVideo(response.recipe, objectUrl, file.name)
    setRecipe(nextRecipe)
    setAnalysisMessage(response.message)
    setPrepServings(nextRecipe.servings)
    setCurrentStepIndex(0)
    setTimerLeft(nextRecipe.steps[0]?.durationMinutes ? nextRecipe.steps[0].durationMinutes * 60 : 60)
    setMessages([
      createMessage('assistant', `已根据视频解析出《${nextRecipe.title}》。进入跟做后可以点“点击说话”控制步骤或提问。`),
    ])
    setStage('prep')
  }

  const handleLocalVideo = async (file: File | null) => {
    if (!file) {
      return
    }

    if (videoUrl) {
      URL.revokeObjectURL(videoUrl)
    }

    const objectUrl = URL.createObjectURL(file)
    setSelectedFile(file)
    setVideoUrl(objectUrl)
    setFailure(null)
    setRecipe(null)
    setAnalysisMessage('正在读取真实视频时长、抽取关键帧、执行 OCR，并让 AI 只基于证据生成菜谱。')
    setStage('analyzing')

    try {
      const durationSeconds = await readVideoDuration(file)
      const response = await analyzeLocalVideo(file, durationSeconds)
      applyAnalyzeResult(response, objectUrl, file)
    } catch (error) {
      setFailure({
        success: false,
        status: 'failed',
        error_type: 'LLM_FAILED',
        message: error instanceof Error ? error.message : '本地视频解析失败。',
        nextStep: '请确认后端服务正在运行，或换一个字幕更清晰的做菜视频重试。',
        uploadedVideo: {
          originalName: file.name,
          size: file.size,
          mimeType: file.type || 'video/*',
          durationSeconds: 0,
          durationLabel: '未知',
        },
        frames: [],
        ocr_texts: [],
        evidence: {
          usedLLM: false,
          llm_status: 'failed',
          source: 'local video ocr',
          frameCount: 0,
          ocrTextCount: 0,
          frames: [],
          ocrSegments: [],
          cleanedOcrSegments: [],
          ocrEvidenceText: '',
          warnings: [],
          failureStage: 'LLM_FAILED',
        },
      })
      setStage('failed')
    }
  }

  const jumpToStep = (nextIndex: number) => {
    if (!recipe) {
      return
    }

    const safeIndex = Math.max(0, Math.min(nextIndex, recipe.steps.length - 1))
    setCurrentStepIndex(safeIndex)
    setTimerLeft(recipe.steps[safeIndex].durationMinutes * 60)
    setIsTimerRunning(false)
  }

  const submitAssistantQuestion = async (question: string) => {
    const safeQuestion = question.trim()
    if (!recipe || !currentStep || !safeQuestion) {
      return
    }

    setMessages((previous) => [...previous, createMessage('user', safeQuestion)].slice(-10))
    setIsAssistantLoading(true)

    try {
      const response = await askDemoCoach({
        recipeName: recipe.title,
        currentStep: {
          title: currentStep.title,
          instruction: currentStep.instruction,
          tips: currentStep.checkpoints,
          commonMistakes: currentStep.commonMistakes,
        },
        userQuestion: safeQuestion,
      })
      setMessages((previous) => [...previous, createMessage('assistant', response.answer)].slice(-10))
    } catch (error) {
      setMessages((previous) => [
        ...previous,
        createMessage(
          'assistant',
          error instanceof Error ? error.message : '小白暂时没有连上，可以先按屏幕步骤继续。',
        ),
      ].slice(-10))
    } finally {
      setIsAssistantLoading(false)
    }
  }

  const appendCommandConversation = useCallback((userText: string, assistantText: string) => {
    setMessages((previous) => [
      ...previous,
      createMessage('user', userText),
      createMessage('assistant', assistantText),
    ].slice(-10))
  }, [])

  const handleVoiceTranscript = async (transcript: string) => {
    if (!recipe || !currentStep) {
      return
    }

    const safeTranscript = transcript.trim()
    if (!safeTranscript) {
      setVoiceNotice('没有识别到内容，请再点一次说话。')
      return
    }

    setVoiceNotice('')
    const intent = parseVoiceIntent(safeTranscript)

    if (intent.type === 'next_step') {
      if (currentStepIndex >= recipe.steps.length - 1) {
        appendCommandConversation(safeTranscript, '已进入完成页')
        setStage('finish')
        setIsTimerRunning(false)
        return
      }
      jumpToStep(currentStepIndex + 1)
      setCookAutoPlayRequest((previous) => previous + 1)
      appendCommandConversation(safeTranscript, '已切换到下一步')
      return
    }

    if (intent.type === 'prev_step') {
      jumpToStep(currentStepIndex - 1)
      appendCommandConversation(
        safeTranscript,
        currentStepIndex === 0 ? '已经是第一步了' : '已返回上一步',
      )
      return
    }

    if (intent.type === 'repeat_step') {
      appendCommandConversation(safeTranscript, '我再说一遍当前步骤')
      await speak(`${currentStep.title}。${currentStep.voiceover}`)
      return
    }

    if (intent.type === 'play_video') {
      appendCommandConversation(safeTranscript, '正在播放当前步骤视频')
      setCookAutoPlayRequest((previous) => previous + 1)
      return
    }

    if (intent.type === 'timer') {
      setTimerLeft(intent.durationSeconds)
      setIsTimerRunning(true)
      appendCommandConversation(
        safeTranscript,
        `已开始 ${formatVoiceTimerDuration(intent.durationSeconds)} 计时`,
      )
      return
    }

    if (intent.type === 'question') {
      await submitAssistantQuestion(intent.question)
      return
    }

    appendCommandConversation(
      intent.text,
      '可以说“下一步”“计时三分钟”，也可以直接问做菜问题',
    )
  }

  const listenOnce = async () => {
    if (isListeningOnce) {
      return
    }

    setIsListeningOnce(true)
    setVoiceNotice('正在听，请说一句短命令。')

    try {
      const transcript = await recognizeSpeechOnce()

      if (!transcript) {
        throw new Error('当前设备不支持语音识别，仍可使用按钮和文字提问。')
      }

      await handleVoiceTranscript(transcript)
    } catch (error) {
      setVoiceNotice(error instanceof Error ? error.message : '语音识别失败，请再试一次。')
    } finally {
      setIsListeningOnce(false)
    }
  }

  const speechAvailable = isNativeSpeechPlatform() || isSpeechRecognitionSupported()
  const voiceStatus: VoiceStatus = !speechAvailable
    ? 'unsupported'
    : isListeningOnce
      ? 'listening'
      : 'idle'

  if (stage === 'landing') {
    return (
      <main className="app-shell-mobile competition-shell">
        <section className="panel competition-hero">
          <span className="section-kicker">复赛演示主链路</span>
          <h1>导入做菜视频，生成一步一屏跟做</h1>
          <p>
            上传本地视频后，系统会读取真实时长、抽帧、OCR，并用 AI 生成结构化菜谱。证据不足时会明确失败，不返回演示假菜谱。
          </p>
          <input
            ref={fileInputRef}
            className="demo-file-input"
            type="file"
            accept="video/*"
            onChange={(event) => {
              void handleLocalVideo(event.currentTarget.files?.[0] ?? null)
              event.currentTarget.value = ''
            }}
          />
          <button className="primary-button competition-primary-action" onClick={() => fileInputRef.current?.click()}>
            导入本地视频
          </button>
        </section>

      </main>
    )
  }

  if (stage === 'analyzing') {
    return (
      <main className="app-shell-mobile competition-shell">
        <section className="panel competition-hero">
          <span className="section-kicker">AI 解析中</span>
          <h1>正在生成可信菜谱</h1>
          <p>{analysisMessage}</p>
          {selectedFile ? (
            <div className="demo-file-summary">
              <strong>{selectedFile.name}</strong>
              <span>{formatFileSize(selectedFile.size)}</span>
            </div>
          ) : null}
          <div className="import-progress-track">
            <div className="import-progress-value competition-progress-value" />
          </div>
        </section>
      </main>
    )
  }

  if (stage === 'failed') {
    return (
      <main className="app-shell-mobile competition-shell">
        <section className="panel competition-hero competition-failure">
          <span className="section-kicker">解析失败</span>
          <h1>无法生成可信菜谱</h1>
          <p>{failure?.message ?? '视频解析失败。'}</p>
          <ul className="demo-compact-list">
            <li><span>视频</span><strong>{failure?.uploadedVideo?.originalName ?? selectedFile?.name ?? '未知'}</strong></li>
            <li><span>真实时长</span><strong>{failure?.uploadedVideo?.durationLabel ?? '未知'}</strong></li>
            <li><span>失败阶段</span><strong>{failure?.error_type ?? 'UNKNOWN'}</strong></li>
            <li><span>关键帧</span><strong>{failure?.evidence.frameCount ?? 0} 张</strong></li>
            <li><span>OCR 文本</span><strong>{failure?.evidence.ocrTextCount ?? 0} 条</strong></li>
          </ul>
          <p>{failure?.nextStep ?? '请稍后重试。'}</p>
          <div className="competition-actions">
            <button className="primary-button" onClick={() => fileInputRef.current?.click()}>重新导入</button>
            <button className="ghost-button" onClick={resetFlow}>返回首页</button>
          </div>
          <input
            ref={fileInputRef}
            className="demo-file-input"
            type="file"
            accept="video/*"
            onChange={(event) => {
              void handleLocalVideo(event.currentTarget.files?.[0] ?? null)
              event.currentTarget.value = ''
            }}
          />
        </section>
      </main>
    )
  }

  if (stage === 'prep' && recipe && prepPlan) {
    return (
      <div className="app-shell-mobile">
        <PrepScreen
          selectedRecipe={recipe}
          prepPlan={prepPlan}
          servings={prepServings}
          missingIngredients={missingIngredients}
          isLoading={false}
          error={null}
          onBack={resetFlow}
          onServingsChange={setPrepServings}
          onToggleMissingIngredient={(name, defaultAmount) => {
            setMissingIngredients((previous) =>
              previous.some((item) => item.name === name)
                ? previous.filter((item) => item.name !== name)
                : [...previous, { name, amount: defaultAmount }],
            )
          }}
          onMissingAmountChange={(name, amount) => {
            setMissingIngredients((previous) =>
              previous.map((item) => (item.name === name ? { ...item, amount } : item)),
            )
          }}
          onRefreshPlan={() => undefined}
          onStartCooking={() => {
            jumpToStep(0)
            setStage('cook')
          }}
        />
      </div>
    )
  }

  if (stage === 'cook' && recipe && currentStep) {
    return (
      <div className="app-shell-cooking">
        <CookScreen
          selectedRecipe={recipe}
          currentStep={currentStep}
          currentStepIndex={currentStepIndex}
          voiceEnabled={isListeningOnce}
          voiceStatus={voiceStatus}
          autoPlayRequest={cookAutoPlayRequest}
          messages={messages}
          assistantInput={assistantInput}
          isAssistantLoading={isAssistantLoading}
          isFinishing={false}
          onBackToDiscover={() => setStage('prep')}
          onJumpToStep={jumpToStep}
          onStartTimer={(durationSeconds) => {
            setTimerLeft(durationSeconds)
            setIsTimerRunning(true)
          }}
          onToggleVoice={() => void listenOnce()}
          onCommandFeedback={appendCommandConversation}
          onPromptClick={(question) => void submitAssistantQuestion(question)}
          onAssistantInputChange={setAssistantInput}
          onAssistantSubmit={() => {
            const question = assistantInput.trim()
            setAssistantInput('')
            void submitAssistantQuestion(question)
          }}
          onFinishCooking={() => {
            setIsListeningOnce(false)
            setIsTimerRunning(false)
            setStage('finish')
          }}
        />
      </div>
    )
  }

  if (stage === 'finish' && recipe) {
    return (
      <main className="app-shell-mobile competition-shell">
        <section className="panel finish-panel competition-finish">
          <span className="section-kicker">完成</span>
          <h1>{recipe.title} 已经完成</h1>
          <p className="finish-copy">这条复赛主链路已经走完：导入视频、AI 解析、备菜、跟做和完成。</p>
          <div className="finish-actions">
            <button
              className="primary-button"
              onClick={() => {
                jumpToStep(0)
                setStage('cook')
              }}
            >
              再跟做一次
            </button>
            <button className="ghost-button" onClick={resetFlow}>返回导入首页</button>
          </div>
        </section>
      </main>
    )
  }

  return null
}

export default App
