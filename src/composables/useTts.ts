import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import type { SpeechRatePreset } from '../types/practice'

interface HttpTtsEngineOptions {
  enabled?: boolean
  endpoint?: string
  timeoutMs?: number
}

interface UseTtsOptions {
  langPrefix?: string
  maxVoices?: number
  initialVoiceURI?: string
  initialRatePreset?: SpeechRatePreset
  localEngine?: HttpTtsEngineOptions
  onlineEngine?: HttpTtsEngineOptions
}

export type TtsEngineSource = 'os' | 'local' | 'online' | 'none'

export const SYSTEM_DEFAULT_VOICE_ID = '__system_default__'
export const LOCAL_ENGINE_ID = '__local_engine__'
export const ONLINE_ENGINE_ID = '__online_engine__'

export interface VoiceOption {
  id: string
  name: string
  lang: string
  source: TtsEngineSource
  sourceLabel: string
}

const NATURAL_VOICE_KEYWORDS = ['natural', 'neural', 'premium', 'enhanced', 'siri']
const DEFAULT_HTTP_TIMEOUT_MS = 10_000

const speechRateByPreset: Record<SpeechRatePreset, number> = {
  normal: 1,
  slightlyFast: 1.2,
  fastest: 1.4,
}

const isSpeechSynthesisAvailable = (): boolean =>
  typeof window !== 'undefined' &&
  'speechSynthesis' in window &&
  'SpeechSynthesisUtterance' in window

const parseBooleanFlag = (value: string | undefined): boolean =>
  value === '1' || value?.toLowerCase() === 'true'

const getVoicePriority = (voice: SpeechSynthesisVoice): number => {
  const name = voice.name.toLowerCase()
  const keywordScore = NATURAL_VOICE_KEYWORDS.some((keyword) => name.includes(keyword)) ? 4 : 0
  const defaultScore = voice.default ? 2 : 0
  const googleScore = name.includes('google') ? 1 : 0
  return keywordScore + defaultScore + googleScore
}

const normalizeHttpEngineOptions = (
  explicit: HttpTtsEngineOptions | undefined,
  envEnabled: string | undefined,
  envEndpoint: string | undefined,
): Required<HttpTtsEngineOptions> => ({
  enabled: explicit?.enabled ?? parseBooleanFlag(envEnabled),
  endpoint: explicit?.endpoint ?? envEndpoint ?? '',
  timeoutMs: explicit?.timeoutMs ?? DEFAULT_HTTP_TIMEOUT_MS,
})

