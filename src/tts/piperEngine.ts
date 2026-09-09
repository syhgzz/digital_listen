import {
  DEFAULT_VOICE_ID,
  TTS_BASE_PATH,
  fetchVoiceModel,
  loadPiperPhonemize,
  loadVoiceConfig,
  loadVoiceManifest,
  resolveMirrorBase,
  type PiperPhonemizeModule,
  type PiperVoiceConfig,
  type PiperVoiceEntry,
} from './piperAssets'
import {
  readCachedModel,
  requestPersistentStorage,
  writeCachedModel,
} from './piperModelCache'
import type { InferenceSession } from 'onnxruntime-web/wasm'
import {
  TtsCanceledError,
  TtsPlaybackBlockedError,
  type TtsEngine,
  type TtsEngineStatus,
  type TtsModelSource,
  type TtsProgress,
  type TtsSpeakOptions,
} from './types'
import { floatPcmToWavBlob, pcmRms } from './wav'

type OrtModule = typeof import('onnxruntime-web/wasm')

const MAX_CACHE_ENTRIES = 24
const PHONEMIZE_TIMEOUT_MS = 15_000

let ortModulePromise: Promise<OrtModule> | null = null

const loadOrt = async (): Promise<OrtModule> => {
  if (!ortModulePromise) {
    ortModulePromise = import('onnxruntime-web/wasm').then((ort) => {
      // Let the bundler resolve the ORT wasm loader/wasm assets: they must go
      // through Vite's module graph (files under public/ cannot be imported as
      // modules, the dev server rejects them with a 500).
      ort.env.wasm.numThreads =
        typeof crossOriginIsolated !== 'undefined' && crossOriginIsolated
          ? Math.min(4, navigator.hardwareConcurrency || 1)
          : 1
      return ort
    })
  }
  return ortModulePromise
}

export interface PiperEngineOptions {
  /** Preferred voice id, e.g. `en_US-lessac-medium`. Falls back to the first manifest entry. */
  voiceId?: string
  onDebugClip?: (info: { text: string; durationMs: number; rms: number }) => void
}

/**
 * Self-hosted Piper (VITS) engine.
 *
 * Everything it needs lives under `public/tts`: the ONNX Runtime WASM build,
 * the Emscripten phonemizer and a voice model. Because the model is served from
 * the app's own origin, pronunciation is byte-for-byte identical on every
 * browser and operating system, and playback works fully offline.
 */
export class PiperEngine implements TtsEngine {
  readonly id = 'piper' as const
  readonly label = '本地神经语音'

  private readonly options: PiperEngineOptions
  private status: TtsEngineStatus = 'idle'
  private voices: PiperVoiceEntry[] = []
  private voicesPromise: Promise<PiperVoiceEntry[]> | null = null
  private voice: PiperVoiceEntry | null = null
  private config: PiperVoiceConfig | null = null
  private mirrorBase = ''
  private modelSource: TtsModelSource | null = null
  private prepareController: AbortController | null = null
  private session: InferenceSession | null = null
  private phonemizeModule: PiperPhonemizeModule | null = null
  private phonemizeQueue: Promise<unknown> = Promise.resolve()
  private pendingPhonemes: {
    resolve: (ids: number[]) => void
    reject: (error: Error) => void
    timer: number
  } | null = null
  private audio: HTMLAudioElement | null = null
  private objectUrl: string | null = null
  private generation = 0
  private preparing: Promise<void> | null = null
  private readonly cache = new Map<string, Blob>()

  constructor(options: PiperEngineOptions = {}) {
    this.options = options
  }

  getStatus(): TtsEngineStatus {
    return this.status
  }

  getVoices(): PiperVoiceEntry[] {
    return this.voices
  }

