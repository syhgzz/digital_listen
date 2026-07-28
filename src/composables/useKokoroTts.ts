import { ref, readonly, type Ref } from 'vue'
import type { SpeechRatePreset } from '../types/practice'

export interface KokoroVoice {
  id: string
  name: string
  language: string
  gender: string
}

export type KokoroEngineState = 'uninitialized' | 'loading' | 'ready' | 'error'

const speechRateByPreset: Record<SpeechRatePreset, number> = {
  normal: 1,
  slightlyFast: 1.15,
  fastest: 1.3,
}

/**
 * Kokoro TTS 统一语音引擎
 * 基于 kokoro-js (82M 参数神经网络 TTS)，通过 WASM 在所有浏览器/操作系统上产生一致的语音输出。
 * 模型首次使用时从 HuggingFace 下载 (~80MB q8)，之后缓存到 IndexedDB。
 */
export const useKokoroTts = () => {
  const engineState: Ref<KokoroEngineState> = ref('uninitialized')
  const generating = ref(false)
  const errorMessage = ref('')
  const progressMessage = ref('')
  const progressPercent = ref(0)

  let ttsInstance: Awaited<ReturnType<typeof import('kokoro-js').KokoroTTS['from_pretrained']>> | null = null
  let audioElement: HTMLAudioElement | null = null
  let currentSpeed: SpeechRatePreset = 'normal'

  const availableVoices: KokoroVoice[] = [
    { id: 'af_heart', name: 'Heart (美式女声)', language: 'en-us', gender: 'female' },
    { id: 'af_bella', name: 'Bella (美式女声)', language: 'en-us', gender: 'female' },
    { id: 'af_nicole', name: 'Nicole (美式女声)', language: 'en-us', gender: 'female' },
    { id: 'af_sarah', name: 'Sarah (美式女声)', language: 'en-us', gender: 'female' },
    { id: 'af_sky', name: 'Sky (美式女声)', language: 'en-us', gender: 'female' },
    { id: 'am_adam', name: 'Adam (美式男声)', language: 'en-us', gender: 'male' },
    { id: 'am_michael', name: 'Michael (美式男声)', language: 'en-us', gender: 'male' },
    { id: 'bf_emma', name: 'Emma (英式女声)', language: 'en-gb', gender: 'female' },
    { id: 'bm_george', name: 'George (英式男声)', language: 'en-gb', gender: 'male' },
  ]

  const isSupported = (): boolean => {
    // kokoro-js requires WebAssembly and AudioContext
    return (
      typeof window !== 'undefined' &&
      typeof WebAssembly === 'object' &&
      typeof AudioContext !== 'undefined'
    )
  }

  const createAudioElement = (): HTMLAudioElement => {
    if (audioElement) {
      return audioElement
    }
    audioElement = new Audio()
    audioElement.preload = 'auto'
    return audioElement
  }

  const init = async (): Promise<void> => {
    if (!isSupported()) {
      engineState.value = 'error'
      errorMessage.value = '当前浏览器不支持 WASM 或 Web Audio API，无法使用统一语音引擎。'
      return
    }

    if (ttsInstance) {
      engineState.value = 'ready'
      return
    }

    engineState.value = 'loading'
    progressMessage.value = '正在加载语音模型...'
    progressPercent.value = 0

    try {
      const { KokoroTTS } = await import('kokoro-js')

      ttsInstance = await KokoroTTS.from_pretrained(
        'onnx-community/Kokoro-82M-v1.0-ONNX',
        {
          dtype: 'q8',
          device: 'wasm',
          progress_callback: (info: { status: string; progress?: number; file?: string }) => {
            if (info.status === 'progress') {
              progressPercent.value = Math.round((info.progress ?? 0) * 100)
              if (info.file) {
                progressMessage.value = `正在下载 ${info.file}`
              }
            } else if (info.status === 'done') {
              progressMessage.value = '模型加载完成'
              progressPercent.value = 100
            }
          },
        } as Parameters<typeof KokoroTTS.from_pretrained>[1],
      )

      engineState.value = 'ready'
      progressMessage.value = ''
    } catch (error) {
      engineState.value = 'error'
      errorMessage.value =
        error instanceof Error
          ? `语音引擎加载失败：${error.message}`
          : '语音引擎加载失败，请检查网络连接后刷新页面重试。'
      console.error('Failed to initialize Kokoro TTS:', error)
    }
  }

  const speak = async (text: string, voiceId = 'af_heart', speedPreset?: SpeechRatePreset): Promise<void> => {
    if (!ttsInstance || engineState.value !== 'ready') {
      errorMessage.value = '语音引擎未就绪，请稍后再试。'
      return
    }

    const trimmedText = text.trim()
    if (!trimmedText) {
      return
    }

    const speed = speedPreset ? speechRateByPreset[speedPreset] : speechRateByPreset[currentSpeed]
    stop()
    generating.value = true
    errorMessage.value = ''

    try {
      const rawAudio = await ttsInstance.generate(trimmedText, {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        voice: voiceId as any,
        speed: 1, // Use native speed 1, control playback speed via Audio element
      })

      const blob = rawAudio.toBlob()
      const url = URL.createObjectURL(blob)
      const audio = createAudioElement()
      audio.src = url
      audio.playbackRate = speed

      await new Promise<void>((resolve, reject) => {
        audio.onended = () => {
          URL.revokeObjectURL(url)
          resolve()
        }
        audio.onerror = () => {
          URL.revokeObjectURL(url)
          reject(new Error('音频播放失败'))
        }
        void audio.play().catch((err) => {
          URL.revokeObjectURL(url)
          reject(err instanceof Error ? err : new Error('音频播放被阻止'))
        })
      })
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return
      }
      errorMessage.value =
        error instanceof Error ? `语音生成失败：${error.message}` : '语音生成失败。'
    } finally {
      generating.value = false
    }
  }

  const stop = (): void => {
    if (audioElement) {
      audioElement.pause()
      audioElement.currentTime = 0
      audioElement.src = ''
    }
    generating.value = false
  }

  const setSpeed = (preset: SpeechRatePreset): void => {
    currentSpeed = preset
  }

  const destroy = (): void => {
    stop()
    if (audioElement) {
      audioElement.src = ''
      audioElement = null
    }
    ttsInstance = null
    engineState.value = 'uninitialized'
  }

  return {
    availableVoices,
    engineState: readonly(engineState),
    generating: readonly(generating),
    errorMessage: readonly(errorMessage),
    progressMessage: readonly(progressMessage),
    progressPercent: readonly(progressPercent),
    isSupported,
    init,
    speak,
    stop,
    setSpeed,
    destroy,
  }
}
