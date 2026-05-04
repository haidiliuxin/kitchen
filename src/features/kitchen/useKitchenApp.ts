import { Capacitor } from '@capacitor/core'
import { SpeechRecognition } from '@capacitor-community/speech-recognition'
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
  fetchHistory,
  fetchRecommendations,
  fetchRecipes,
  recordCompletion,
} from '../../lib/api.js'
import {
  getLiveCoachNote,
  getQuickPrompts,
  getWelcomeMessage,
} from '../../lib/assistant.js'
import type { CookingHistoryEntry, Difficulty, Recipe } from '../../types.js'
import {
  createMessage,
  speak,
  type ChatMessage,
  type Screen,
  type TimeLimit,
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
  const [history, setHistory] = useState<CookingHistoryEntry[]>([])
  const [timerLeft, setTimerLeft] = useState(0)
  const [isTimerRunning, setIsTimerRunning] = useState(false)
  const [voiceEnabled, setVoiceEnabled] = useState(false)
  const [lastVoiceCommand, setLastVoiceCommand] = useState('')
  const [isRecipesLoading, setIsRecipesLoading] = useState(true)
  const [isHistoryLoading, setIsHistoryLoading] = useState(true)
  const [recipesError, setRecipesError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [isAssistantLoading, setIsAssistantLoading] = useState(false)
  const [isFinishing, setIsFinishing] = useState(false)
  const [reloadNonce, setReloadNonce] = useState(0)
  const [recognitionSupported, setRecognitionSupported] = useState(
    isNativePlatform ? true : webRecognitionSupported,
  )
  const [recognitionMode, setRecognitionMode] = useState<'native' | 'web' | 'none'>(
    isNativePlatform ? 'native' : webRecognitionSupported ? 'web' : 'none',
  )

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const nativeRecognitionActiveRef = useRef(false)
  const lastSpokenStepRef = useRef('')
  const deferredQuery = useDeferredValue(searchQuery)

  const selectedRecipe =
    recipesData.find((recipe) => recipe.id === selectedRecipeId) ?? recipesData[0] ?? null
  const currentStep = selectedRecipe?.steps[currentStepIndex] ?? null
  const quickPrompts = selectedRecipe ? getQuickPrompts(selectedRecipe) : []
  const currentRecipeCompletions = selectedRecipe
    ? history.filter((entry) => entry.recipeId === selectedRecipe.id).length
    : 0

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

        setHistory(nextHistory)
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

    setLastVoiceCommand(transcript)

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

  const handleSpokenInput = useEffectEvent((transcript: string) => {
    const safeTranscript = transcript.trim()
    if (!safeTranscript) {
      return
    }

    const handled = handleVoiceCommand(safeTranscript)
    if (handled) {
      return
    }

    setAssistantInput(safeTranscript)
    void submitAssistantQuestion(safeTranscript)
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
    if (!recognitionSupported || recognitionMode !== 'native') {
      return
    }

    if (!voiceEnabled || screen !== 'cook') {
      nativeRecognitionActiveRef.current = false
      void SpeechRecognition.stop().catch(() => undefined)
      void SpeechRecognition.removeAllListeners().catch(() => undefined)
      return
    }

    let disposed = false

    const startNativeRecognition = async () => {
      if (nativeRecognitionActiveRef.current || disposed) {
        return
      }

      nativeRecognitionActiveRef.current = true

      try {
        const result = await SpeechRecognition.start({
          language: 'zh-CN',
          maxResults: 1,
          partialResults: false,
          popup: true,
        })
        const transcript = result.matches?.[0]?.trim()
        if (transcript) {
          handleSpokenInput(transcript)
        }
      } catch {
        if (!disposed) {
          setNotice('语音识别启动失败，请确认系统语音服务可用。')
          setVoiceEnabled(false)
        }
      } finally {
        nativeRecognitionActiveRef.current = false
        if (!disposed && voiceEnabled && screen === 'cook') {
          window.setTimeout(() => {
            void startNativeRecognition()
          }, 250)
        }
      }
    }

    const setupNativeRecognition = async () => {
      await SpeechRecognition.removeAllListeners().catch(() => undefined)
      await SpeechRecognition.addListener('listeningState', (data) => {
        if (data.status === 'stopped') {
          nativeRecognitionActiveRef.current = false
        }
      })
      await startNativeRecognition()
    }

    void setupNativeRecognition()

    return () => {
      disposed = true
      nativeRecognitionActiveRef.current = false
      void SpeechRecognition.stop().catch(() => undefined)
      void SpeechRecognition.removeAllListeners().catch(() => undefined)
    }
  }, [handleSpokenInput, recognitionMode, recognitionSupported, screen, voiceEnabled])

  useEffect(() => {
    if (screen !== 'cook' || !currentStep || !selectedRecipe) {
      return
    }

    const nextStepKey = `${selectedRecipe.id}:${currentStepIndex}`
    if (lastSpokenStepRef.current === nextStepKey) {
      return
    }

    lastSpokenStepRef.current = nextStepKey
    void speak(`第 ${currentStepIndex + 1} 步，${currentStep.title}。${currentStep.voiceover}`).catch(() => {
      setNotice('当前设备的文字朗读不可用，请检查系统语音引擎。')
    })
  }, [currentStep, currentStepIndex, screen, selectedRecipe])

  const toggleVoice = async () => {
    if (voiceEnabled) {
      setVoiceEnabled(false)
      return
    }

    if (!recognitionSupported) {
      setNotice('当前设备不支持语音识别，仍然可以通过按钮完成操作。')
      return
    }

    if (recognitionMode === 'native') {
      try {
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
    }

    setNotice(null)
    setVoiceEnabled(true)
  }

  const disableVoice = () => {
    setVoiceEnabled(false)
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
    : voiceEnabled && screen === 'cook'
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
    isRecipesLoading,
    isHistoryLoading,
    recipesError,
    notice,
    isAssistantLoading,
    isFinishing,
    quickPrompts,
    currentRecipeCompletions,
    voiceStatus,
    liveCoachNote,
    setScreen,
    setSelectedRecipeId,
    setSearchQuery,
    setDifficulty,
    setTimeLimit,
    setAssistantInput,
    setIsTimerRunning,
    setTimerLeft,
    setVoiceEnabled,
    toggleVoice,
    disableVoice,
    setNotice,
    jumpToStep,
    startCooking,
    resumeCooking,
    finishCooking,
    retryLoading,
    submitAssistantQuestion,
  }
}
