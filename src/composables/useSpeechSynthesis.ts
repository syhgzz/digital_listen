import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import type { SpeechRatePreset } from '../types/practice'

interface UseSpeechSynthesisOptions {
  langPrefix?: string
  maxVoices?: number
  initialVoiceURI?: string
  initialRatePreset?: SpeechRatePreset
}

const isSpeechSynthesisAvailable = (): boolean =>
  typeof window !== 'undefined' &&
  'speechSynthesis' in window &&
  'SpeechSynthesisUtterance' in window

const NATURAL_VOICE_KEYWORDS = ['natural', 'neural', 'premium', 'enhanced', 'siri']

const speechRateByPreset: Record<SpeechRatePreset, number> = {
  normal: 1,
  slightlyFast: 1.2,
  fastest: 1.4,
}

const getVoicePriority = (voice: SpeechSynthesisVoice): number => {
  const name = voice.name.toLowerCase()
  const keywordScore = NATURAL_VOICE_KEYWORDS.some((keyword) => name.includes(keyword)) ? 4 : 0
  const defaultScore = voice.default ? 2 : 0
  const googleScore = name.includes('google') ? 1 : 0

  return keywordScore + defaultScore + googleScore
}

export const useSpeechSynthesis = (options: UseSpeechSynthesisOptions = {}) => {
  const supported = isSpeechSynthesisAvailable()
  const selectedVoiceURI = ref(options.initialVoiceURI ?? '')
  const selectedRatePreset = ref<SpeechRatePreset>(options.initialRatePreset ?? 'normal')
  const allVoices = ref<SpeechSynthesisVoice[]>([])
  const speaking = ref(false)
  const ttsError = ref('')

  const voicePrefix = (options.langPrefix ?? 'en-US').toLowerCase()
  const maxVoices = options.maxVoices ?? 5

  const availableVoices = computed(() => {
    const filtered = [...allVoices.value]
      .filter((voice) => voice.lang.toLowerCase().startsWith(voicePrefix))
      .sort((left, right) => {
        const priorityDiff = getVoicePriority(right) - getVoicePriority(left)
        if (priorityDiff !== 0) {
          return priorityDiff
        }
        return left.name.localeCompare(right.name)
      })

    const top = filtered.slice(0, maxVoices)
    const defaultVoice = filtered.find((voice) => voice.default)
    if (defaultVoice && !top.some((voice) => voice.voiceURI === defaultVoice.voiceURI)) {
      top[top.length - 1] = defaultVoice
    }
    return top
  })

  const updateVoiceList = () => {
    if (!supported) {
      return
    }
    allVoices.value = window.speechSynthesis.getVoices()
  }

  watch(
    availableVoices,
    (voices) => {
      if (voices.length === 0) {
        return
      }

      const isCurrentStillAvailable = voices.some((voice) => voice.voiceURI === selectedVoiceURI.value)
      if (!isCurrentStillAvailable) {
        const systemDefault = voices.find((voice) => voice.default)
        selectedVoiceURI.value = systemDefault ? systemDefault.voiceURI : voices[0].voiceURI
      }
    },
    { immediate: true },
  )

  const stop = () => {
    if (!supported) {
      return
    }
    window.speechSynthesis.cancel()
    speaking.value = false
  }

  const speak = (text: string) => {
    if (!supported) {
      ttsError.value = '当前浏览器不支持语音合成功能。'
      return
    }

    const trimmedText = text.trim()
    if (!trimmedText) {
      ttsError.value = '朗读文本不能为空。'
      return
    }

    ttsError.value = ''
    stop()

    const utterance = new SpeechSynthesisUtterance(trimmedText)
    utterance.lang = 'en-US'

    const selectedVoice = availableVoices.value.find((voice) => voice.voiceURI === selectedVoiceURI.value)
      ?? allVoices.value.find((voice) => voice.default)
      ?? allVoices.value[0]
    if (selectedVoice) {
      utterance.voice = selectedVoice
    }
    utterance.rate = speechRateByPreset[selectedRatePreset.value]

    utterance.onstart = () => {
      speaking.value = true
    }
    utterance.onend = () => {
      speaking.value = false
    }
    utterance.onerror = (event) => {
      speaking.value = false
      ttsError.value = `语音播放失败：${event.error}`
    }

    window.speechSynthesis.speak(utterance)
  }

  onMounted(() => {
    if (!supported) {
      return
    }
    updateVoiceList()
    window.speechSynthesis.addEventListener('voiceschanged', updateVoiceList)
  })

  onUnmounted(() => {
    if (!supported) {
      return
    }
    window.speechSynthesis.removeEventListener('voiceschanged', updateVoiceList)
    stop()
  })

  return {
    availableVoices,
    selectedRatePreset,
    selectedVoiceURI,
    speaking,
    supported,
    ttsError,
    speak,
    stop,
  }
}
