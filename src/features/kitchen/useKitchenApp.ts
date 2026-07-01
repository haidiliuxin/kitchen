import { Capacitor } from '@capacitor/core'
import { SpeechRecognition } from '@capacitor-community/speech-recognition'
import { TextToSpeech } from '@capacitor-community/text-to-speech'
import {
  startTransition,
  useDeferredValue,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from 'react'
import {
  askAssistant,
  fetchPrepPlan,
  fetchHistory,
  fetchRecommendations,
  fetchRecipes,
  interpretVoiceTranscript,
  recordCompletion,
} from '../../lib/api.js'
import {
  getLiveCoachNote,
  getQuickPrompts,
  getWelcomeMessage,
} from '../../lib/assistant.js'
import type { CookingHistoryEntry, Difficulty, MissingIngredient, PrepPlan, Recipe } from '../../types.js'
import {
  createMessage,
  speak,
  type ChatMessage,
  type Screen,
  type TimeLimit,
  type VoiceDiagnostics,
  type VoiceStatus,
} from './shared.js'

type SpeechRecognitionResultLike = {
  0: {
    transcript: string
  }
}

type SpeechRecognitionEventLike = {
  results: ArrayLike<SpeechRecognitionResultLike>
  resultIndex: number
}

type SpeechRecognitionLike = {
  continuous: boolean
  interimResults: boolean
  lang: string
  onresult: ((event: SpeechRecognitionEventLike) => void) | null
  onend: (() => void) | null
  onerror: (() => void) | null
  start: () => void
  stop: () => void
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike

const LOCAL_HISTORY_STORAGE_KEY = 'kitchen-helper:history'

function readLocalHistory(): CookingHistoryEntry[] {
  if (typeof window === 'undefined') {
    return []
  }

  try {
    const raw = window.localStorage.getItem(LOCAL_HISTORY_STORAGE_KEY)
    if (!raw) {
      return []
    }

    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) {
      return []
    }

    return parsed.filter(
      (item): item is CookingHistoryEntry =>
        Boolean(item) &&
        typeof item.id === 'string' &&
        typeof item.recipeId === 'string' &&
        typeof item.finishedAt === 'string',
    )
  } catch {
    return []
  }
}

function mergeHistoryEntries(...groups: CookingHistoryEntry[][]): CookingHistoryEntry[] {
  const map = new Map<string, CookingHistoryEntry>()

  groups.flat().forEach((entry) => {
    map.set(entry.id, entry)
  })

  return [...map.values()].sort((left, right) => right.finishedAt.localeCompare(left.finishedAt))
}

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor
    webkitSpeechRecognition?: SpeechRecognitionConstructor
  }
}