  /**
   * Loads the voice manifest (a few KB) without touching the 60MB model, so the
   * UI can list voices immediately instead of showing an empty dropdown while
   * the engine prepares.
   */
  async loadVoices(): Promise<PiperVoiceEntry[]> {
    if (this.voices.length > 0) {
      return this.voices
    }
    if (this.voicesPromise) {
      return this.voicesPromise
    }
    this.voicesPromise = loadVoiceManifest()
      .then((manifest) => {
        this.voices = manifest.voices
        this.mirrorBase = resolveMirrorBase(manifest)
        return this.voices
      })
      .finally(() => {
        this.voicesPromise = null
      })
    return this.voicesPromise
  }

  getSelectedVoiceId(): string {
    return this.voice?.id ?? ''
  }

  /** Where the current voice model came from (cache / mirror / app origin). */
  getModelSource(): TtsModelSource | null {
    return this.modelSource
  }

  setVoiceId(voiceId: string): void {
    if (voiceId === this.voice?.id) {
      return
    }
    this.options.voiceId = voiceId
    this.prepareController?.abort()
    this.prepareController = null
    // Drop the in-flight prepare promise so the next prepare() starts for the
    // newly selected voice instead of reusing the previous voice's session.
    this.preparing = null
    this.session?.release()
    this.session = null
    this.config = null
    this.voice = null
    this.modelSource = null
    this.status = 'idle'
    this.cache.clear()
  }

  async prepare(onProgress?: (progress: TtsProgress) => void): Promise<void> {
    if (this.session && this.phonemizeModule) {
      this.status = 'ready'
      return
    }
    if (this.preparing) {
      return this.preparing
    }

    this.preparing = this.prepareInternal(onProgress).finally(() => {
      this.preparing = null
    })
    return this.preparing
  }

  private async prepareInternal(onProgress?: (progress: TtsProgress) => void): Promise<void> {
    this.status = 'preparing'
    const controller = new AbortController()
    this.prepareController = controller
    let lastMark = performance.now()
    const timings: string[] = []
    const mark = (label: string) => {
      const now = performance.now()
      timings.push(`${label} ${((now - lastMark) / 1000).toFixed(1)}s`)
      lastMark = now
    }

    try {
      const ort = await loadOrt()
      onProgress?.({
        stage: 'runtime',
        loaded: 1,
        total: 1,
        ratio: 1,
        message: '语音运行时已加载',
      })

      if ((await this.loadVoices()).length === 0) {
        throw new Error('未找到本地语音模型，请先运行 npm run tts:setup。')
      }

      const voice =
        this.voices.find((entry) => entry.id === this.options.voiceId) ??
        this.voices.find((entry) => entry.id === DEFAULT_VOICE_ID) ??
        this.voices[0]
      this.voice = voice

      const config = await loadVoiceConfig(voice)
      this.config = config

      if (!this.session) {
        const buffer = await this.loadModel(voice, onProgress, controller.signal)
        if (controller.signal.aborted) {
          throw new TtsCanceledError()
        }
        mark('下载')

        // Session creation compiles a ~63MB graph and can take tens of seconds
        // on a single-threaded WASM runtime, so keep the user informed.
        onProgress?.({
          stage: 'model',
          loaded: 1,
          total: 1,
          ratio: 1,
          message: '模型已下载，正在初始化语音引擎（首次约需 10–60 秒）…',
          source: this.modelSource ?? undefined,
        })
        this.session = await ort.InferenceSession.create(buffer, {
          executionProviders: ['wasm'],
        })
        mark('会话')
      }

      if (!this.phonemizeModule) {
        onProgress?.({
          stage: 'runtime',
          loaded: 1,
          total: 1,
          ratio: 1,
          message: '语音引擎已就绪，正在加载音素引擎…',
        })
        this.phonemizeModule = await this.createPhonemizeModule()
        mark('音素')
      }

      this.status = 'ready'
      console.info(`[tts] 声线 ${voice.id} 就绪：${timings.join(' · ')}`)
      onProgress?.({ stage: 'voice', loaded: 1, total: 1, ratio: 1, message: '语音已就绪' })
    } catch (error) {
      this.status = 'error'
      if (error instanceof TtsCanceledError) {
        throw error
      }
      throw error instanceof Error ? error : new Error('本地语音引擎初始化失败。')
    } finally {
      if (this.prepareController === controller) {
        this.prepareController = null
      }
    }
  }

