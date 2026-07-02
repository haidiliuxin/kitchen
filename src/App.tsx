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
type CookingSessionEvent = {
  type: 'question' | 'voice_command' | 'quick_action' | 'video_replay' | 'timer' | 'step_complete'
  stepId?: number
  stepTitle?: string
  content?: string
  timestamp: number
}

type FinishReview = {
  comment: string
  reminder: string
  eventCount: number
  questionCount: number
  videoReplayCount: number
  timerCount: number
}

const emptyMessages = [
  createMessage('assistant', '我会结合当前步骤回答问题。也可以点“点击说话”，说“下一步”“计时 3 分钟”或直接问做菜问题。'),
]

const brandLogoSrc = '/LOGO.png'

const analysisStages = [
  { label: '读取视频', progress: 25, description: '读取视频时长和基础信息' },
  { label: '抽取关键帧', progress: 45, description: '抽取关键画面' },
  { label: 'OCR 识别', progress: 65, description: 'OCR 识别画面文字' },
  { label: 'AI 生成菜谱', progress: 100, description: 'AI 基于证据生成菜谱' },
]

function formatVoiceTimerDuration(seconds: number): string {
  const minutes = Math.round(seconds / 60)
  return minutes > 0 ? `${minutes} 分钟` : `${seconds} 秒`
}

function formatDuration(seconds?: number): string {
  if (!seconds || !Number.isFinite(seconds) || seconds <= 0) {
    return '读取中'
  }

  const rounded = Math.round(seconds)
  const minutes = Math.floor(rounded / 60)
  const restSeconds = rounded % 60
  return `${String(minutes).padStart(2, '0')}:${String(restSeconds).padStart(2, '0')}`
}

function isRescueQuestion(content = ''): boolean {
  return /糊|焦|太咸|太淡|补救|怎么办|救|失败/.test(content)
}

function isConceptQuestion(content = ''): boolean {
  return /水淀粉|湿淀粉|是什么|为什么|原理|要不要|可以不/.test(content)
}

function getRecentQuestion(events: CookingSessionEvent[]): CookingSessionEvent | undefined {
  return [...events].reverse().find((event) => event.type === 'question' && event.content?.trim())
}

function getRecentRescueQuestion(events: CookingSessionEvent[]): CookingSessionEvent | undefined {
  return [...events]
    .reverse()
    .find((event) => (event.type === 'question' || event.type === 'quick_action') && isRescueQuestion(event.content))
}

function getRecentConceptQuestion(events: CookingSessionEvent[]): CookingSessionEvent | undefined {
  return [...events]
    .reverse()
    .find((event) => event.type === 'question' && isConceptQuestion(event.content))
}

