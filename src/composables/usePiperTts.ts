import { onMounted, onUnmounted, ref } from 'vue'
import type { SpeechRatePreset } from '../types/practice'

export type PiperEngineStatus = 'idle' | 'loading' | 'ready' | 'error'

interface UsePiperTtsOptions {
  initialRatePreset?: SpeechRatePreset
}

interface PiperInitMessage {
  kind: 'init'
  input: string
  speakerId: number
  blobs: Record<string, Blob>
  piperPhonemizeJsUrl: string
  piperPhonemizeWasmUrl: string
  piperPhonemizeDataUrl: string
  modelUrl: string
  modelConfigUrl: string
  onnxruntimeUrl: string
  lengthScale: number
}

interface PiperOutputMessage {
  kind: 'output'
  input: string
  file: Blob
  duration: number
  phonemes: string[]
  phonemeIds: number[]
}

interface PiperFetchMessage {
  kind: 'fetch'
  id: number
  url: string
  loaded?: number
  total?: number
  blob?: Blob
}

interface PiperStderrMessage {
  kind: 'stderr'
  message: string
}

interface PiperCompleteMessage {
  kind: 'complete'
}

type PiperWorkerMessage = PiperOutputMessage | PiperFetchMessage | PiperStderrMessage | PiperCompleteMessage | { kind: 'isAlive'; isAlive: boolean }

const PIPER_BASE = '/piper/'
const MODEL_URL = PIPER_BASE + 'voices/en_US-amy-medium.onnx'
const MODEL_CONFIG_URL = PIPER_BASE + 'voices/en_US-amy-medium.onnx.json'
const WORKER_URL = PIPER_BASE + 'piper_worker.js'
const PHONEMIZE_JS_URL = PIPER_BASE + 'piper_phonemize.js'
const PHONEMIZE_WASM_URL = PIPER_BASE + 'piper_phonemize.wasm'
const PHONEMIZE_DATA_URL = PIPER_BASE + 'piper_phonemize.data'
const ONNXRUNTIME_URL = PIPER_BASE + 'dist/'

const PRIME_TEXT = 'one'

const speechRateByPreset: Record<SpeechRatePreset, number> = {
  normal: 1,
  slightlyFast: 0.85,
  fastest: 0.7,
}

