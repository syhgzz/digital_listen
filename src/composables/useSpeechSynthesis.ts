import { computed, onMounted, onUnmounted, ref, watch } from 'vue'

interface UseSpeechSynthesisOptions {
  langPrefix?: string
  maxVoices?: number
  initialVoiceURI?: string
}

const isSpeechSynthesisAvailable = (): boolean =>
  typeof window !== 'undefined' &&
  'speechSynthesis' in window &&
  'SpeechSynthesisUtterance' in window

export const useSpeechSynthesis = (options: UseSpeechSynthesisOptions = {}) => {
  const supported = isSpeechSynthesisAvailable()
  const selectedVoiceURI = ref(options.initialVoiceURI ?? '')
  const allVoices = ref<SpeechSynthesisVoice[]>([])
  const speaking = ref(false)
  const ttsError = ref('')

  const voicePrefix = (options.langPrefix ?? 'en-US').toLowerCase()
  const maxVoices = options.maxVoices ?? 5

  const availableVoices = computed(() =>
    allVoices.value
      .filter((voice) => voice.lang.toLowerCase().startsWith(voicePrefix))
      .slice(0, maxVoices),
  )

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
        selectedVoiceURI.value = voices[0].voiceURI
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
    if (selectedVoice) {
      utterance.voice = selectedVoice
    }

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
    selectedVoiceURI,
    speaking,
    supported,
    ttsError,
    speak,
    stop,
  }
}
