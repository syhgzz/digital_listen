import { onUnmounted, ref } from 'vue'
import type { SpeechRatePreset } from '../types/practice'

export type TtsEngineStatus = 'idle' | 'loading' | 'ready' | 'error'

const WORKER_URL = '/sherpa/sherpa-tts.worker.js'
const ENGINE_SETUP_HINT = '引擎未就绪，请先运行 npm run setup:tts 下载本地语音引擎文件。'

const speechSpeedByPreset: Record<SpeechRatePreset, number> = {
  normal: 1,
  slightlyFast: 1.2,
  fastest: 1.4,
}

export const useSherpaTts = () => {
  const engineStatus = ref<TtsEngineStatus>('idle')
  const engineMessage = ref('')
  const speaking = ref(false)

  let worker: Worker | null = null
  let loadingPromise: Promise<void> | null = null
  let audioContext: AudioContext | null = null
  let currentSource: AudioBufferSourceNode | null = null
  let speakGeneration = 0

  const markLoadingError = (message: string) => {
    engineStatus.value = 'error'
    engineMessage.value = message
  }

  const createWorker = () =>
    new Promise<void>((resolve, reject) => {
      const createdWorker = new Worker(WORKER_URL)
      const finishLoading = (ok: boolean, message: string) => {
        if (ok) {
          engineStatus.value = 'ready'
          engineMessage.value = ''
          resolve()
        } else {
          markLoadingError(message)
          createdWorker.terminate()
          if (worker === createdWorker) {
            worker = null
          }
          reject(new Error(message))
        }
      }

      createdWorker.onmessage = (event) => {
        const data = event.data as { type: string; status?: string; message?: string }
        if (data?.type === 'status') {
          engineMessage.value = data.status ?? ''
          return
        }
        if (data?.type === 'ready') {
          finishLoading(true, '')
          return
        }
        if (data?.type === 'error') {
          finishLoading(false, data.message || ENGINE_SETUP_HINT)
        }
      }
      createdWorker.onerror = () => {
        finishLoading(false, ENGINE_SETUP_HINT)
      }

      worker = createdWorker
      engineStatus.value = 'loading'
      window.setTimeout(() => {
        if (engineStatus.value === 'loading') {
          finishLoading(false, '本地语音引擎加载超时，请检查 public/sherpa 目录是否已包含引擎文件。')
        }
      }, 60_000)
    })

  const ensureEngineReady = () => {
    if (engineStatus.value === 'ready') {
      return Promise.resolve()
    }
    if (loadingPromise) {
      return loadingPromise
    }
    loadingPromise = createWorker().finally(() => {
      loadingPromise = null
    })
    return loadingPromise
  }

  const ensureAudioContext = () => {
    if (!audioContext) {
      audioContext = new AudioContext()
    }
    if (audioContext.state === 'suspended') {
      void audioContext.resume()
    }
    return audioContext
  }

  const stopPlayback = () => {
    if (currentSource) {
      try {
        currentSource.onended = null
        currentSource.stop()
      } catch {
        // AudioBufferSourceNode.stop() throws if already stopped; safe to ignore.
      }
      currentSource = null
    }
  }

  const stop = () => {
    speakGeneration += 1
    stopPlayback()
    speaking.value = false
  }

  const playSamples = async (samples: Float32Array, sampleRate: number) => {
    const context = ensureAudioContext()
    const buffer = context.createBuffer(1, samples.length, sampleRate)
    buffer.getChannelData(0).set(samples)

    const source = context.createBufferSource()
    source.buffer = buffer
    source.connect(context.destination)
    currentSource = source

    const gen = speakGeneration
    await new Promise<void>((resolve) => {
      source.onended = () => {
        if (gen === speakGeneration) {
          speaking.value = false
        }
        resolve()
      }
      source.start()
    })
  }

  const speak = async (text: string, ratePreset: SpeechRatePreset = 'normal') => {
    const trimmedText = text.trim()
    if (!trimmedText) {
      return
    }

    try {
      await ensureEngineReady()
    } catch {
      return
    }

    if (!worker) {
      return
    }

    stop()
    const gen = ++speakGeneration
    speaking.value = true

    await new Promise<void>((resolve, reject) => {
      const currentWorker = worker
      if (!currentWorker) {
        reject(new Error('TTS worker is not available.'))
        return
      }

      const handleMessage = (event: MessageEvent) => {
        const data = event.data as {
          type: string
          id?: string
          samples?: Float32Array
          sampleRate?: number
          message?: string
        }
        if (data?.type !== 'audio' && data?.type !== 'generate-error') {
          return
        }
        if (data.id !== requestKey) {
          return
        }
        currentWorker.removeEventListener('message', handleMessage)
        if (gen !== speakGeneration) {
          resolve()
          return
        }
        if (data.type === 'generate-error') {
          reject(new Error(data.message ?? '语音合成失败。'))
          return
        }
        const samples = data.samples
        const sampleRate = data.sampleRate ?? 22050
        if (!samples || samples.length === 0) {
          resolve()
          return
        }
        playSamples(samples, sampleRate).then(resolve, reject)
      }

      const requestKey = `speak-${gen}`
      currentWorker.addEventListener('message', handleMessage)
      currentWorker.postMessage({
        type: 'generate',
        id: requestKey,
        text: trimmedText,
        speed: speechSpeedByPreset[ratePreset] ?? 1,
      })
    }).catch((error) => {
      if (gen === speakGeneration) {
        speaking.value = false
        engineMessage.value = error instanceof Error ? error.message : '语音播放失败。'
      }
    })
  }

  onUnmounted(() => {
    stop()
    worker?.terminate()
    worker = null
    if (audioContext) {
      void audioContext.close()
      audioContext = null
    }
  })

  return {
    engineMessage,
    engineStatus,
    speaking,
    speak,
    stop,
  }
}
