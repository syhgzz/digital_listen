import { ref, type Ref } from 'vue'

export interface KokoroEngine {
  speaking: Ref<boolean>
  loading: Ref<boolean>
  loadProgress: Ref<number>
  loadError: Ref<string>
  ready: Ref<boolean>
  voices: KokoroVoice[]
  init: () => Promise<void>
  speak: (text: string, voice?: string) => Promise<void>
  stop: () => void
}

export interface KokoroVoice {
  id: string
  name: string
}

const KOKORO_VOICES: KokoroVoice[] = [
  { id: 'af_heart', name: 'Kokoro Heart (美式女声)' },
  { id: 'af_bella', name: 'Kokoro Bella (美式女声)' },
  { id: 'af_nicole', name: 'Kokoro Nicole (美式女声)' },
  { id: 'af_sarah', name: 'Kokoro Sarah (美式女声)' },
  { id: 'af_sky', name: 'Kokoro Sky (美式女声)' },
  { id: 'am_adam', name: 'Kokoro Adam (美式男声)' },
  { id: 'am_michael', name: 'Kokoro Michael (美式男声)' },
  { id: 'am_eric', name: 'Kokoro Eric (美式男声)' },
  { id: 'am_onyx', name: 'Kokoro Onyx (美式男声)' },
  { id: 'bf_emma', name: 'Kokoro Emma (英式女声)' },
  { id: 'bf_isabella', name: 'Kokoro Isabella (英式女声)' },
  { id: 'bf_alice', name: 'Kokoro Alice (英式女声)' },
  { id: 'bf_lily', name: 'Kokoro Lily (英式女声)' },
  { id: 'bm_george', name: 'Kokoro George (英式男声)' },
  { id: 'bm_lewis', name: 'Kokoro Lewis (英式男声)' },
  { id: 'bm_daniel', name: 'Kokoro Daniel (英式男声)' },
  { id: 'bm_fable', name: 'Kokoro Fable (英式男声)' },
  { id: 'if_sara', name: 'Kokoro Sara (印度英语女声)' },
  { id: 'im_nicola', name: 'Kokoro Nicola (印度英语男声)' },
]

const DEFAULT_VOICE = 'af_heart'

let audioContext: AudioContext | null = null

const getAudioContext = (): AudioContext => {
  if (!audioContext) {
    audioContext = new AudioContext()
  }
  if (audioContext.state === 'suspended') {
    void audioContext.resume()
  }
  return audioContext
}

const playAudioBuffer = async (audioBuffer: AudioBuffer): Promise<void> => {
  const ctx = getAudioContext()
  const source = ctx.createBufferSource()
  source.buffer = audioBuffer
  source.connect(ctx.destination)

  return new Promise<void>((resolve) => {
    source.onended = () => resolve()
    source.start()
  })
}

export const createKokoroEngine = (): KokoroEngine => {
  const speaking = ref(false)
  const loading = ref(false)
  const loadProgress = ref(0)
  const loadError = ref('')
  const ready = ref(false)

  let ttsInstance: Awaited<ReturnType<typeof import('kokoro-js').KokoroTTS.from_pretrained>> | null = null
  let currentSource: AudioBufferSourceNode | null = null

  const init = async (): Promise<void> => {
    if (ready.value || loading.value) {
      return
    }

    loading.value = true
    loadError.value = ''
    loadProgress.value = 0

    try {
      const { KokoroTTS } = await import('kokoro-js')

      ttsInstance = await Promise.race([
        KokoroTTS.from_pretrained(
          'onnx-community/Kokoro-82M-v1.0-ONNX',
          {
            dtype: 'q8',
            device: 'wasm',
            progress_callback: (info: { status: string; progress?: number; loaded?: number; total?: number }) => {
              if (info.status === 'progress' && typeof info.progress === 'number') {
                loadProgress.value = Math.round(info.progress)
              } else if (info.status === 'download') {
                loadProgress.value = 10
              } else if (info.status === 'done') {
                loadProgress.value = Math.min(99, loadProgress.value + 30)
              } else if (info.status === 'ready') {
                loadProgress.value = 100
              }
            },
          },
        ),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('timeout')), 5_000),
        ),
      ])

      ready.value = true
      loading.value = false
      loadProgress.value = 100
    } catch (error) {
      loading.value = false
    }
  }

  const speak = async (text: string, voice?: string): Promise<void> => {
    if (!ttsInstance || !ready.value) {
      throw new Error('Kokoro 语音引擎未就绪。')
    }

    try {
      speaking.value = true

      const selectedVoice = voice ?? DEFAULT_VOICE
      const audio = await ttsInstance.generate(text.trim(), {
        voice: selectedVoice as never,
      })

      if (audio?.audio) {
        const ctx = getAudioContext()
        const raw = audio as { audio: Float32Array | Float32Array[]; sampling_rate: number }
        let samples: Float32Array
        if (Array.isArray(raw.audio)) {
          const totalLen = raw.audio.reduce((sum, chunk) => sum + chunk.length, 0)
          const merged = new Float32Array(totalLen)
          let offset = 0
          for (const chunk of raw.audio) {
            merged.set(chunk, offset)
            offset += chunk.length
          }
          samples = merged
        } else {
          samples = raw.audio
        }
        const sampleRate = raw.sampling_rate ?? 24000
        const buffer = ctx.createBuffer(1, samples.length, sampleRate)
        buffer.getChannelData(0).set(samples)
        await playAudioBuffer(buffer)
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return
      }
      throw error instanceof Error ? error : new Error('Kokoro 语音播放失败。')
    } finally {
      speaking.value = false
    }
  }

  const stop = (): void => {
    if (currentSource) {
      try {
        currentSource.stop()
      } catch {
        // Already stopped
      }
      currentSource = null
    }
    speaking.value = false
  }

  return {
    speaking,
    loading,
    loadProgress,
    loadError,
    ready,
    voices: KOKORO_VOICES,
    init,
    speak,
    stop,
  }
}