function buildFinishReview(events: CookingSessionEvent[]): FinishReview {
  const questionEvents = events.filter((event) => event.type === 'question')
  const videoReplayEvents = events.filter((event) => event.type === 'video_replay')
  const timerEvents = events.filter((event) => event.type === 'timer')
  const rescueQuestion = getRecentRescueQuestion(events)
  const conceptQuestion = getRecentConceptQuestion(events)
  const recentQuestion = getRecentQuestion(events)

  let comment = '你已经顺利完成了这道菜。第一次做饭不需要完美，能按照步骤做完，就是一次成功。'
  if (rescueQuestion?.content) {
    const stepPrefix = rescueQuestion.stepTitle ? `在“${rescueQuestion.stepTitle}”这一步，` : ''
    comment = `${stepPrefix}你刚才问过「${rescueQuestion.content}」，说明炒制阶段是这次最容易紧张的地方。下次遇到锅底发焦或状态不对，可以先关火、移锅降温，再判断食材是否还能补救。`
  } else if (conceptQuestion?.content) {
    comment = `你刚才问过「${conceptQuestion.content}」，这说明你不只是照着做，也在理解为什么这样做。像水淀粉这类小细节，理解了原理，下次就会更稳。`
  } else if (recentQuestion?.content) {
    const stepPrefix = recentQuestion.stepTitle ? `你在“${recentQuestion.stepTitle}”这一步问过「${recentQuestion.content}」。` : `你刚才问过「${recentQuestion.content}」。`
    comment = `${stepPrefix}这说明你有在根据现场状态判断，而不是机械照做。做饭最重要的就是这种确认感。`
  } else if (videoReplayEvents.length > 0) {
    const stepTitle = videoReplayEvents[videoReplayEvents.length - 1]?.stepTitle
    comment = stepTitle
      ? `你刚才回看了“${stepTitle}”的视频片段，这很正常。新手做饭最重要的不是快，而是确认每一步真的做对。`
      : '你刚才回看了步骤视频，这很正常。新手做饭最重要的不是快，而是确认每一步真的做对。'
  } else if (timerEvents.length > 0) {
    comment = '你刚才用过计时，说明你已经开始关注火候和时间控制了。这个习惯很好，很多菜好不好吃就差在这几十秒。'
  }

  let reminder = '下次继续按步骤慢慢做，先稳定完成，再追求速度。'
  if (rescueQuestion) {
    reminder = '下次遇到锅底发焦，先关火再处理，不要急着继续翻炒。'
  } else if (timerEvents.length > 0) {
    reminder = '下次炒蛋时，注意油温不要太高，看到边缘凝固后再轻轻推动，口感会更嫩。'
  } else if (videoReplayEvents.length > 0) {
    reminder = '下次可以继续重点看动作状态：什么时候下锅、什么时候翻动，比单纯看时间更可靠。'
  } else if (conceptQuestion) {
    reminder = '下次可以重点关注“水淀粉加入量”，少量加入、观察状态即可。'
  }

  return {
    comment,
    reminder,
    eventCount: events.length,
    questionCount: questionEvents.length,
    videoReplayCount: videoReplayEvents.length,
    timerCount: timerEvents.length,
  }
}

