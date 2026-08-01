import { onUnmounted, ref } from 'vue'
import type { SpeechRatePreset } from '../types/practice'
import type { PiperRequest, PiperResponse } from '../workers/piper.worker'

interface UseTtsOptions {
  initialRatePreset?: SpeechRatePreset
}

interface AudioWindow extends Window {
  AudioContext?: typeof AudioContext
  webkitAudioContext?: typeof AudioContext
}

interface PitchPreservingAudio extends HTMLAudioElement {
  mozPreservesPitch?: boolean
  webkitPreservesPitch?: boolean
}

const speechRateByPreset: Record<SpeechRatePreset, number> = {
  normal: 1,
  slightlyFast: 1.2,
  fastest: 1.4,
}

const SILENT_WAV_DATA_URL =
  'data:audio/wav;base64,UklGRiwAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQgAAACAgICAgICAgA=='

const getAudioContextConstructor = (): typeof AudioContext | undefined => {
  if (typeof window === 'undefined') {
    return undefined
  }
  return window.AudioContext ?? (window as AudioWindow).webkitAudioContext
}

const hasRequiredApis = (): boolean =>
  typeof window !== 'undefined' &&
  typeof Audio !== 'undefined' &&
  typeof Worker !== 'undefined' &&
  typeof WebAssembly !== 'undefined' &&
  Boolean(getAudioContextConstructor())