  /**
   * Cache → mirror → app origin. The cache keeps repeat visits instant because
   * the mirror's signed redirect is not cacheable by the browser.
   */
  private async loadModel(
    voice: PiperVoiceEntry,
    onProgress?: (progress: TtsProgress) => void,
    signal?: AbortSignal,
  ): Promise<ArrayBuffer> {
    const cached = await readCachedModel(voice)
    if (cached) {
      this.modelSource = 'cache'
      onProgress?.({
        stage: 'model',
        loaded: cached.byteLength,
        total: cached.byteLength,
        ratio: 1,
        message: '使用本地缓存的语音模型',
        source: 'cache',
      })
      return cached
    }

    const { buffer, source } = await fetchVoiceModel(voice, {
      mirrorBase: this.mirrorBase,
      onProgress,
      signal,
    })
    this.modelSource = source
    void requestPersistentStorage().then(() => writeCachedModel(voice, buffer))
    return buffer
  }

  private async createPhonemizeModule(): Promise<PiperPhonemizeModule> {
    const factory = await loadPiperPhonemize()
    return factory({
      print: (data) => this.handlePhonemizeOutput(data),
      printErr: (message) => this.handlePhonemizeError(message),
      locateFile: (url) => {
        if (url.endsWith('.wasm')) {
          return `${TTS_BASE_PATH}/piper/piper_phonemize.wasm`
        }
        if (url.endsWith('.data')) {
          return `${TTS_BASE_PATH}/piper/piper_phonemize.data`
        }
        return url
      },
    })
  }

  private handlePhonemizeOutput(data: string): void {
    const pending = this.pendingPhonemes
    if (!pending) {
      return
    }
    try {
      const parsed = JSON.parse(data) as { phoneme_ids?: number[] }
      if (!Array.isArray(parsed.phoneme_ids)) {
        return
      }
      window.clearTimeout(pending.timer)
      this.pendingPhonemes = null
      pending.resolve(parsed.phoneme_ids)
    } catch {
      // Ignore non-JSON status lines printed by Emscripten.
    }
  }

  private handlePhonemizeError(message: string): void {
    const pending = this.pendingPhonemes
    if (!pending) {
      console.warn('piper_phonemize:', message)
      return
    }
    window.clearTimeout(pending.timer)
    this.pendingPhonemes = null
    pending.reject(new Error(`音素转换失败：${message}`))
  }

  private phonemize(text: string): Promise<number[]> {
    const run = this.phonemizeQueue.then(
      () =>
        new Promise<number[]>((resolve, reject) => {
          const module = this.phonemizeModule
          const config = this.config
          if (!module || !config) {
            reject(new Error('本地语音引擎尚未就绪。'))
            return
          }

          const timer = window.setTimeout(() => {
            this.pendingPhonemes = null
            reject(new Error('音素转换超时。'))
          }, PHONEMIZE_TIMEOUT_MS)

          this.pendingPhonemes = { resolve, reject, timer }
          try {
            module.callMain([
              '-l',
              config.espeak?.voice ?? 'en-us',
              '--input',
              JSON.stringify([{ text }]),
              '--espeak_data',
              '/espeak-ng-data',
            ])
          } catch (error) {
            window.clearTimeout(timer)
            this.pendingPhonemes = null
            reject(error instanceof Error ? error : new Error('音素转换失败。'))
          }
        }),
    )

    this.phonemizeQueue = run.catch(() => undefined)
    return run
  }

