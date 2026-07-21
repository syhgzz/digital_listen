import { computed, onMounted, onUnmounted, ref } from 'vue'
import type { SpeechRatePreset } from '../types/practice'

declare global {
  interface Window {
    meSpeak?: MeSpeakAPI
  }
}

interface MeSpeakAPI {
  loadVoice: (url: string, callback: (success: boolean, msg: string) => void) => void
  speak: (
    text: string,
    options?: Record<string, unknown>,
    callback?: (success: boolean, id: number) => void,
  ) => number
  stop: (...ids: number[]) => number
  isVoiceLoaded: (voice: string) => boolean
  canPlay: () => boolean
}

export type TtsEngineSource = 'mespeak' | 'none'

export const MESPEAK_ENGINE_ID = '__mespeak_engine__'

export interface VoiceOption {
  id: string
  name: string
  lang: string
  source: TtsEngineSource
  sourceLabel: string
}

const speechRateByPreset: Record<SpeechRatePreset, number> = {
  normal: 160,
  slightlyFast: 200,
  fastest: 240,
}

interface UseTtsOptions {
  initialRatePreset?: SpeechRatePreset
}

export const useTts = (options: UseTtsOptions = {}) => {
  const selectedVoiceURI = ref(MESPEAK_ENGINE_ID)
  const selectedRatePreset = ref<SpeechRatePreset>(options.initialRatePreset ?? 'normal')
  const speaking = ref(false)
  const ttsError = ref('')
  const activeEngineSource = ref<TtsEngineSource>('none')
  const meSpeakReady = ref(false)
  let currentSpeakId: number | null = null
  let canceledBySelf = false

  const anyEngineConfigured = computed(() => meSpeakReady.value)

  const allVoiceOptions = computed<VoiceOption[]>(() => [
    {
      id: MESPEAK_ENGINE_ID,
      name: 'meSpeak 英文语音',
      lang: 'en-US',
      source: 'mespeak',
      sourceLabel: '内置引擎',
    },
  ])

  const stop = () => {
    const ms = window.meSpeak
    if (ms) {
      if (currentSpeakId !== null) {
        ms.stop(currentSpeakId)
      }
      ms.stop()
    }
    currentSpeakId = null
    speaking.value = false
  }

  const speak = async (text: string) => {
    const trimmedText = text.trim()
    if (!trimmedText) {
      ttsError.value = '朗读文本不能为空。'
      return
    }

    if (!meSpeakReady.value) {
      return
    }

    ttsError.value = ''
    canceledBySelf = true
    stop()
    canceledBySelf = false

    const ms = window.meSpeak
    if (!ms) {
      ttsError.value = '语音引擎不可用。'
      return
    }

    const speed = speechRateByPreset[selectedRatePreset.value]

    return new Promise<void>((resolve, reject) => {
      const id = ms.speak(trimmedText, { speed }, (success: boolean) => {
        speaking.value = false
        if (currentSpeakId === id) {
          currentSpeakId = null
        }
        if (canceledBySelf) {
          resolve()
          return
        }
        if (success) {
          activeEngineSource.value = 'mespeak'
          resolve()
        } else {
          activeEngineSource.value = 'none'
          ttsError.value = '语音播放失败。'
          reject(new Error('语音播放失败。'))
        }
      })

      if (!id) {
        reject(new Error('语音引擎无法启动。'))
        return
      }

      currentSpeakId = id
      speaking.value = true
    })
  }

  const initMeSpeak = () => {
    const ms = window.meSpeak
    if (!ms) {
      ttsError.value = '语音引擎脚本加载失败。'
      return
    }

    ms.loadVoice('en/en-us', (success: boolean) => {
      if (success) {
        meSpeakReady.value = true
        activeEngineSource.value = 'mespeak'
      } else {
        ttsError.value = '语音数据加载失败。'
      }
    })
  }

  onMounted(() => {
    if (window.meSpeak) {
      initMeSpeak()
      return
    }

    const checkInterval = window.setInterval(() => {
      if (window.meSpeak) {
        window.clearInterval(checkInterval)
        initMeSpeak()
      }
    }, 100)

    window.setTimeout(() => {
      window.clearInterval(checkInterval)
      if (!window.meSpeak) {
        ttsError.value = '语音引擎加载超时。'
      }
    }, 10_000)
  })

  onUnmounted(() => {
    stop()
  })

  return {
    activeEngineSource,
    allVoiceOptions,
    anyEngineConfigured,
    meSpeakReady,
    selectedRatePreset,
    selectedVoiceURI,
    speaking,
    ttsError,
    speak,
    stop,
  }
}