export const useTts = (options: UseTtsOptions = {}) => {
  const osSupported = isSpeechSynthesisAvailable()
  const selectedVoiceURI = ref(options.initialVoiceURI ?? '')
  const selectedRatePreset = ref<SpeechRatePreset>(options.initialRatePreset ?? 'normal')
  const allVoices = ref<SpeechSynthesisVoice[]>([])
  const speaking = ref(false)
  const ttsError = ref('')
  const activeEngineSource = ref<TtsEngineSource>('none')
  const requestController = ref<AbortController | null>(null)
  let speakGeneration = 0

  const localEngine = normalizeHttpEngineOptions(
    options.localEngine,
    import.meta.env.VITE_LOCAL_TTS_ENABLED,
    import.meta.env.VITE_LOCAL_TTS_ENDPOINT,
  )
  const onlineEngine = normalizeHttpEngineOptions(
    options.onlineEngine,
    import.meta.env.VITE_ONLINE_TTS_ENABLED,
    import.meta.env.VITE_ONLINE_TTS_ENDPOINT,
  )

  const voicePrefix = (options.langPrefix ?? 'en-US').toLowerCase()
  const maxVoices = options.maxVoices ?? 5
  const anyEngineConfigured = computed(
    () => osSupported || localEngine.enabled || onlineEngine.enabled,
  )

  const availableVoices = computed(() =>
    [...allVoices.value]
      .filter((voice) => voice.lang.toLowerCase().startsWith(voicePrefix))
      .sort((left, right) => {
        const priorityDiff = getVoicePriority(right) - getVoicePriority(left)
        if (priorityDiff !== 0) {
          return priorityDiff
        }
        return left.name.localeCompare(right.name)
      })
      .slice(0, maxVoices),
  )

  const allVoiceOptions = computed<VoiceOption[]>(() => {
    const sourceLabel = (source: TtsEngineSource) => {
      if (source === 'os') return '操作系统'
      if (source === 'local') return '本地开源'
      return '在线'
    }
    const options: VoiceOption[] = []

    if (osSupported) {
      const defaultVoice = allVoices.value.find((v) => v.default)
      const defaultName = defaultVoice ? `系统默认语音（${defaultVoice.name}）` : '系统默认语音'
      options.push({
        id: SYSTEM_DEFAULT_VOICE_ID,
        name: defaultName,
        lang: defaultVoice?.lang ?? '—',
        source: 'os',
        sourceLabel: '系统默认',
      })

      const allowedPrefixes = ['en-us', 'en-gb', 'zh-cn']
      const sortedOsVoices = [...allVoices.value]
        .filter((voice) => allowedPrefixes.some((p) => voice.lang.toLowerCase().startsWith(p)))
        .sort((left, right) => {
          const priorityDiff = getVoicePriority(right) - getVoicePriority(left)
          if (priorityDiff !== 0) {
            return priorityDiff
          }
          return left.name.localeCompare(right.name)
        })
        .slice(0, maxVoices)

      for (const voice of sortedOsVoices) {
        options.push({
          id: voice.voiceURI,
          name: voice.name,
          lang: voice.lang,
          source: 'os',
          sourceLabel: sourceLabel('os'),
        })
      }
    }

    if (localEngine.enabled) {
      options.push({
        id: LOCAL_ENGINE_ID,
        name: '本地开源引擎',
        lang: 'en-US',
        source: 'local',
        sourceLabel: sourceLabel('local'),
      })
    }

    if (onlineEngine.enabled) {
      options.push({
        id: ONLINE_ENGINE_ID,
        name: '在线引擎',
        lang: 'en-US',
        source: 'online',
        sourceLabel: sourceLabel('online'),
      })
    }

    return options
  })

  const updateVoiceList = () => {
    if (!osSupported) {
      return
    }
    allVoices.value = window.speechSynthesis.getVoices()
  }

  watch(
    allVoiceOptions,
    (options) => {
      if (options.length === 0) {
        return
      }

      if (selectedVoiceURI.value === SYSTEM_DEFAULT_VOICE_ID) {
        return
      }
      const isCurrentStillAvailable = options.some((opt) => opt.id === selectedVoiceURI.value)
      if (!isCurrentStillAvailable) {
        selectedVoiceURI.value = options[0].id
      }
    },
    { immediate: true },
  )

  const stop = () => {
    requestController.value?.abort()
    requestController.value = null

    if (osSupported) {
      window.speechSynthesis.cancel()
    }

    speaking.value = false
  }

  const ensureVoicesReady = async () => {
    if (selectedVoiceURI.value !== SYSTEM_DEFAULT_VOICE_ID) return
    if (allVoices.value.length > 0) return
    if (!osSupported) return
    updateVoiceList()
    if (allVoices.value.length > 0) return
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(resolve, 3000)
      const handler = () => {
        clearTimeout(timeout)
        window.speechSynthesis.removeEventListener('voiceschanged', handler)
        updateVoiceList()
        resolve()
      }
      window.speechSynthesis.addEventListener('voiceschanged', handler)
    })
  }

  const speakWithOsEngine = async (text: string) => {
    if (!osSupported) {
      throw new Error('操作系统内部语音引擎不可用。')
    }
    await ensureVoicesReady()

    return new Promise<void>((resolve, reject) => {
      const utterance = new SpeechSynthesisUtterance(text)
      utterance.lang = 'en-US'

      const targetUri = selectedVoiceURI.value === SYSTEM_DEFAULT_VOICE_ID
        ? allVoices.value.find((v) => v.default)?.voiceURI ?? ''
        : selectedVoiceURI.value
      const selectedVoice = allVoices.value.find((v) => v.voiceURI === targetUri)
      if (selectedVoice) {
        utterance.voice = selectedVoice
      }
      utterance.rate = speechRateByPreset[selectedRatePreset.value]

      utterance.onstart = () => {
        speaking.value = true
      }
      utterance.onend = () => {
        speaking.value = false
        resolve()
      }
      utterance.onerror = (event) => {
        speaking.value = false
        if (event.error === 'interrupted' || event.error === 'canceled') {
          resolve()
          return
        }
        reject(new Error(`操作系统语音播放失败：${event.error}`))
      }

      window.speechSynthesis.speak(utterance)
    })
  }

  const speakWithHttpEngine = async (
    source: 'local' | 'online',
    engine: Required<HttpTtsEngineOptions>,
    text: string,
  ) => {
    if (!engine.enabled) {
      throw new Error(`${source === 'local' ? '本地开源' : '在线'}语音引擎未启用。`)
    }
    if (!engine.endpoint) {
      throw new Error(`${source === 'local' ? '本地开源' : '在线'}语音引擎未配置 endpoint。`)
    }

    const controller = new AbortController()
    requestController.value = controller
    const timeoutId = window.setTimeout(() => controller.abort(), engine.timeoutMs)

    speaking.value = true
    try {
      const response = await fetch(engine.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          lang: 'en-US',
          ratePreset: selectedRatePreset.value,
          rate: speechRateByPreset[selectedRatePreset.value],
        }),
        signal: controller.signal,
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`${source === 'local' ? '本地开源' : '在线'}语音引擎请求超时或已取消。`)
      }
      if (error instanceof Error) {
        throw new Error(`${source === 'local' ? '本地开源' : '在线'}语音引擎失败：${error.message}`)
      }
      throw new Error(`${source === 'local' ? '本地开源' : '在线'}语音引擎发生未知错误。`)
    } finally {
      window.clearTimeout(timeoutId)
      if (requestController.value === controller) {
        requestController.value = null
      }
      speaking.value = false
    }
  }

  const speak = async (text: string) => {
    const trimmedText = text.trim()
    if (!trimmedText) {
      ttsError.value = '朗读文本不能为空。'
      return
    }

    ttsError.value = ''
    stop()

    const gen = ++speakGeneration
    const selectedOption = allVoiceOptions.value.find((opt) => opt.id === selectedVoiceURI.value)

    try {
      if (!selectedOption) {
        throw new Error('未选择语音引擎。')
      }

      if (selectedOption.source === 'os') {
        await speakWithOsEngine(trimmedText)
      } else if (selectedOption.source === 'local') {
        await speakWithHttpEngine('local', localEngine, trimmedText)
      } else {
        await speakWithHttpEngine('online', onlineEngine, trimmedText)
      }
      if (gen !== speakGeneration) return
      activeEngineSource.value = selectedOption.source
    } catch (error) {
      if (gen !== speakGeneration) return
      activeEngineSource.value = 'none'
      ttsError.value = error instanceof Error ? error.message : '语音播放失败。'
    }
  }

  onMounted(() => {
    if (!osSupported) {
      return
    }
    updateVoiceList()
    window.speechSynthesis.addEventListener('voiceschanged', updateVoiceList)
  })

  onUnmounted(() => {
    if (osSupported) {
      window.speechSynthesis.removeEventListener('voiceschanged', updateVoiceList)
    }
    stop()
  })

  return {
    activeEngineSource,
    allVoiceOptions,
    anyEngineConfigured,
    availableVoices,
    selectedRatePreset,
    selectedVoiceURI,
    speaking,
    ttsError,
    speak,
    stop,
  }
}