  private async synthesize(text: string, rate: number, generation: number): Promise<Blob> {
    const config = this.config
    const session = this.session
    const voice = this.voice
    if (!config || !session || !voice) {
      throw new Error('本地语音引擎尚未就绪。')
    }

    const cacheKey = `${voice.id}|${rate.toFixed(2)}|${text}`
    const cached = this.cache.get(cacheKey)
    if (cached) {
      return cached
    }

    const phonemeIds = await this.phonemize(text)
    if (generation !== this.generation) {
      throw new TtsCanceledError()
    }

    const ort = await loadOrt()
    const feeds: Record<string, unknown> = {
      input: new ort.Tensor('int64', BigInt64Array.from(phonemeIds, BigInt), [1, phonemeIds.length]),
      input_lengths: new ort.Tensor('int64', BigInt64Array.from([phonemeIds.length], BigInt)),
      scales: new ort.Tensor('float32', [
        config.inference.noise_scale,
        config.inference.length_scale / Math.max(rate, 0.1),
        config.inference.noise_w,
      ]),
    }
    if (Object.keys(config.speaker_id_map ?? {}).length > 0) {
      feeds.sid = new ort.Tensor('int64', BigInt64Array.from([0n]))
    }

    const outputs = await session.run(feeds as Parameters<InferenceSession['run']>[0])
    if (generation !== this.generation) {
      throw new TtsCanceledError()
    }

    const samples = outputs.output.data as Float32Array
    const sampleRate = config.audio.sample_rate
    const blob = floatPcmToWavBlob(samples, sampleRate)

    this.options.onDebugClip?.({
      text,
      durationMs: Math.round((samples.length / sampleRate) * 1000),
      rms: Number(pcmRms(samples).toFixed(4)),
    })

    this.cache.set(cacheKey, blob)
    if (this.cache.size > MAX_CACHE_ENTRIES) {
      const oldest = this.cache.keys().next().value
      if (oldest !== undefined) {
        this.cache.delete(oldest)
      }
    }

    return blob
  }

  private async play(blob: Blob, options: TtsSpeakOptions, generation: number): Promise<void> {
    this.stopAudio()
    const audio = this.audio ?? new Audio()
    this.audio = audio
    const url = URL.createObjectURL(blob)
    this.objectUrl = url
    audio.src = url

    await new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        audio.onplaying = null
        audio.onended = null
        audio.onerror = null
      }

      audio.onplaying = () => options.onStart?.()
      audio.onended = () => {
        cleanup()
        options.onEnd?.()
        resolve()
      }
      audio.onerror = () => {
        cleanup()
        reject(new Error('音频播放失败。'))
      }

      void audio.play().catch((error: unknown) => {
        cleanup()
        if (error instanceof DOMException && error.name === 'NotAllowedError') {
          reject(new TtsPlaybackBlockedError())
          return
        }
        reject(error instanceof Error ? error : new Error('音频播放失败。'))
      })

      if (generation !== this.generation) {
        cleanup()
        reject(new TtsCanceledError())
      }
    })
  }

  async speak(text: string, options: TtsSpeakOptions): Promise<void> {
    const trimmed = text.trim()
    if (!trimmed) {
      throw new Error('朗读文本不能为空。')
    }

    const generation = ++this.generation
    await this.prepare(options.onProgress)
    if (generation !== this.generation) {
      throw new TtsCanceledError()
    }

    options.onProgress?.({
      stage: 'synthesis',
      loaded: 1,
      total: 1,
      ratio: 1,
      message: '正在合成语音…',
    })
    const blob = await this.synthesize(trimmed, options.rate, generation)
    if (generation !== this.generation) {
      throw new TtsCanceledError()
    }

    await this.play(blob, options, generation)
  }

  cancel(): void {
    this.generation += 1
    this.stopAudio()
  }

  private stopAudio(): void {
    const audio = this.audio
    if (audio) {
      audio.pause()
      audio.removeAttribute('src')
      audio.load()
    }
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl)
      this.objectUrl = null
    }
  }

  dispose(): void {
    this.cancel()
    this.prepareController?.abort()
    this.prepareController = null
    this.session?.release()
    this.session = null
    this.phonemizeModule = null
    this.cache.clear()
    this.audio = null
    this.modelSource = null
    this.status = 'idle'
  }
}