export const usePiperTts = (options: UsePiperTtsOptions = {}) => {
  const engineStatus = ref<PiperEngineStatus>('idle')
  const loadProgress = ref(0)
  const speaking = ref(false)
  const ttsError = ref('')
  const selectedRatePreset = ref<SpeechRatePreset>(options.initialRatePreset ?? 'normal')

  let worker: Worker | null = null
  let speakGeneration = 0
  let suppressUntilGen = 0
  const pendingGens: number[] = []
  let readyResolve: (() => void) | null = null
  let readyPromise: Promise<void> | null = null
  let currentAudio: HTMLAudioElement | null = null
  let currentObjectUrl: string | null = null
  const fileProgress = new Map<string, number>()

  const ensureWorker = () => {
    if (worker) {
      return worker
    }

    worker = new Worker(WORKER_URL)
    worker.addEventListener('message', (event: MessageEvent<PiperWorkerMessage>) => {
      const data = event.data
      if (data.kind === 'output') {
        handleOutput(data)
      } else if (data.kind === 'fetch') {
        handleFetchProgress(data)
      } else if (data.kind === 'stderr') {
        handleStderr(data)
      }
    })
    worker.addEventListener('error', (event: ErrorEvent) => {
      ttsError.value = `语音引擎错误：${event.message}`
      engineStatus.value = 'error'
    })
    return worker
  }

  const computeLoadProgress = () => {
    if (fileProgress.size === 0) {
      return
    }
    let total = 0
    let loaded = 0
    for (const value of fileProgress.values()) {
      total += 100
      loaded += value
    }
    const overall = total > 0 ? Math.round((loaded / total) * 100) : 0
    loadProgress.value = overall
  }

  const handleFetchProgress = (data: PiperFetchMessage) => {
    if (data.blob) {
      fileProgress.set(data.url, 100)
      computeLoadProgress()
      return
    }

    if (data.total) {
      const pct = data.loaded ? Math.round((data.loaded / data.total) * 100) : 0
      fileProgress.set(data.url, pct)
      computeLoadProgress()
    }
  }

  const handleStderr = (data: PiperStderrMessage) => {
    if (engineStatus.value === 'loading') {
      engineStatus.value = 'error'
      ttsError.value = `语音引擎初始化失败：${data.message}`
      pendingGens.length = 0
      if (readyResolve) {
        readyResolve()
        readyResolve = null
      }
    } else {
      ttsError.value = `语音合成失败：${data.message}`
    }
  }

  const handleOutput = (data: PiperOutputMessage) => {
    if (engineStatus.value === 'loading') {
      engineStatus.value = 'ready'
      loadProgress.value = 100
      pendingGens.length = 0
      if (readyResolve) {
        readyResolve()
        readyResolve = null
      }
      return
    }

    const outGen = pendingGens.shift() ?? -1
    if (outGen < 0) {
      return
    }
    if (outGen <= suppressUntilGen) {
      return
    }

    if (currentAudio) {
      currentAudio.pause()
    }
    if (currentObjectUrl) {
      URL.revokeObjectURL(currentObjectUrl)
    }
    currentObjectUrl = URL.createObjectURL(data.file)
    const audio = new Audio(currentObjectUrl)
    currentAudio = audio
    speaking.value = true
    audio.onended = () => {
      speaking.value = false
      currentAudio = null
      if (currentObjectUrl) {
        URL.revokeObjectURL(currentObjectUrl)
        currentObjectUrl = null
      }
    }
    audio.onerror = () => {
      speaking.value = false
      currentAudio = null
      ttsError.value = '音频播放失败。'
    }
    void audio.play().catch((error: DOMException) => {
      speaking.value = false
      currentAudio = null
      if (currentObjectUrl) {
        URL.revokeObjectURL(currentObjectUrl)
        currentObjectUrl = null
      }
      if (error.name === 'NotAllowedError') {
        ttsError.value = '浏览器阻止了自动播放，请点击页面任意位置后再点击“重复发音”。'
      } else {
        ttsError.value = `音频播放失败：${error.message}`
      }
    })
  }

  const postInit = (text: string, lengthScale: number) => {
    const w = ensureWorker()
    const message: PiperInitMessage = {
      kind: 'init',
      input: text,
      speakerId: 0,
      blobs: {},
      piperPhonemizeJsUrl: PHONEMIZE_JS_URL,
      piperPhonemizeWasmUrl: PHONEMIZE_WASM_URL,
      piperPhonemizeDataUrl: PHONEMIZE_DATA_URL,
      modelUrl: MODEL_URL,
      modelConfigUrl: MODEL_CONFIG_URL,
      onnxruntimeUrl: ONNXRUNTIME_URL,
      lengthScale,
    }
    w.postMessage(message)
  }

  const prime = () => {
    if (readyPromise) {
      return readyPromise
    }

    engineStatus.value = 'loading'
    ttsError.value = ''
    readyPromise = new Promise<void>((resolve) => {
      readyResolve = resolve
    })

    ensureWorker()
    postInit(PRIME_TEXT, speechRateByPreset[selectedRatePreset.value])

    return readyPromise
  }

  const ensureReady = async () => {
    if (engineStatus.value === 'ready') {
      return
    }
    if (readyPromise) {
      await readyPromise
    } else {
      await prime()
    }
  }

  const speak = async (text: string) => {
    const trimmedText = text.trim()
    if (!trimmedText) {
      ttsError.value = '朗读文本不能为空。'
      return
    }

    ttsError.value = ''
    await ensureReady()
    if (engineStatus.value === 'error') {
      return
    }

    const gen = ++speakGeneration
    pendingGens.push(gen)

    if (currentAudio) {
      currentAudio.pause()
      currentAudio = null
    }

    postInit(trimmedText, speechRateByPreset[selectedRatePreset.value])
  }

  const stop = () => {
    suppressUntilGen = ++speakGeneration
    pendingGens.length = 0
    if (currentAudio) {
      currentAudio.pause()
      currentAudio = null
    }
    if (currentObjectUrl) {
      URL.revokeObjectURL(currentObjectUrl)
      currentObjectUrl = null
    }
    speaking.value = false
  }

  onMounted(() => {
    void prime()
  })

  onUnmounted(() => {
    stop()
    if (worker) {
      worker.terminate()
      worker = null
    }
  })

  return {
    engineStatus,
    loadProgress,
    speaking,
    ttsError,
    selectedRatePreset,
    speak,
    stop,
  }
}