export function useKitchenApp() {
  const webRecognitionSupported = Boolean(window.SpeechRecognition ?? window.webkitSpeechRecognition)
  const isNativePlatform = Capacitor.isNativePlatform()
  const [screen, setScreen] = useState<Screen>('discover')
  const [selectedRecipeId, setSelectedRecipeId] = useState<string | null>(null)
  const [recipesData, setRecipesData] = useState<Recipe[]>([])
  const [recommendations, setRecommendations] = useState<Recipe[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [difficulty, setDifficulty] = useState<'全部' | Difficulty>('全部')
  const [timeLimit, setTimeLimit] = useState<TimeLimit>('全部')
  const [currentStepIndex, setCurrentStepIndex] = useState(0)
  const [assistantInput, setAssistantInput] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [history, setHistory] = useState<CookingHistoryEntry[]>(() => readLocalHistory())
  const [timerLeft, setTimerLeft] = useState(0)
  const [isTimerRunning, setIsTimerRunning] = useState(false)
  const [voiceEnabled, setVoiceEnabled] = useState(false)
  const [lastVoiceCommand, setLastVoiceCommand] = useState('')
  const [wakeWords, setWakeWords] = useState(['小白下厨', '小白教练'])
  const [isNativeVoiceListening, setIsNativeVoiceListening] = useState(false)
  const [isRecipesLoading, setIsRecipesLoading] = useState(true)
  const [isHistoryLoading, setIsHistoryLoading] = useState(true)
  const [recipesError, setRecipesError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [isAssistantLoading, setIsAssistantLoading] = useState(false)
  const [isFinishing, setIsFinishing] = useState(false)
  const [reloadNonce, setReloadNonce] = useState(0)
  const [prepServings, setPrepServings] = useState(2)
  const [prepPlan, setPrepPlan] = useState<PrepPlan | null>(null)
  const [prepMissingIngredients, setPrepMissingIngredients] = useState<MissingIngredient[]>([])
  const [isPrepPlanLoading, setIsPrepPlanLoading] = useState(false)
  const [prepPlanError, setPrepPlanError] = useState<string | null>(null)
  const [prepReloadNonce, setPrepReloadNonce] = useState(0)
  const [recognitionSupported, setRecognitionSupported] = useState(
    isNativePlatform ? true : webRecognitionSupported,
  )
  const [recognitionMode, setRecognitionMode] = useState<'native' | 'web' | 'none'>(
    isNativePlatform ? 'native' : webRecognitionSupported ? 'web' : 'none',
  )
  const [voiceDiagnostics, setVoiceDiagnostics] = useState<VoiceDiagnostics>({
    isNativePlatform,
    recognitionMode: isNativePlatform ? 'native' : webRecognitionSupported ? 'web' : 'none',
    recognitionSupported: isNativePlatform ? true : webRecognitionSupported,
    voiceEnabled: false,
    isNativeVoiceListening: false,
    permission: '未检测',
    available: '未检测',
    supportedLanguages: '未检测',
    lastPartial: '',
    lastResult: '',
    lastError: '',
    ttsStatus: '未检测',
    isRunningProbe: false,
    logs: [],
  })

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const nativeRecognitionActiveRef = useRef(false)
  const nativeRecognitionRestartTimerRef = useRef<number | null>(null)
  const lastNativeTranscriptRef = useRef({ text: '', at: 0 })
  const deferredQuery = useDeferredValue(searchQuery)

  const selectedRecipe =
    recipesData.find((recipe) => recipe.id === selectedRecipeId) ?? recipesData[0] ?? null
  const currentStep = selectedRecipe?.steps[currentStepIndex] ?? null
  const quickPrompts = selectedRecipe ? getQuickPrompts(selectedRecipe) : []
  const currentRecipeCompletions = selectedRecipe
    ? history.filter((entry) => entry.recipeId === selectedRecipe.id).length
    : 0

  const formatDiagnosticValue = (value: unknown): string => {
    if (value instanceof Error) {
      return value.message
    }

    if (typeof value === 'string') {
      return value
    }

    try {
      return JSON.stringify(value)
    } catch {
      return String(value)
    }
  }

  const withDiagnosticTimeout = async <T,>(
    promise: Promise<T>,
    timeoutMs: number,
    label: string,
  ): Promise<T> => {
    let timeoutId: number | undefined

    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = window.setTimeout(() => {
        reject(new Error(`${label} 超过 ${Math.round(timeoutMs / 1000)} 秒没有返回`))
      }, timeoutMs)
    })

    try {
      return await Promise.race([promise, timeoutPromise])
    } finally {
      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId)
      }
    }
  }

  const appendVoiceDiagnostic = (
    level: VoiceDiagnostics['logs'][number]['level'],
    message: string,
  ) => {
    setVoiceDiagnostics((previous) => ({
      ...previous,
      logs: [
        {
          id: `voice-log-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          at: new Date().toLocaleTimeString(),
          level,
          message,
        },
        ...previous.logs,
      ].slice(0, 18),
    }))
  }

  const refreshVoiceDiagnostics = async () => {
    appendVoiceDiagnostic('info', '开始刷新语音服务状态。')
    const next: Partial<VoiceDiagnostics> = {
      isNativePlatform,
      recognitionMode,
      recognitionSupported,
      voiceEnabled,
      isNativeVoiceListening,
    }

    if (recognitionMode === 'native') {
      try {
        const available = await SpeechRecognition.available()
        next.available = formatDiagnosticValue(available)
      } catch (error) {
        next.available = `available() 失败：${formatDiagnosticValue(error)}`
        next.lastError = next.available
      }

      try {
        const permissions = await SpeechRecognition.checkPermissions()
        next.permission = formatDiagnosticValue(permissions)
      } catch (error) {
        next.permission = `checkPermissions() 失败：${formatDiagnosticValue(error)}`
        next.lastError = next.permission
      }

      try {
        const languages = await SpeechRecognition.getSupportedLanguages()
        next.supportedLanguages = formatDiagnosticValue(languages)
      } catch (error) {
        next.supportedLanguages = `getSupportedLanguages() 失败：${formatDiagnosticValue(error)}`
        next.lastError = next.supportedLanguages
      }
    } else {
      next.available = webRecognitionSupported ? 'Web Speech API 可用' : 'Web Speech API 不可用'
      next.permission = 'Web 模式由浏览器弹窗授权'
      next.supportedLanguages = '浏览器决定支持语言'
    }

    setVoiceDiagnostics((previous) => ({
      ...previous,
      ...next,
    }))
    appendVoiceDiagnostic('ok', '语音服务状态刷新完成。')
  }

  const runTtsDiagnostic = async () => {
    appendVoiceDiagnostic('info', '开始测试文字朗读。')

    if (!Capacitor.isNativePlatform()) {
      await speak('小白下厨语音朗读测试。')
      setVoiceDiagnostics((previous) => ({ ...previous, ttsStatus: 'Web speechSynthesis 已调用。' }))
      appendVoiceDiagnostic('ok', 'Web 朗读测试已调用。')
      return
    }

    try {
      const languages = await TextToSpeech.getSupportedLanguages().catch((error) => ({
        error: formatDiagnosticValue(error),
      }))
      const voices = await TextToSpeech.getSupportedVoices().catch((error) => ({
        error: formatDiagnosticValue(error),
      }))
      await TextToSpeech.stop().catch(() => undefined)
      await TextToSpeech.speak({
        text: '小白下厨语音朗读测试。如果你听到了这句话，朗读服务可用。',
        lang: 'zh-CN',
        rate: 1,
        pitch: 1,
        volume: 1,
      })
      const status = `朗读成功；languages=${formatDiagnosticValue(languages)}；voices=${formatDiagnosticValue(voices).slice(0, 220)}`
      setVoiceDiagnostics((previous) => ({ ...previous, ttsStatus: status, lastError: '' }))
      appendVoiceDiagnostic('ok', status)
    } catch (error) {
      const message = `朗读失败：${formatDiagnosticValue(error)}`
      setVoiceDiagnostics((previous) => ({ ...previous, ttsStatus: message, lastError: message }))
      appendVoiceDiagnostic('error', message)
    }
  }

  const runVoiceListenProbe = async () => {
    appendVoiceDiagnostic('info', '开始 8 秒语音监听测试。')
    setVoiceEnabled(false)
    setVoiceDiagnostics((previous) => ({
      ...previous,
      isRunningProbe: true,
      lastPartial: '',
      lastResult: '',
      lastError: '',
    }))

    if (recognitionMode !== 'native') {
      appendVoiceDiagnostic('warn', `当前不是原生语音模式：${recognitionMode}`)
      setVoiceDiagnostics((previous) => ({ ...previous, isRunningProbe: false }))
      return
    }

    await SpeechRecognition.stop().catch(() => undefined)
    await SpeechRecognition.removeAllListeners().catch(() => undefined)

    let finished = false
    let watchdogId: number | undefined
    const finishProbe = async (reason: string) => {
      if (finished) {
        return
      }

      finished = true
      if (watchdogId !== undefined) {
        window.clearTimeout(watchdogId)
      }
      await SpeechRecognition.stop().catch(() => undefined)
      await SpeechRecognition.removeAllListeners().catch(() => undefined)
      setIsNativeVoiceListening(false)
      nativeRecognitionActiveRef.current = false
      setVoiceDiagnostics((previous) => ({ ...previous, isRunningProbe: false }))
      appendVoiceDiagnostic('info', `监听测试结束：${reason}`)
    }

    try {
      watchdogId = window.setTimeout(() => {
        const message = '监听测试总超时：系统语音服务没有返回识别结果或结束事件。'
        setVoiceDiagnostics((previous) => ({ ...previous, lastError: message }))
        appendVoiceDiagnostic('warn', message)
        void finishProbe('10 秒总超时')
      }, 10000)

      const permissions = await withDiagnosticTimeout(
        SpeechRecognition.checkPermissions(),
        3000,
        'checkPermissions()',
      )
      setVoiceDiagnostics((previous) => ({ ...previous, permission: formatDiagnosticValue(permissions) }))
      if (permissions.speechRecognition !== 'granted') {
        appendVoiceDiagnostic('info', '准备请求麦克风/语音识别权限。')
        const requested = await withDiagnosticTimeout(
          SpeechRecognition.requestPermissions(),
          8000,
          'requestPermissions()',
        )
        setVoiceDiagnostics((previous) => ({ ...previous, permission: formatDiagnosticValue(requested) }))
        if (requested.speechRecognition !== 'granted') {
          const message = '权限未授予，系统不会把麦克风音频交给应用。'
          setVoiceDiagnostics((previous) => ({ ...previous, lastError: message, isRunningProbe: false }))
          appendVoiceDiagnostic('error', message)
          return
        }
      }

      await SpeechRecognition.addListener('partialResults', (data) => {
        const transcript = data.matches?.find((item) => item.trim())?.trim() ?? ''
        setVoiceDiagnostics((previous) => ({
          ...previous,
          lastPartial: formatDiagnosticValue(data.matches ?? []),
          lastResult: transcript || previous.lastResult,
        }))
        appendVoiceDiagnostic(transcript ? 'ok' : 'info', `partialResults=${formatDiagnosticValue(data.matches ?? [])}`)
      })
      await SpeechRecognition.addListener('listeningState', (data) => {
        setIsNativeVoiceListening(data.status === 'started')
        setVoiceDiagnostics((previous) => ({
          ...previous,
          isNativeVoiceListening: data.status === 'started',
        }))
        appendVoiceDiagnostic(data.status === 'started' ? 'ok' : 'info', `listeningState=${formatDiagnosticValue(data)}`)
      })

      appendVoiceDiagnostic('info', '准备调用 SpeechRecognition.start()，如果系统麦克风被拉起，状态栏应出现麦克风提示。')
      await withDiagnosticTimeout(
        SpeechRecognition.start({
          language: 'zh-CN',
          maxResults: 5,
          partialResults: true,
          popup: false,
        }),
        5000,
        'SpeechRecognition.start()',
      )
      nativeRecognitionActiveRef.current = true
      setIsNativeVoiceListening(true)
      appendVoiceDiagnostic('ok', 'SpeechRecognition.start() 已返回成功，请现在对着手机说一句话。')
      window.setTimeout(() => {
        void finishProbe('8 秒测试窗口结束')
      }, 8000)
    } catch (error) {
      const message = `监听测试失败：${formatDiagnosticValue(error)}`
      setVoiceDiagnostics((previous) => ({ ...previous, lastError: message, isRunningProbe: false }))
      appendVoiceDiagnostic('error', message)
      await finishProbe('启动失败')
    }
  }

  useEffect(() => {
    setVoiceDiagnostics((previous) => ({
      ...previous,
      isNativePlatform,
      recognitionMode,
      recognitionSupported,
      voiceEnabled,
      isNativeVoiceListening,
    }))
  }, [isNativePlatform, isNativeVoiceListening, recognitionMode, recognitionSupported, voiceEnabled])

  useEffect(() => {
    if (!selectedRecipe || screen !== 'prep') {
      return
    }

    let cancelled = false

    const loadPrepPlan = async () => {
      setIsPrepPlanLoading(true)
      setPrepPlanError(null)

      try {
        const plan = await fetchPrepPlan(selectedRecipe.id, prepServings, prepMissingIngredients)
        if (cancelled) {
          return
        }

        setPrepPlan(plan)
      } catch (error) {
        if (cancelled) {
          return
        }

        setPrepPlan(null)
        setPrepPlanError(error instanceof Error ? error.message : '备菜计划生成失败，请稍后再试。')
      } finally {
        if (!cancelled) {
          setIsPrepPlanLoading(false)
        }
      }
    }

    void loadPrepPlan()

    return () => {
      cancelled = true
    }
  }, [prepMissingIngredients, prepReloadNonce, prepServings, screen, selectedRecipe])

  useEffect(() => {
    let cancelled = false

    const resolveRecognitionSupport = async () => {
      if (!isNativePlatform) {
        setRecognitionSupported(webRecognitionSupported)
        setRecognitionMode(webRecognitionSupported ? 'web' : 'none')
        return
      }

      if (cancelled) {
        return
      }

      // On some Android devices `available()` is overly conservative.
      // We treat native platforms as supported and surface concrete errors on start.
      setRecognitionSupported(true)
      setRecognitionMode('native')
    }

    void resolveRecognitionSupport()

    return () => {
      cancelled = true
    }
  }, [isNativePlatform, webRecognitionSupported])

  useEffect(() => {
    let cancelled = false

    const loadRecipes = async () => {
      setIsRecipesLoading(true)
      setRecipesError(null)

      try {
        const nextRecipes = await fetchRecipes({
          query: deferredQuery,
          difficulty,
          timeLimit,
        })

        if (cancelled) {
          return
        }

        setRecipesData(nextRecipes)
      } catch (error) {
        if (cancelled) {
          return
        }

        setRecipesData([])
        setRecipesError(
          error instanceof Error ? error.message : '菜谱加载失败，请稍后再试。',
        )
      } finally {
        if (!cancelled) {
          setIsRecipesLoading(false)
        }
      }
    }

    void loadRecipes()

    return () => {
      cancelled = true
    }
  }, [deferredQuery, difficulty, reloadNonce, timeLimit])

  useEffect(() => {
    let cancelled = false

    const loadHistory = async () => {
      setIsHistoryLoading(true)

      try {
        const nextHistory = await fetchHistory()
        if (cancelled) {
          return
        }

        setHistory((previous) => mergeHistoryEntries(nextHistory, previous))
      } catch (error) {
        if (cancelled) {
          return
        }

        setNotice(
          error instanceof Error
            ? error.message
            : '历史记录加载失败，稍后可以再试一次。',
        )
      } finally {
        if (!cancelled) {
          setIsHistoryLoading(false)
        }
      }
    }

    void loadHistory()

    return () => {
      cancelled = true
    }
  }, [reloadNonce])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    try {
      window.localStorage.setItem(LOCAL_HISTORY_STORAGE_KEY, JSON.stringify(history))
    } catch {
      // Ignore storage write failures and keep in-memory state.
    }
  }, [history])

  useEffect(() => {
    if (!isTimerRunning) {
      return
    }

    const timer = window.setInterval(() => {
      setTimerLeft((previous) => {
        if (previous <= 1) {
          window.clearInterval(timer)
          setIsTimerRunning(false)
          return 0
        }

        return previous - 1
      })
    }, 1000)

    return () => window.clearInterval(timer)
  }, [isTimerRunning])

  const jumpToStep = (nextIndex: number) => {
    if (!selectedRecipe) {
      return
    }

    const safeIndex = Math.max(0, Math.min(nextIndex, selectedRecipe.steps.length - 1))
    setCurrentStepIndex(safeIndex)
    setTimerLeft(selectedRecipe.steps[safeIndex].durationMinutes * 60)
    setIsTimerRunning(false)
  }

  const submitAssistantQuestion = async (question: string) => {
    if (!selectedRecipe || !currentStep || !question.trim()) {
      return
    }

    const recipeId = selectedRecipe.id
    const stepIndex = currentStepIndex
    const safeQuestion = question.trim()

    setMessages((previous) => [...previous, createMessage('user', safeQuestion)].slice(-10))
    setIsAssistantLoading(true)

    try {
      const answer = await askAssistant(recipeId, stepIndex, safeQuestion)
      setMessages((previous) => [...previous, createMessage('assistant', answer)].slice(-10))
    } catch (error) {
      const fallback =
        error instanceof Error ? error.message : 'AI 教练暂时没连上，请稍后再试。'
      setMessages((previous) => [...previous, createMessage('assistant', fallback)].slice(-10))
    } finally {
      setIsAssistantLoading(false)
    }
  }

  const handleVoiceCommand = useEffectEvent((transcript: string): boolean => {
    const normalized = transcript.replace(/\s+/g, '')
    const minuteMatch = transcript.match(/(\d+)/)

    if (normalized.includes('下一步') || normalized.includes('继续')) {
      jumpToStep(currentStepIndex + 1)
      return true
    }

    if (normalized.includes('上一步') || normalized.includes('返回')) {
      jumpToStep(currentStepIndex - 1)
      return true
    }

    if (normalized.includes('重复') || normalized.includes('再说一遍') || normalized.includes('朗读')) {
      if (currentStep) {
        void speak(`${currentStep.title}。${currentStep.voiceover}`)
      }
      return true
    }

    if (normalized.includes('暂停计时')) {
      setIsTimerRunning(false)
      return true
    }

    if (normalized.includes('计时') && currentStep) {
      const nextMinutes = minuteMatch ? Number(minuteMatch[1]) : currentStep.durationMinutes
      setTimerLeft(nextMinutes * 60)
      setIsTimerRunning(true)
      return true
    }

    return false
  })

  const looksLikeKitchenQuestion = (transcript: string): boolean => {
    const normalized = transcript.replace(/\s+/g, '')
    return /(怎么|为什么|多久|多少|什么程度|怎么办|可以不|能不能|要不要|火候|熟了|糊了|咸了|淡了|太干|太稀|下一步|上一步|重复|朗读|计时)/.test(normalized)
  }

  const handleSpokenInput = useEffectEvent(async (transcript: string) => {
    const safeTranscript = transcript.trim()
    if (!safeTranscript) {
      return
    }

    let interpretedTranscript = safeTranscript

    try {
      const interpretation = await interpretVoiceTranscript(safeTranscript)
      setWakeWords(interpretation.wakeWords)

      if (!interpretation.activated) {
        if (!looksLikeKitchenQuestion(safeTranscript)) {
          return
        }
        interpretedTranscript = safeTranscript
      } else {
        interpretedTranscript = interpretation.cleanedTranscript.trim()
      }
      if (!interpretedTranscript) {
        setNotice(`已唤醒语音助手，请继续说指令。当前唤醒词：${interpretation.wakeWords.join(' / ')}`)
        return
      }
    } catch {
      // If the backend interpreter is unavailable, fall back to the raw transcript.
    }

    setLastVoiceCommand(interpretedTranscript)
    setVoiceDiagnostics((previous) => ({
      ...previous,
      lastResult: interpretedTranscript,
    }))
    appendVoiceDiagnostic('ok', `交给厨房语音逻辑：${interpretedTranscript}`)

    const handled = handleVoiceCommand(interpretedTranscript)
    if (handled) {
      return
    }

    setAssistantInput(interpretedTranscript)
    void submitAssistantQuestion(interpretedTranscript)
  })

  useEffect(() => {
    if (!recognitionSupported || recognitionMode !== 'web') {
      return
    }

    const Recognition = (window.SpeechRecognition ?? window.webkitSpeechRecognition)!

    if (!voiceEnabled || screen !== 'cook') {
      recognitionRef.current?.stop()
      recognitionRef.current = null
      return
    }

    let isDisposed = false
    const recognition = new Recognition()
    recognition.lang = 'zh-CN'
    recognition.continuous = true
    recognition.interimResults = false
    recognition.onresult = (event) => {
      const latest = event.results[event.resultIndex]
      const transcript = latest?.[0]?.transcript?.trim()
      if (transcript) {
        handleSpokenInput(transcript)
      }
    }
    recognition.onend = () => {
      if (!isDisposed && voiceEnabled && screen === 'cook') {
        recognition.start()
      }
    }
    recognition.onerror = () => {}

    recognitionRef.current = recognition
    recognition.start()

    return () => {
      isDisposed = true
      recognition.onresult = null
      recognition.onend = null
      recognition.onerror = null
      recognition.stop()
      recognitionRef.current = null
    }
  }, [handleSpokenInput, recognitionMode, recognitionSupported, screen, voiceEnabled])

  useEffect(() => {
    if (recognitionMode !== 'native') {
      return
    }

    if (screen !== 'cook') {
      if (nativeRecognitionRestartTimerRef.current !== null) {
        window.clearTimeout(nativeRecognitionRestartTimerRef.current)
        nativeRecognitionRestartTimerRef.current = null
      }

      nativeRecognitionActiveRef.current = false
      setIsNativeVoiceListening(false)
      setVoiceEnabled(false)
      void SpeechRecognition.stop().catch(() => undefined)
      void SpeechRecognition.removeAllListeners().catch(() => undefined)
    }
  }, [recognitionMode, screen])

  useEffect(() => {
    if (recognitionMode !== 'native') {
      return
    }

    return () => {
      if (nativeRecognitionRestartTimerRef.current !== null) {
        window.clearTimeout(nativeRecognitionRestartTimerRef.current)
        nativeRecognitionRestartTimerRef.current = null
      }

      nativeRecognitionActiveRef.current = false
      setIsNativeVoiceListening(false)
      void SpeechRecognition.stop().catch(() => undefined)
      void SpeechRecognition.removeAllListeners().catch(() => undefined)
    }
  }, [recognitionMode])

  useEffect(() => {
    if (!recognitionSupported || recognitionMode !== 'native') {
      return
    }

    if (!voiceEnabled || screen !== 'cook') {
      if (nativeRecognitionRestartTimerRef.current !== null) {
        window.clearTimeout(nativeRecognitionRestartTimerRef.current)
        nativeRecognitionRestartTimerRef.current = null
      }

      nativeRecognitionActiveRef.current = false
      setIsNativeVoiceListening(false)
      void SpeechRecognition.stop().catch(() => undefined)
      void SpeechRecognition.removeAllListeners().catch(() => undefined)
      return
    }

    let disposed = false

    const clearRestartTimer = () => {
      if (nativeRecognitionRestartTimerRef.current !== null) {
        window.clearTimeout(nativeRecognitionRestartTimerRef.current)
        nativeRecognitionRestartTimerRef.current = null
      }
    }

    const queueRestart = (delayMs = 1200) => {
      if (disposed || !voiceEnabled || screen !== 'cook') {
        return
      }

      clearRestartTimer()
      nativeRecognitionRestartTimerRef.current = window.setTimeout(() => {
        nativeRecognitionRestartTimerRef.current = null
        void startListening()
      }, delayMs)
    }

    const handleNativeMatches = (matches?: string[]) => {
      const transcript = matches?.find((match) => match.trim())?.trim()
      if (!transcript) {
        return
      }

      const now = Date.now()
      const last = lastNativeTranscriptRef.current
      if (last.text === transcript && now - last.at < 1800) {
        return
      }

      lastNativeTranscriptRef.current = { text: transcript, at: now }
      void handleSpokenInput(transcript)
    }

    const startListening = async () => {
      if (disposed || nativeRecognitionActiveRef.current) {
        return
      }

      nativeRecognitionActiveRef.current = true

      try {
        appendVoiceDiagnostic('info', '持续监听：调用 SpeechRecognition.start()。')
        await SpeechRecognition.start({
          language: 'zh-CN',
          maxResults: 3,
          partialResults: true,
          popup: false,
        })
        setIsNativeVoiceListening(true)
        setNotice(null)
        appendVoiceDiagnostic('ok', '持续监听：SpeechRecognition.start() 成功。')
      } catch (error) {
        nativeRecognitionActiveRef.current = false
        setIsNativeVoiceListening(false)

        const rawMessage = error instanceof Error ? error.message : String(error)
        const friendlyMessage =
          /not available/i.test(rawMessage)
            ? '当前手机没有可用的系统语音识别服务，请在系统设置中启用语音助手/语音输入。'
            : /permission|insufficient/i.test(rawMessage)
              ? '请在系统设置里允许小白下厨使用麦克风权限。'
              : /busy/i.test(rawMessage)
                ? '系统语音服务正忙，正在自动重试。'
                : rawMessage
                  ? `语音识别启动失败：${rawMessage}`
                  : '语音识别启动失败，正在自动重试。'

        setNotice(friendlyMessage)
        setVoiceDiagnostics((previous) => ({ ...previous, lastError: rawMessage || friendlyMessage }))
        appendVoiceDiagnostic('error', `持续监听启动失败：${rawMessage || friendlyMessage}`)
        if (!/not available|permission|insufficient/i.test(rawMessage)) {
          queueRestart(/busy/i.test(rawMessage) ? 1800 : 2500)
        } else {
          setVoiceEnabled(false)
        }
      }
    }

    const setupContinuousNativeRecognition = async () => {
      await SpeechRecognition.stop().catch(() => undefined)
      await SpeechRecognition.removeAllListeners().catch(() => undefined)
      await SpeechRecognition.addListener('partialResults', (data) => {
        setVoiceDiagnostics((previous) => ({
          ...previous,
          lastPartial: formatDiagnosticValue(data.matches ?? []),
        }))
        appendVoiceDiagnostic('info', `持续监听 partialResults=${formatDiagnosticValue(data.matches ?? [])}`)
        handleNativeMatches(data.matches)
      })
      await SpeechRecognition.addListener('listeningState', (data) => {
        appendVoiceDiagnostic('info', `持续监听 listeningState=${formatDiagnosticValue(data)}`)
        if (data.status === 'started') {
          nativeRecognitionActiveRef.current = true
          setIsNativeVoiceListening(true)
          return
        }

        nativeRecognitionActiveRef.current = false
        setIsNativeVoiceListening(false)
        queueRestart()
      })
      await startListening()
    }

    void setupContinuousNativeRecognition()

    return () => {
      disposed = true
      clearRestartTimer()
      nativeRecognitionActiveRef.current = false
      setIsNativeVoiceListening(false)
      void SpeechRecognition.stop().catch(() => undefined)
      void SpeechRecognition.removeAllListeners().catch(() => undefined)
    }
  }, [handleSpokenInput, recognitionMode, recognitionSupported, screen, voiceEnabled])

  const toggleVoice = async () => {
    if (voiceEnabled) {
      if (recognitionMode === 'native') {
        if (nativeRecognitionRestartTimerRef.current !== null) {
          window.clearTimeout(nativeRecognitionRestartTimerRef.current)
          nativeRecognitionRestartTimerRef.current = null
        }

        nativeRecognitionActiveRef.current = false
        setIsNativeVoiceListening(false)
        await SpeechRecognition.stop().catch(() => undefined)
        await SpeechRecognition.removeAllListeners().catch(() => undefined)
      }

      setVoiceEnabled(false)
      return
    }

    if (!recognitionSupported) {
      setNotice('当前设备不支持语音识别，仍然可以通过按钮完成操作。')
      return
    }

    if (recognitionMode === 'native') {
      try {
        await SpeechRecognition.available().catch(() => ({ available: true }))

        const permissions = await SpeechRecognition.checkPermissions()
        const currentPermission = permissions.speechRecognition

        if (currentPermission !== 'granted') {
          const requested = await SpeechRecognition.requestPermissions()
          if (requested.speechRecognition !== 'granted') {
            setNotice('请允许麦克风权限后再开启语音控制。')
            return
          }
        }
      } catch {
        setNotice('请求麦克风权限失败，请到系统设置里检查应用权限。')
        return
      }

      setNotice(null)
      setVoiceEnabled(true)
      return
    }

    setNotice(null)
    setVoiceEnabled(true)
  }

  const disableVoice = () => {
    setVoiceEnabled(false)
  }

  const openPrep = (recipeId?: string) => {
    const recipe = recipeId
      ? recipesData.find((item) => item.id === recipeId) ?? selectedRecipe
      : selectedRecipe

    if (!recipe) {
      return
    }

    startTransition(() => {
      setSelectedRecipeId(recipe.id)
      setPrepServings(Math.max(1, recipe.servings))
      setPrepMissingIngredients([])
      setPrepPlan(null)
      setPrepPlanError(null)
      setScreen('prep')
      setNotice(null)
    })
  }

  const startCooking = () => {
    if (!selectedRecipe) {
      return
    }

    startTransition(() => {
      setScreen('cook')
      setCurrentStepIndex(0)
      setTimerLeft(selectedRecipe.steps[0].durationMinutes * 60)
      setIsTimerRunning(false)
      setMessages([createMessage('assistant', getWelcomeMessage(selectedRecipe))])
      setAssistantInput('')
      setNotice(null)
    })
  }

  const toggleMissingIngredient = (name: string, defaultAmount: string) => {
    setPrepMissingIngredients((previous) => {
      if (previous.some((item) => item.name === name)) {
        return previous.filter((item) => item.name !== name)
      }

      return [...previous, { name, amount: defaultAmount }]
    })
  }

  const updateMissingIngredientAmount = (name: string, amount: string) => {
    setPrepMissingIngredients((previous) =>
      previous.map((item) => (item.name === name ? { ...item, amount } : item)),
    )
  }

  const resumeCooking = (recipeId: string, stepIndex: number) => {
    const recipe = recipesData.find((item) => item.id === recipeId)
    if (!recipe) {
      return
    }

    const safeIndex = Math.max(0, Math.min(stepIndex, recipe.steps.length - 1))

    startTransition(() => {
      setSelectedRecipeId(recipeId)
      setScreen('cook')
      setCurrentStepIndex(safeIndex)
      setTimerLeft(recipe.steps[safeIndex].durationMinutes * 60)
      setIsTimerRunning(false)
      setMessages([createMessage('assistant', getWelcomeMessage(recipe))])
      setAssistantInput('')
      setNotice(null)
    })
  }

  const finishCooking = async () => {
    if (!selectedRecipe || isFinishing) {
      return
    }

    setIsFinishing(true)
    setVoiceEnabled(false)

    try {
      const entry = await recordCompletion(selectedRecipe.id)
      setHistory((previous) => [entry, ...previous])

      try {
        const nextRecommendations = await fetchRecommendations(selectedRecipe.id)
        setRecommendations(nextRecommendations)
      } catch (error) {
        setRecommendations([])
        setNotice(
          error instanceof Error ? error.message : '推荐菜谱暂时没有返回成功。',
        )
      }

      setScreen('finish')
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : '完成记录保存失败，请稍后再试。',
      )
    } finally {
      setIsFinishing(false)
    }
  }

  const retryLoading = () => {
    setReloadNonce((previous) => previous + 1)
    setNotice(null)
  }

  const voiceStatus: VoiceStatus = !recognitionSupported
    ? 'unsupported'
    : (voiceEnabled || isNativeVoiceListening) && screen === 'cook'
      ? 'listening'
      : 'idle'

  const liveCoachNote =
    selectedRecipe && currentStep
      ? getLiveCoachNote(selectedRecipe, currentStep, currentStepIndex)
      : '选定一道菜后，AI 教练会根据当前步骤给出实时提醒。'

  return {
    screen,
    selectedRecipe,
    recipesData,
    recommendations,
    searchQuery,
    difficulty,
    timeLimit,
    currentStepIndex,
    currentStep,
    assistantInput,
    messages,
    history,
    timerLeft,
    isTimerRunning,
    voiceEnabled,
    lastVoiceCommand,
    wakeWords,
    isRecipesLoading,
    isHistoryLoading,
    recipesError,
    notice,
    isAssistantLoading,
    isFinishing,
    prepServings,
    prepPlan,
    prepMissingIngredients,
    isPrepPlanLoading,
    prepPlanError,
    quickPrompts,
    currentRecipeCompletions,
    voiceStatus,
    voiceDiagnostics,
    liveCoachNote,
    setScreen,
    setSelectedRecipeId,
    setSearchQuery,
    setDifficulty,
    setTimeLimit,
    setAssistantInput,
    setIsTimerRunning,
    setTimerLeft,
    setPrepServings,
    setVoiceEnabled,
    toggleVoice,
    refreshVoiceDiagnostics,
    runVoiceListenProbe,
    runTtsDiagnostic,
    disableVoice,
    setNotice,
    jumpToStep,
    openPrep,
    startCooking,
    toggleMissingIngredient,
    updateMissingIngredientAmount,
    refreshPrepPlan: () => setPrepReloadNonce((previous) => previous + 1),
    resumeCooking,
    finishCooking,
    retryLoading,
    setReloadNonce,
    submitAssistantQuestion,
  }
}
