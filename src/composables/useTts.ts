import { computed, onMounted, onUnmounted, ref } from 'vue'
import type { SpeechRatePreset } from '../types/practice'
import { createTtsEngines, type TtsEngines } from '../tts'
import { defaultVoiceKey, resolveVoiceKey } from '../tts/piperAssets'
import {
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
  const selectedVoiceKey = ref(options.initialVoiceKey ?? '')
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
  let lastSpokenVoiceKey = ''
  let disposed = false

  const rate = computed(() => speechRateByPreset[selectedRatePreset.value])
  const hasLocalVoice = ref(false)

  const selectedOption = computed<TtsVoiceOption>(() => {
    const found = voiceOptions.value.find((option) => option.key === selectedVoiceKey.value)
    if (found) {
      return found
    }
    const fallbackKey = defaultVoiceKey(engines.piper.getVoices())
    return (
      voiceOptions.value.find((option) => option.key === fallbackKey) ??
      voiceOptions.value[0] ?? {
        key: fallbackKey,
        engineId: 'piper',
        label: '本地语音',
        group: '本地引擎',
        available: false,
      }
    )
  })

  const buildVoiceOptions = () => {
    const list: TtsVoiceOption[] = []

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
    selectedVoiceKey.value = resolveVoiceKey(
      selectedVoiceKey.value,
      list.map((option) => option.key),
      defaultVoiceKey(engines.piper.getVoices()),
    )
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

  const handleProgress = (progress: TtsProgress) => {
    prepareProgress.value = progress
    if (progress.stage === 'voice') {
      isPreparing.value = false
    }
  }

  /** Fetches the (tiny) voice manifest and system voices so the list shows up at once. */
  const loadVoiceList = async (): Promise<void> => {
    if (disposed) {
      return
    }
    await engines.piper.loadVoices().catch(() => [])
    buildVoiceOptions()
    try {
      await engines.system.prepare()
    } catch {
      // System voices are optional; the local engine is the primary one.
    }
    buildVoiceOptions()
    syncStatus()
  }

  const prepare = async (): Promise<void> => {
    if (disposed) {
      return
    }
    isPreparing.value = true
    error.value = ''
    try {
      await engines.piper.prepare(handleProgress)
    } catch (piperError) {
      error.value = piperError instanceof Error ? piperError.message : '本地语音引擎不可用。'
    }
    try {
      await engines.system.prepare()
    } catch {
      // System voices are optional; the local engine is the primary one.
    }
    if (!speaking.value) {
      prepareProgress.value = null
      isPreparing.value = false
    }
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
    const voiceChanged = option.key !== lastSpokenVoiceKey
    applyVoiceSelection(option)
    if (voiceChanged && option.engineId === 'piper') {
      notice.value = `正在准备声线：${option.label}（首次约 60MB，之后会缓存）…`
    }

    const primary = engineForOption(option)
    const chain = [primary, ...engines.chain.filter((engine) => engine !== primary)]

    let lastError = ''
    for (const engine of chain) {
      if (generation !== speakGeneration) {
        return
      }
      activeEngineId.value = engine.id
      if (engine.kind !== 'system') {
        isPreparing.value = true
      }
      try {
        await engine.speak(trimmed, {
          rate: rate.value,
          onProgress: handleProgress,
          onStart: () => {
            speaking.value = true
            isPreparing.value = false
            prepareProgress.value = null
            notice.value = ''
          },
          onEnd: () => {
            speaking.value = false
          },
        })
        if (generation !== speakGeneration) {
          return
        }
        speaking.value = false
        isPreparing.value = false
        prepareProgress.value = null
        lastSpokenVoiceKey = option.key
        if (engine !== primary) {
          notice.value = `已自动切换到${engine.label}。`
        }
        syncStatus()
        return
      } catch (speakError) {
        isPreparing.value = false
        prepareProgress.value = null
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
    // List voices first (a few KB) so the dropdown is never blank, then load
    // the 60MB model in the background.
    void loadVoiceList().then(() => prepare())
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
