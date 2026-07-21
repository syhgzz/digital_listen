import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import type { SpeechRatePreset } from '../types/practice'
import { createKokoroEngine, type KokoroEngine } from './useTtsEngine'

export type TtsEngineSource = 'kokoro' | 'none'

export const KOKORO_VOICE_PREFIX = '__kokoro__'

export interface VoiceOption {
  id: string
  name: string
  lang: string
  source: TtsEngineSource
  sourceLabel: string
}

export const useTts = () => {
  const selectedVoiceURI = ref('')
  const selectedRatePreset = ref<SpeechRatePreset>('normal')
  const speaking = ref(false)
  const ttsError = ref('')
  let speakGeneration = 0

  const kokoroEngine: KokoroEngine = createKokoroEngine()

  const engineReady = kokoroEngine.ready
  const engineLoading = kokoroEngine.loading
  const engineLoadProgress = kokoroEngine.loadProgress

  const allVoiceOptions = computed<VoiceOption[]>(() => {
    const options: VoiceOption[] = []

    if (kokoroEngine.ready.value) {
      for (const voice of kokoroEngine.voices) {
        options.push({
          id: `${KOKORO_VOICE_PREFIX}:${voice.id}`,
          name: voice.name,
          lang: 'en-US',
          source: 'kokoro',
          sourceLabel: 'Kokoro',
        })
      }
    }

    return options
  })

  watch(
    allVoiceOptions,
    (options) => {
      if (options.length === 0) return

      const isCurrentStillAvailable = options.some((opt) => opt.id === selectedVoiceURI.value)
      if (!isCurrentStillAvailable) {
        selectedVoiceURI.value = options[0].id
      }
    },
    { immediate: true },
  )

  const stop = () => {
    kokoroEngine.stop()
    speaking.value = false
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
      if (!selectedOption || !kokoroEngine.ready.value) {
        return
      }

      const voiceId = selectedOption.id.startsWith(KOKORO_VOICE_PREFIX + ':')
        ? selectedOption.id.slice(KOKORO_VOICE_PREFIX.length + 1)
        : undefined
      await kokoroEngine.speak(trimmedText, voiceId)
      if (gen !== speakGeneration) return
    } catch (error) {
      if (gen !== speakGeneration) return
      ttsError.value = error instanceof Error ? error.message : '语音播放失败。'
    }
  }

  onMounted(() => {
    void kokoroEngine.init()
  })

  onUnmounted(() => {
    stop()
  })

  return {
    allVoiceOptions,
    engineReady,
    engineLoading,
    engineLoadProgress,
    selectedRatePreset,
    selectedVoiceURI,
    speaking,
    ttsError,
    speak,
    stop,
  }
}