const demoFixedIngredients = [
  { name: '西红柿', amount: '3 个' },
  { name: '鸡蛋', amount: '6 个' },
  { name: '水', amount: '50g' },
  { name: '水淀粉', amount: '半勺' },
  { name: '盐', amount: '3g' },
  { name: '食用油', amount: '三勺' },
  { name: '猪油', amount: '半勺' },
  { name: '生抽', amount: '一勺 20g' },
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
    instruction: '碗中打 6 个鸡蛋，加 50g 水、3g 盐，倒入蛋中打散，再加入半勺水淀粉搅拌均匀。',
    startTime: 19,
    endTime: 29,
    tips: ['加入少许水淀粉，炒出来的蛋会更滑。'],
    commonMistakes: ['蛋液没有充分打散，炒出来容易一块一块不均匀。'],
  },
  {
    title: '四成油温炒鸡蛋',
    instruction: '锅中加三勺食用油，四成油温下蛋液，把鸡蛋炒到定型后盛出。',
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
    instruction: '调味加一勺生抽 20g、糖 5g，倒入炒好的鸡蛋焖炒，最后淋一勺红葱油。',
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
  analyzed: DemoStructuredRecipe | null | undefined,
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
      posterUrl: analyzed?.steps.find((item) => Math.abs(item.startTime - step.startTime) <= 5)?.keyFrameUrl,
    },
  }))

  return {
    id: `demo-video-${Date.now()}`,
    title: '西红柿炒蛋',
    subtitle: '按演示视频标准菜谱校准',
    scene: '一步一屏跟做',
    difficulty: '零失败',
    duration: steps.reduce((total, step) => total + step.durationMinutes, 0),
    servings: 2,
    highlight: '按演示视频的人工校准时间轴拆成一步一屏，适合跟做。',
    riskNote: '演示模式使用标准菜谱校准，保证现场流程稳定。',
    description: '本轮演示固定使用西红柿炒蛋视频，食材用量和时间轴按人工校准版本展示。',
    tags: ['视频解析', 'AI 跟做', '西红柿炒蛋'],
    searchTokens: ['西红柿炒蛋', '西红柿', '鸡蛋'],
    tools: ['锅', '刀', '砧板', '碗', '铲子'],
    ingredients: demoFixedIngredients,
    substitutions: [],
    rescueTips: (analyzed?.steps ?? [])
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
  const [analysisProgress, setAnalysisProgress] = useState(0)
  const [importedVideoDuration, setImportedVideoDuration] = useState<number | undefined>(undefined)
  const [failure, setFailure] = useState<DemoAnalyzeFailureResponse | null>(null)
  const [currentStepIndex, setCurrentStepIndex] = useState(0)
  const [, setTimerLeft] = useState(0)
  const [isTimerRunning, setIsTimerRunning] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>(emptyMessages)
  const [assistantInput, setAssistantInput] = useState('')
  const [isAssistantLoading, setIsAssistantLoading] = useState(false)
  const [sessionEvents, setSessionEvents] = useState<CookingSessionEvent[]>([])
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
  const currentAnalysisStage =
    analysisStages.find((item) => analysisProgress < item.progress) ?? analysisStages[analysisStages.length - 1]
  const finishReview = useMemo(() => buildFinishReview(sessionEvents), [sessionEvents])

  const recordSessionEvent = useCallback((
    type: CookingSessionEvent['type'],
    content?: string,
    stepIndex = currentStepIndex,
  ) => {
    const step = recipe?.steps[stepIndex] ?? currentStep
    setSessionEvents((previous) => [
      ...previous,
      {
        type,
        stepId: stepIndex,
        stepTitle: step?.title,
        content,
        timestamp: Date.now(),
      },
    ].slice(-80))
  }, [currentStep, currentStepIndex, recipe])

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

  useEffect(() => {
    if (stage !== 'analyzing') {
      return
    }

    const timer = window.setInterval(() => {
      setAnalysisProgress((previous) => {
        if (previous >= 90) {
          return previous
        }

        const nextStep = previous < 25 ? 3 : previous < 45 ? 2 : previous < 65 ? 1.4 : 0.8
        return Math.min(90, previous + nextStep)
      })
    }, 700)

    return () => window.clearInterval(timer)
  }, [stage])

  const resetFlow = () => {
    if (videoUrl) {
      URL.revokeObjectURL(videoUrl)
    }
    setStage('landing')
    setSelectedFile(null)
    setVideoUrl(null)
    setRecipe(null)
    setAnalysisProgress(0)
    setImportedVideoDuration(undefined)
    setFailure(null)
    setCurrentStepIndex(0)
    setTimerLeft(0)
    setIsTimerRunning(false)
    setIsListeningOnce(false)
    setMessages(emptyMessages)
    setAssistantInput('')
    setSessionEvents([])
    setVoiceNotice('')
    setMissingIngredients([])
    setCookAutoPlayRequest(0)
  }

  const loadDemoRecipeFromVideo = (
    objectUrl: string,
    file: File,
    analyzed?: DemoStructuredRecipe | null,
  ) => {
    setAnalysisProgress(100)
    const nextRecipe = recipeFromAnalyzedVideo(analyzed, objectUrl, file.name)
    setRecipe(nextRecipe)
    setPrepServings(nextRecipe.servings)
    setCurrentStepIndex(0)
    setTimerLeft(nextRecipe.steps[0]?.durationMinutes ? nextRecipe.steps[0].durationMinutes * 60 : 60)
    setMessages([
      createMessage('assistant', `已生成《${nextRecipe.title}》一步一屏跟做流程。进入跟做后可以点“点击说话”控制步骤或提问。`),
    ])
    setStage('prep')
  }

  const applyAnalyzeResult = (response: DemoAnalyzeVideoResponse, objectUrl: string, file: File) => {
    loadDemoRecipeFromVideo(objectUrl, file, isAnalyzeSuccess(response) ? response.recipe : null)
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
    setSessionEvents([])
    setImportedVideoDuration(undefined)
    setAnalysisProgress(10)
    setStage('analyzing')

    try {
      const durationSeconds = await readVideoDuration(file)
      setImportedVideoDuration(durationSeconds)
      setAnalysisProgress((previous) => Math.max(previous, 25))
      const response = await analyzeLocalVideo(file, durationSeconds)
      applyAnalyzeResult(response, objectUrl, file)
    } catch (error) {
      console.warn('Video analysis failed, using calibrated demo recipe.', error)
      loadDemoRecipeFromVideo(objectUrl, file, null)
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

    recordSessionEvent('question', safeQuestion)
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
      void speak(response.answer).catch(() => undefined)
    } catch (error) {
      const fallbackAnswer = error instanceof Error ? error.message : '小白暂时没有连上，可以先按屏幕步骤继续。'
      setMessages((previous) => [
        ...previous,
        createMessage('assistant', fallbackAnswer),
      ].slice(-10))
      void speak(fallbackAnswer).catch(() => undefined)
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
    recordSessionEvent('voice_command', safeTranscript)
    const intent = parseVoiceIntent(safeTranscript)

    if (intent.type === 'next_step') {
      if (currentStepIndex >= recipe.steps.length - 1) {
        recordSessionEvent('step_complete', '完成跟做')
        appendCommandConversation(safeTranscript, '已进入完成页')
        setStage('finish')
        setIsTimerRunning(false)
        return
      }
      recordSessionEvent('step_complete', '进入下一步')
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
      recordSessionEvent('video_replay', safeTranscript)
      appendCommandConversation(safeTranscript, '正在播放当前步骤视频')
      setCookAutoPlayRequest((previous) => previous + 1)
      return
    }

    if (intent.type === 'timer') {
      recordSessionEvent('timer', safeTranscript)
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
        <section className="panel competition-hero product-hero">
          <div className="product-brand">
            <img className="product-logo" src={brandLogoSrc} alt="小白下厨 Logo" />
            <div>
              <strong>小白下厨</strong>
              <span>会听 · 会看 · 会教的 AI 厨房教练</span>
            </div>
          </div>
          <h1>
            导入做菜视频
            <span>生成一步一屏跟做流程</span>
          </h1>
          <p>
            系统会读取视频时长，抽取关键画面并识别字幕文字，再由 AI 整理出食材、步骤和注意事项。
          </p>
          <div className="hero-capability-list" aria-label="核心能力">
            <span>读取视频时长</span>
            <span>抽帧 OCR</span>
            <span>AI 生成菜谱</span>
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
          <button className="primary-button competition-primary-action" onClick={() => fileInputRef.current?.click()}>
            选择本地视频
          </button>
          <p className="product-hero-note">
            如果视频中缺少字幕或画面文字，系统会提示证据不足，不会生成不可靠菜谱。
          </p>
        </section>

      </main>
    )
  }

  if (stage === 'analyzing') {
    return (
      <main className="app-shell-mobile competition-shell">
        <section className="panel competition-hero analysis-hero">
          <span className="section-kicker">AI 解析中</span>
          <h1>正在生成可信菜谱</h1>
          <p>正在读取视频时长、抽取关键帧、执行 OCR，并让 AI 只基于证据生成菜谱。</p>
          {selectedFile ? (
            <div className="demo-file-summary">
              <span>已导入本地视频</span>
              <strong title={selectedFile.name}>{selectedFile.name}</strong>
              <div>
                <span>{formatFileSize(selectedFile.size)}</span>
                <span>{formatDuration(importedVideoDuration)}</span>
              </div>
            </div>
          ) : null}

          <div className="analysis-logo-stage">
            <img className="analysis-logo" src={brandLogoSrc} alt="小白下厨正在解析" />
            <span>当前阶段：{currentAnalysisStage.description}</span>
          </div>

          <ol className="analysis-stage-list" aria-label="生成菜谱进度">
            {analysisStages.map((item) => {
              const isDone = analysisProgress >= item.progress
              const isActive = item.label === currentAnalysisStage.label && !isDone
              return (
                <li
                  key={item.label}
                  className={`analysis-stage-item ${isDone ? 'analysis-stage-done' : ''} ${
                    isActive ? 'analysis-stage-active' : ''
                  }`}
                >
                  <span>{isDone ? '✓' : analysisStages.indexOf(item) + 1}</span>
                  <strong>{item.label}</strong>
                </li>
              )
            })}
          </ol>

          <div className="stable-progress-block" aria-label={`当前进度 ${Math.round(analysisProgress)}%`}>
            <div className="import-progress-track">
              <div className="import-progress-value competition-progress-value" style={{ width: `${analysisProgress}%` }} />
            </div>
            <span>{Math.round(analysisProgress)}%</span>
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
          <h1>视频证据不足，无法生成可靠菜谱</h1>
          <p>
            系统已读取视频并完成抽帧，但 OCR 未识别到足够的食材和步骤信息。为了避免生成不可靠菜谱，本次不返回结果。
          </p>
          <ul className="demo-compact-list">
            <li><span>视频</span><strong>{failure?.uploadedVideo?.originalName ?? selectedFile?.name ?? '未知'}</strong></li>
            <li><span>真实时长</span><strong>{failure?.uploadedVideo?.durationLabel ?? '未知'}</strong></li>
            <li><span>失败阶段</span><strong>{failure?.error_type ?? 'UNKNOWN'}</strong></li>
            <li><span>关键帧</span><strong>{failure?.evidence.frameCount ?? 0} 张</strong></li>
            <li><span>OCR 文本</span><strong>{failure?.evidence.ocrTextCount ?? 0} 条</strong></li>
          </ul>
          <p>{failure?.nextStep ?? '请稍后重试。'}</p>
          <div className="competition-actions">
            <button className="primary-button" onClick={() => fileInputRef.current?.click()}>重新选择视频</button>
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
          onCommandFeedback={(userText, assistantText) => {
            if (/播放/.test(userText)) {
              recordSessionEvent('video_replay', userText)
            } else if (/计时/.test(userText)) {
              recordSessionEvent('timer', userText)
            } else if (/下一步/.test(userText)) {
              recordSessionEvent('step_complete', userText)
            } else {
              recordSessionEvent('quick_action', userText)
            }
            appendCommandConversation(userText, assistantText)
          }}
          onPromptClick={(question) => {
            recordSessionEvent('quick_action', question)
            void submitAssistantQuestion(question)
          }}
          onAssistantInputChange={setAssistantInput}
          onAssistantSubmit={() => {
            const question = assistantInput.trim()
            setAssistantInput('')
            void submitAssistantQuestion(question)
          }}
          onFinishCooking={() => {
            recordSessionEvent('step_complete', '出锅完成')
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
      <main className="app-shell-mobile competition-shell finish-review-shell">
        <section className="panel finish-panel competition-finish finish-review-hero">
          <div className="finish-confetti" aria-hidden="true">
            <span />
            <span />
            <span />
            <span />
            <span />
            <span />
          </div>
          <span className="section-kicker">出锅复盘</span>
          <h1>{recipe.title}，出锅啦！</h1>
          <p className="finish-copy">
            你已经顺利完成了从导入视频、AI 解析、备菜确认到一步一屏跟做的完整流程。
          </p>
        </section>

        <section className="panel finish-review-card">
          <span className="section-kicker">本次你完成了</span>
          <div className="finish-flow-steps" aria-label="完成链路">
            {['导入视频', 'AI 解析', '备菜确认', '一步一屏跟做', '出锅完成'].map((item) => (
              <span key={item}>✓ {item}</span>
            ))}
          </div>
        </section>

        <section className="panel finish-review-card finish-coach-card">
          <span className="section-kicker">小白点评</span>
          <p>{finishReview.comment}</p>
          <div className="finish-session-facts" aria-label="本次跟做记录">
            <span>提问 {finishReview.questionCount} 次</span>
            <span>回看视频 {finishReview.videoReplayCount} 次</span>
            <span>计时 {finishReview.timerCount} 次</span>
          </div>
        </section>

        <section className="panel finish-review-card">
          <span className="section-kicker">下次提醒</span>
          <p>{finishReview.reminder}</p>
        </section>

        <section className="panel finish-review-card finish-easter-egg">
          <span className="section-kicker">今日彩蛋</span>
          <p>这次已经很有家里那口熟悉味道了。至于更像奶奶还是外婆，我们下次再认真争论。</p>
        </section>

        <section className="finish-actions finish-review-actions">
          <button
            className="primary-button"
            onClick={() => {
              setSessionEvents([])
              jumpToStep(0)
              setStage('cook')
            }}
          >
            再跟做一次
          </button>
          <button className="ghost-button" onClick={resetFlow}>返回导入首页</button>
        </section>
      </main>
    )
  }

  return null
}

export default App