export const useTts = (options: UseTtsOptions = {}) => {
  const supported = ref(hasRequiredApis())
  const selectedRatePreset = ref<SpeechRatePreset>(options.initialRatePreset ?? 'normal')
  const preparing = ref(false)
  const downloadProgress = ref<number | null>(null)
  const speaking = ref(false)
  const ttsError = ref('')

  let requestId = 0
  let worker: Worker | null = null
  let audioContext: AudioContext | null = null
  let mediaElement: PitchPreservingAudio | null = null
  let mediaUnlocked = false
  let currentObjectUrl: string | null = null
  let playbackToken = 0

  const ensureWorker = (): Worker | null => {
    if (!supported.value) {
      return null
    }
    if (!worker) {
      worker = new Worker(new URL('../workers/piper.worker.ts', import.meta.url), { type: 'module' })
      worker.addEventListener('message', handleWorkerMessage)
      worker.addEventListener('error', handleWorkerError)
    }
    return worker
  }

  const ensureAudioContext = (): AudioContext | null => {
    if (audioContext) {
      return audioContext
    }
    const AudioContextConstructor = getAudioContextConstructor()
    if (!AudioContextConstructor) {
      return null
    }
    audioContext = new AudioContextConstructor()
    return audioContext
  }

  const ensureMediaElement = (): PitchPreservingAudio => {
    if (!mediaElement) {
      mediaElement = new Audio() as PitchPreservingAudio
      mediaElement.setAttribute('playsinline', '')
    }
    return mediaElement
  }

  const unlockMediaElement = (): Promise<void> => {
    if (mediaUnlocked) {
      return Promise.resolve()
    }
    const media = ensureMediaElement()
    const unlockToken = playbackToken
    media.src = SILENT_WAV_DATA_URL
    media.playbackRate = 1
    return media
      .play()
      .then(() => {
        mediaUnlocked = true
        if (unlockToken === playbackToken && !currentObjectUrl) {
          media.pause()
          media.removeAttribute('src')
          media.load()
        }
      })
  }

  const clearCurrentMedia = (token: number, url: string) => {
    if (token !== playbackToken || currentObjectUrl !== url || !mediaElement) {
      return
    }
    mediaElement.onended = null
    mediaElement.onerror = null
    mediaElement.pause()
    mediaElement.removeAttribute('src')
    mediaElement.load()
    URL.revokeObjectURL(url)
    currentObjectUrl = null
  }

  const stopPlayback = () => {
    playbackToken += 1
    if (mediaElement) {
      mediaElement.onended = null
      mediaElement.onerror = null
      mediaElement.pause()
      if (currentObjectUrl) {
        mediaElement.removeAttribute('src')
        mediaElement.load()
        URL.revokeObjectURL(currentObjectUrl)
      }
      currentObjectUrl = null
    }
    speaking.value = false
  }

  const playWithMediaElement = async (audio: Blob, responseRequestId: number): Promise<boolean> => {
    const url = URL.createObjectURL(audio)
    const media = ensureMediaElement()
    const token = ++playbackToken
    media.src = url
    media.playbackRate = speechRateByPreset[selectedRatePreset.value]
    media.preservesPitch = true
    media.mozPreservesPitch = true
    media.webkitPreservesPitch = true

    currentObjectUrl = url
    media.onended = () => {
      if (token === playbackToken && responseRequestId === requestId) {
        clearCurrentMedia(token, url)
        speaking.value = false
      }
    }
    media.onerror = () => {
      const isCurrent = token === playbackToken && responseRequestId === requestId
      if (isCurrent) {
        clearCurrentMedia(token, url)
        speaking.value = false
        preparing.value = false
        ttsError.value = '音频播放失败，请重试。'
      }
    }

    try {
      await media.play()
    } catch (error) {
      const isCurrent = token === playbackToken && responseRequestId === requestId
      if (!isCurrent) {
        return false
      }
      clearCurrentMedia(token, url)
      throw new Error(
        error instanceof Error ? `音频播放失败：${error.message}` : '音频播放失败，请重试。',
      )
    }

    if (token !== playbackToken || responseRequestId !== requestId) {
      return false
    }
    mediaUnlocked = true
    speaking.value = true
    return true
  }

  const playAudio = async (audio: Blob, responseRequestId: number) => {
    const started = await playWithMediaElement(audio, responseRequestId)
    if (started && responseRequestId === requestId) {
      preparing.value = false
      downloadProgress.value = null
    }
  }

  function handleWorkerMessage(event: MessageEvent<PiperResponse>) {
    const response = event.data
    if (response.requestId !== requestId) {
      return
    }

    if (response.type === 'progress') {
      preparing.value = true
      downloadProgress.value = response.total > 0
        ? Math.min(100, Math.round((response.loaded / response.total) * 100))
        : null
      return
    }

    if (response.type === 'error') {
      preparing.value = false
      downloadProgress.value = null
      ttsError.value = `语音合成失败：${response.message}`
      return
    }

    void playAudio(response.audio, response.requestId).catch((error: unknown) => {
      if (response.requestId !== requestId) {
        return
      }
      preparing.value = false
      speaking.value = false
      ttsError.value = error instanceof Error ? error.message : '音频播放失败。'
    })
  }

  function handleWorkerError(event: ErrorEvent) {
    requestId += 1
    stopPlayback()
    preparing.value = false
    downloadProgress.value = null
    ttsError.value = `语音引擎运行失败：${event.message || 'Worker 无法启动。'}`
    if (worker) {
      worker.removeEventListener('message', handleWorkerMessage)
      worker.removeEventListener('error', handleWorkerError)
      worker.terminate()
      worker = null
    }
  }

  const stop = () => {
    requestId += 1
    stopPlayback()
    preparing.value = false
    downloadProgress.value = null
  }

  const speak = async (text: string) => {
    const trimmedText = text.trim()
    if (!trimmedText) {
      ttsError.value = '朗读文本不能为空。'
      return
    }
    if (!supported.value) {
      ttsError.value = '当前浏览器缺少语音引擎所需的 WebAssembly、Worker 或音频能力。'
      return
    }

    stopPlayback()
    const currentRequestId = ++requestId
    ttsError.value = ''
    preparing.value = true
    downloadProgress.value = null

    try {
      void unlockMediaElement().catch(() => undefined)
      const context = ensureAudioContext()
      const piperWorker = ensureWorker()
      if (!context || !piperWorker) {
        supported.value = false
        preparing.value = false
        ttsError.value = '当前浏览器无法初始化统一语音引擎。'
        return
      }

      await context.resume()
      const request: PiperRequest = {
        type: 'speak',
        requestId: currentRequestId,
        text: trimmedText,
      }
      piperWorker.postMessage(request)
    } catch (error) {
      if (currentRequestId !== requestId) {
        return
      }
      preparing.value = false
      ttsError.value = error instanceof Error ? `音频初始化失败：${error.message}` : '音频初始化失败。'
    }
  }

  onUnmounted(() => {
    stop()
    if (worker) {
      worker.removeEventListener('message', handleWorkerMessage)
      worker.removeEventListener('error', handleWorkerError)
      worker.terminate()
      worker = null
    }
    if (audioContext) {
      void audioContext.close()
      audioContext = null
    }
    mediaElement = null
  })

  return {
    supported,
    preparing,
    downloadProgress,
    selectedRatePreset,
    speaking,
    ttsError,
    speak,
    stop,
  }
}
