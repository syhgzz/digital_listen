import { computed, onMounted, onUnmounted, ref } from 'vue'
import type { SpeechRatePreset } from '../types/practice'
import { createTtsEngines, type TtsEngines } from '../tts'
import {
  AUTO_VOICE_KEY,
  TtsCanceledError,
  isCanceledError,
  isPlaybackBlockedError,
  type TtsEngine,
  type TtsEngineId,
  type TtsEngineStatus,
  type TtsModelSource,
  type TtsProgress,
  type TtsVoiceOption,
} from '../tts/types'

export interface UseTtsOptions {
  initialVoiceKey?: string
  initialRatePreset?: SpeechRatePreset
}

export const speechRateByPreset: Record<SpeechRatePreset, number> = {
  normal: 1,
  slightlyFast: 1.2,
  fastest: 1.4,
}

interface TtsDebugState {
  activeEngineId: TtsEngineId | null
  lastText: string
  lastClipDurationMs: number
  lastClipRms: number
  engineStatus: TtsEngineStatus
  modelSource: string | null
  voiceId: string
}

declare global {
  interface Window {
    __ttsDebug?: TtsDebugState
  }
}

const TEST_SENTENCE = 'This is the listening voice.'

export const useTts = (options: UseTtsOptions = {}) => {
  const selectedVoiceKey = ref(options.initialVoiceKey ?? AUTO_VOICE_KEY)
  const selectedRatePreset = ref<SpeechRatePreset>(options.initialRatePreset ?? 'normal')
  const voiceOptions = ref<TtsVoiceOption[]>([])
  const speaking = ref(false)
  const error = ref('')
  const notice = ref('')
  const prepareProgress = ref<TtsProgress | null>(null)
  const isPreparing = ref(false)
  const needsGesture = ref(false)
  const activeEngineId = ref<TtsEngineId | null>(null)
  const engineStatus = ref<TtsEngineStatus>('idle')
  const modelSource = ref<TtsModelSource | null>(null)

  const engines: TtsEngines = createTtsEngines({
    onDebugClip: ({ text, durationMs, rms }) => {
      if (import.meta.env.DEV) {
        window.__ttsDebug = {
          ...(window.__ttsDebug ?? {
            activeEngineId: null,
            engineStatus: 'idle',
            lastText: '',
            lastClipDurationMs: 0,
            lastClipRms: 0,
            modelSource: null,
            voiceId: '',
          }),
          activeEngineId: activeEngineId.value,
          lastText: text,
          lastClipDurationMs: durationMs,
          lastClipRms: rms,
          modelSource: engines.piper.getModelSource(),
          voiceId: engines.piper.getSelectedVoiceId(),
        }
      }
    },
  })

  let speakGeneration = 0
  let pendingGestureText: string | null = null
  let disposed = false

  const rate = computed(() => speechRateByPreset[selectedRatePreset.value])
  const hasLocalVoice = ref(false)

  const selectedOption = computed<TtsVoiceOption>(() => {
    const found = voiceOptions.value.find((option) => option.key === selectedVoiceKey.value)
    return (
      found ??
      voiceOptions.value.find((option) => option.key === AUTO_VOICE_KEY) ?? {
        key: AUTO_VOICE_KEY,
        engineId: 'piper',
        label: '自动（本地语音优先）',
        group: '本地引擎',
        available: false,
      }
    )
  })

  const buildVoiceOptions = () => {
    const list: TtsVoiceOption[] = []

    list.push({
      key: AUTO_VOICE_KEY,
      engineId: 'piper',
      label: '自动（本地语音优先）',
      group: '本地引擎',
      available: engines.piper.getStatus() !== 'unavailable',
    })

    for (const voice of engines.piper.getVoices()) {
      list.push({
        key: `piper:${voice.id}`,
        engineId: 'piper',
        voiceId: voice.id,
        label: voice.label ?? `${voice.name}（${voice.quality}）`,
        group: '本地引擎',
        available: true,
      })
    }

    for (const voice of engines.system.getVoices()) {
      list.push({
        key: `system:${voice.voiceURI}`,
        engineId: 'system',
        voiceId: voice.voiceURI,
        label: `${voice.name}（${voice.lang}）`,
        group: '系统语音',
        available: true,
      })
    }

    if (engines.remote.isConfigured()) {
      list.push({
        key: 'remote:',
        engineId: 'remote',
        label: '在线语音引擎',
        group: '在线引擎',
        available: engines.remote.getStatus() !== 'unavailable',
      })
    }

    voiceOptions.value = list
    hasLocalVoice.value = engines.piper.getVoices().length > 0
    if (!list.some((option) => option.key === selectedVoiceKey.value)) {
      selectedVoiceKey.value = AUTO_VOICE_KEY
    }
  }

  const engineForOption = (option: TtsVoiceOption): TtsEngine => {
    if (option.engineId === 'system') {
      return engines.system
    }
    if (option.engineId === 'remote') {
      return engines.remote
    }
    return engines.piper
  }

  const applyVoiceSelection = (option: TtsVoiceOption) => {
    if (option.engineId === 'piper' && option.voiceId) {
      engines.piper.setVoiceId(option.voiceId)
    }
    if (option.engineId === 'system' && option.voiceId) {
      engines.system.setVoiceURI(option.voiceId)
    }
  }

  const syncStatus = () => {
    const status = engineForOption(selectedOption.value).getStatus()
    engineStatus.value = status
    modelSource.value = engines.piper.getModelSource()
    if (import.meta.env.DEV) {
      window.__ttsDebug = {
        ...(window.__ttsDebug ?? {
          activeEngineId: null,
          lastText: '',
          lastClipDurationMs: 0,
          lastClipRms: 0,
          engineStatus: status,
          modelSource: null,
          voiceId: '',
        }),
        activeEngineId: activeEngineId.value,
        engineStatus: status,
        modelSource: engines.piper.getModelSource(),
        voiceId: engines.piper.getSelectedVoiceId(),
      }
    }
  }

  const prepare = async (): Promise<void> => {
    if (disposed) {
      return
    }
    isPreparing.value = true
    error.value = ''
    try {
      await engines.piper.prepare((progress) => {
        prepareProgress.value = progress
      })
    } catch (piperError) {
      error.value = piperError instanceof Error ? piperError.message : '本地语音引擎不可用。'
    }
    try {
      await engines.system.prepare()
    } catch {
      // System voices are optional; the local engine is the primary one.
    }
    prepareProgress.value = null
    isPreparing.value = false
    buildVoiceOptions()
    syncStatus()
  }

  const stop = () => {
    speakGeneration += 1
    pendingGestureText = null
    for (const engine of engines.chain) {
      engine.cancel()
    }
    speaking.value = false
  }

  const speak = async (text: string): Promise<void> => {
    const trimmed = text.trim()
    if (!trimmed) {
      error.value = '朗读文本不能为空。'
      return
    }

    const generation = ++speakGeneration
    error.value = ''
    notice.value = ''
    const option = selectedOption.value
    applyVoiceSelection(option)

    const primary = engineForOption(option)
    const chain = [primary, ...engines.chain.filter((engine) => engine !== primary)]

    let lastError = ''
    for (const engine of chain) {
      if (generation !== speakGeneration) {
        return
      }
      activeEngineId.value = engine.id
      try {
        await engine.speak(trimmed, {
          rate: rate.value,
          onStart: () => {
            speaking.value = true
          },
          onEnd: () => {
            speaking.value = false
          },
        })
        if (generation !== speakGeneration) {
          return
        }
        speaking.value = false
        if (engine !== primary) {
          notice.value = `已自动切换到${engine.label}。`
        }
        syncStatus()
        return
      } catch (speakError) {
        if (speakError instanceof TtsCanceledError || isCanceledError(speakError) || generation !== speakGeneration) {
          return
        }
        if (isPlaybackBlockedError(speakError)) {
          speaking.value = false
          needsGesture.value = true
          pendingGestureText = trimmed
          return
        }
        speaking.value = false
        lastError = speakError instanceof Error ? speakError.message : '语音播放失败。'
        syncStatus()
      }
    }

    error.value = lastError || '语音播放失败。'
  }

  const retryPendingAfterGesture = () => {
    if (!needsGesture.value || !pendingGestureText) {
      return
    }
    const text = pendingGestureText
    pendingGestureText = null
    needsGesture.value = false
    void speak(text)
  }

  const testVoice = async (): Promise<void> => {
    await speak(TEST_SENTENCE)
  }

  onMounted(() => {
    window.addEventListener('pointerdown', retryPendingAfterGesture, true)
    window.addEventListener('keydown', retryPendingAfterGesture, true)
    void prepare()
  })

  onUnmounted(() => {
    disposed = true
    window.removeEventListener('pointerdown', retryPendingAfterGesture, true)
    window.removeEventListener('keydown', retryPendingAfterGesture, true)
    stop()
    engines.piper.dispose()
    engines.system.dispose()
    engines.remote.dispose()
  })

  return {
    activeEngineId,
    engineStatus,
    error,
    hasLocalVoice,
    isPreparing,
    modelSource,
    needsGesture,
    notice,
    prepare,
    prepareProgress,
    rate,
    selectedRatePreset,
    selectedVoiceKey,
    speak,
    speaking,
    stop,
    testVoice,
    voiceOptions,
  }
}
