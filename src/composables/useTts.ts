import { computed, onUnmounted, ref } from 'vue'
import { TtsSession } from '@mintplex-labs/piper-tts-web'
import type { Progress, VoiceId } from '@mintplex-labs/piper-tts-web'
import type { SpeechRatePreset } from '../types/practice'

export interface PiperVoiceOption {
  id: VoiceId
  name: string
}

export const PIPER_VOICES: PiperVoiceOption[] = [
  { id: 'en_US-hfc_female-medium', name: '美式女声 HFC' },
  { id: 'en_US-hfc_male-medium', name: '美式男声 HFC' },
  { id: 'en_US-lessac-medium', name: '美式女声 Lessac' },
]

const DEFAULT_VOICE_ID = PIPER_VOICES[0].id

const speechRateByPreset: Record<SpeechRatePreset, number> = {
  normal: 1,
  slightlyFast: 1.2,
  fastest: 1.4,
}

// Voice models are served locally from public/models/ (see
// scripts/download-models.sh). HuggingFace is only a fallback, optionally
// via a mirror (e.g. VITE_HF_MIRROR=https://hf-mirror.com) for networks
// where huggingface.co is unreachable. The OPFS model cache keys on the
// original huggingface.co URL, so rewriting only the network request is safe.
const HF_MODEL_PREFIX = 'https://huggingface.co/diffusionstudio/piper-voices/resolve/main/'
const HF_MIRROR = (import.meta.env.VITE_HF_MIRROR ?? '').trim().replace(/\/+$/, '')
const LOCAL_MODELS_BASE = `${import.meta.env.BASE_URL}models/`

if (typeof window !== 'undefined') {
  const originalFetch = window.fetch.bind(window)
  window.fetch = async (input, init) => {
    if (typeof input === 'string' && input.startsWith(HF_MODEL_PREFIX)) {
      const fileName = input.slice(HF_MODEL_PREFIX.length).split('/').pop() ?? ''
      const localResponse = await originalFetch(`${LOCAL_MODELS_BASE}${fileName}`, init)
      // Dev/preview servers fall back to index.html (200, text/html) for
      // missing files — treat that as a miss, not as a model file.
      const contentType = localResponse.headers.get('content-type') ?? ''
      if (localResponse.ok && !contentType.includes('text/html')) {
        return localResponse
      }
      const upstream = HF_MIRROR
        ? `${HF_MIRROR}/${input.slice('https://huggingface.co/'.length)}`
        : input
      return originalFetch(upstream, init)
    }
    return originalFetch(input, init)
  }
}

interface UseTtsOptions {
  initialVoiceURI?: string
  initialRatePreset?: SpeechRatePreset
}

export const useTts = (options: UseTtsOptions = {}) => {
  const initialVoice = PIPER_VOICES.some((voice) => voice.id === options.initialVoiceURI)
    ? (options.initialVoiceURI as VoiceId)
    : DEFAULT_VOICE_ID

  const selectedVoiceURI = ref<string>(initialVoice)
  const selectedRatePreset = ref<SpeechRatePreset>(options.initialRatePreset ?? 'normal')
  const speaking = ref(false)
  const preparing = ref(false)
  const downloadProgress = ref<number | null>(null)
  const ttsError = ref('')
  const voiceOptions = PIPER_VOICES

  const busy = computed(() => preparing.value || speaking.value)

  let speakGeneration = 0
  let sessionPromise: Promise<TtsSession> | null = null
  let sessionVoiceId: string | null = null
  let currentAudio: HTMLAudioElement | null = null
  let currentObjectUrl: string | null = null

  const ensureSession = (voiceId: VoiceId): Promise<TtsSession> => {
    if (sessionPromise && sessionVoiceId === voiceId) {
      return sessionPromise
    }

    // TtsSession is a singleton that keeps the first-loaded model;
    // reset it so switching voices actually loads the new model.
    TtsSession._instance = null
    sessionVoiceId = voiceId
    preparing.value = true
    downloadProgress.value = null

    sessionPromise = TtsSession.create({
      voiceId,
      wasmPaths: {
        onnxWasm: `${import.meta.env.BASE_URL}wasm/ort/`,
        piperData: `${import.meta.env.BASE_URL}wasm/piper/piper_phonemize.data`,
        piperWasm: `${import.meta.env.BASE_URL}wasm/piper/piper_phonemize.wasm`,
      },
      progress: (progress: Progress) => {
        if (progress.total > 0) {
          downloadProgress.value = Math.min(
            100,
            Math.round((progress.loaded / progress.total) * 100),
          )
        }
      },
    })
      .then((session) => {
        if (sessionVoiceId === voiceId) {
          preparing.value = false
          downloadProgress.value = null
        }
        return session
      })
      .catch((error: unknown) => {
        if (sessionVoiceId === voiceId) {
          sessionPromise = null
          sessionVoiceId = null
          preparing.value = false
          downloadProgress.value = null
        }
        throw error
      })

    return sessionPromise
  }

  const stop = () => {
    if (currentAudio) {
      currentAudio.pause()
      currentAudio.src = ''
      currentAudio = null
    }
    if (currentObjectUrl) {
      URL.revokeObjectURL(currentObjectUrl)
      currentObjectUrl = null
    }
    speaking.value = false
  }

  const playBlob = (blob: Blob): Promise<void> =>
    new Promise<void>((resolve, reject) => {
      const url = URL.createObjectURL(blob)
      const audio = new Audio(url)
      currentAudio = audio
      currentObjectUrl = url
      audio.playbackRate = speechRateByPreset[selectedRatePreset.value]

      audio.onplay = () => {
        speaking.value = true
      }
      audio.onended = () => {
        if (currentAudio === audio) {
          stop()
        }
        resolve()
      }
      audio.onerror = () => {
        if (currentAudio === audio) {
          stop()
        }
        reject(new Error('音频播放失败。'))
      }

      audio.play().catch(() => {
        // onerror handles the failure path; this only guards against
        // unhandled promise rejections (e.g. autoplay restrictions).
      })
    })

  const speak = async (text: string) => {
    const trimmedText = text.trim()
    if (!trimmedText) {
      ttsError.value = '朗读文本不能为空。'
      return
    }

    ttsError.value = ''
    stop()
    const gen = ++speakGeneration
    const voiceId = selectedVoiceURI.value as VoiceId

    preparing.value = true
    try {
      const session = await ensureSession(voiceId)
      if (gen !== speakGeneration) return
      const wavBlob = await session.predict(trimmedText)
      if (gen !== speakGeneration) return
      preparing.value = false
      await playBlob(wavBlob)
    } catch (error) {
      if (gen !== speakGeneration) return
      ttsError.value =
        error instanceof Error ? `语音合成失败：${error.message}` : '语音合成失败，请检查网络后重试。'
    } finally {
      if (gen === speakGeneration) {
        preparing.value = false
      }
    }
  }

  onUnmounted(() => {
    stop()
  })

  return {
    busy,
    downloadProgress,
    preparing,
    selectedRatePreset,
    selectedVoiceURI,
    speaking,
    ttsError,
    voiceOptions,
    speak,
    stop,
  }
}
