import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import type { SpeechRatePreset } from '../types/practice'
import { espeakEngine } from '../tts/espeakEngine'
import { piperEngine } from '../tts/piperEngine'
import { osEngine, setOsVoiceURI } from '../tts/osEngine'
import { speechRateByPreset } from '../tts/engine'

export const ESPEAK_ENGINE_ID = '__espeak__'
export const PIPER_ENGINE_ID = '__piper__'
export const SYSTEM_DEFAULT_VOICE_ID = '__system_default__'

export type TtsEngineSource = 'builtin' | 'os' | 'none'

export interface VoiceOption {
  id: string
  name: string
  lang: string
  source: TtsEngineSource
  sourceLabel: string
  disabled?: boolean
}

interface UseTtsOptions {
  langPrefix?: string
  maxVoices?: number
  initialVoiceURI?: string
  initialRatePreset?: SpeechRatePreset
}

const NATURAL_VOICE_KEYWORDS = ['natural', 'neural', 'premium', 'enhanced', 'siri']

const isSpeechSynthesisAvailable = (): boolean =>
  typeof window !== 'undefined' &&
  'speechSynthesis' in window &&
  'SpeechSynthesisUtterance' in window

const getVoicePriority = (voice: SpeechSynthesisVoice): number => {
  const name = voice.name.toLowerCase()
  const keywordScore = NATURAL_VOICE_KEYWORDS.some((keyword) => name.includes(keyword)) ? 4 : 0
  const defaultScore = voice.default ? 2 : 0
  const googleScore = name.includes('google') ? 1 : 0
  return keywordScore + defaultScore + googleScore
}

export const useTts = (options: UseTtsOptions = {}) => {
  const osSupported = isSpeechSynthesisAvailable()
  const selectedVoiceURI = ref(options.initialVoiceURI ?? '')
  const selectedRatePreset = ref<SpeechRatePreset>(options.initialRatePreset ?? 'normal')
  const allVoices = ref<SpeechSynthesisVoice[]>([])
  const speaking = ref(false)
  const ttsError = ref('')
  const piperReady = ref(false)
  let speakGeneration = 0

  const maxVoices = options.maxVoices ?? 5

  const allVoiceOptions = computed<VoiceOption[]>(() => {
    const options: VoiceOption[] = [
      {
        id: ESPEAK_ENGINE_ID,
        name: espeakEngine.label,
        lang: 'en-US',
        source: 'builtin',
        sourceLabel: '内置引擎',
      },
    ]

    if (piperReady.value) {
      options.push({
        id: PIPER_ENGINE_ID,
        name: piperEngine.label,
        lang: 'en-US',
        source: 'builtin',
        sourceLabel: '内置引擎',
      })
    }

    if (osSupported) {
      const defaultVoice = allVoices.value.find((v) => v.default)
      options.push({
        id: SYSTEM_DEFAULT_VOICE_ID,
        name: defaultVoice
          ? `系统默认语音（${defaultVoice.name}）`
          : '系统默认语音',
        lang: defaultVoice?.lang ?? '—',
        source: 'os',
        sourceLabel: '操作系统',
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
          sourceLabel: '操作系统',
        })
      }
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
      const isSystemDefaultStillAvailable = options.some(
        (opt) => opt.id === SYSTEM_DEFAULT_VOICE_ID,
      )
      if (selectedVoiceURI.value === SYSTEM_DEFAULT_VOICE_ID && isSystemDefaultStillAvailable) {
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
    speakGeneration += 1
    espeakEngine.stop()
    piperEngine.stop()
    osEngine.stop()
    speaking.value = false
  }

  const ensureOsVoiceReady = async () => {
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
    await ensureOsVoiceReady()

    const targetUri =
      selectedVoiceURI.value === SYSTEM_DEFAULT_VOICE_ID
        ? allVoices.value.find((v) => v.default)?.voiceURI ?? ''
        : selectedVoiceURI.value
    setOsVoiceURI(targetUri)
    await osEngine.speak(text, speechRateByPreset[selectedRatePreset.value])
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
    const rate = speechRateByPreset[selectedRatePreset.value]

    speaking.value = true
    try {
      if (!selectedOption) {
        throw new Error('未选择语音引擎。')
      }

      if (selectedOption.id === ESPEAK_ENGINE_ID) {
        await espeakEngine.speak(trimmedText, rate)
      } else if (selectedOption.id === PIPER_ENGINE_ID) {
        await piperEngine.speak(trimmedText, rate)
      } else {
        await speakWithOsEngine(trimmedText)
      }
    } catch (error) {
      if (gen === speakGeneration) {
        ttsError.value = error instanceof Error ? error.message : '语音播放失败。'
      }
    } finally {
      if (gen === speakGeneration) {
        speaking.value = false
      }
    }
  }

  onMounted(() => {
    if (osSupported) {
      updateVoiceList()
      window.speechSynthesis.addEventListener('voiceschanged', updateVoiceList)
    }
    void piperEngine.available().then((available) => {
      piperReady.value = available
    })
  })

  onUnmounted(() => {
    if (osSupported) {
      window.speechSynthesis.removeEventListener('voiceschanged', updateVoiceList)
    }
    stop()
  })

  return {
    allVoiceOptions,
    selectedRatePreset,
    selectedVoiceURI,
    speaking,
    ttsError,
    speak,
    stop,
  }
}
