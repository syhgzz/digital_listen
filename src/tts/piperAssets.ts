import type { TtsModelSource, TtsProgress } from './types'
import { TtsCanceledError } from './types'

/** Layout written by `scripts/tts-assets.mjs` into `public/tts`. */
export const TTS_BASE_PATH = '/tts'

/** Tried before the app origin, so clients far from the server download faster. */
export const DEFAULT_MIRROR_BASE =
  'https://hf-mirror.com/diffusionstudio/piper-voices/resolve/main'

/** Voice used when the user has not picked one explicitly. */
export const DEFAULT_VOICE_ID = 'en_US-lessac-medium'

/**
 * Give up on a source when no new chunk arrives for this long. Kept short so a
 * blocked mirror (its large files are served through an AWS redirect that is
 * often unreachable in China) falls back to the app origin quickly.
 */
export const STALL_TIMEOUT_MS = 10_000

export interface PiperVoiceEntry {
  id: string
  /** Friendly name for the UI; falls back to `name`. */
  label?: string
  name: string
  language: string
  quality: string
  sizeBytes: number
  modelFile: string
  configFile: string
  /** Repository path inside the voice repo, e.g. `en/en_US/lessac/medium/en_US-lessac-medium`. */
  repoPath?: string
  sampleRate?: number
}

export interface PiperVoiceManifest {
  generatedAt?: string
  mirrorBase?: string
  voices: PiperVoiceEntry[]
}

export interface PiperVoiceConfig {
  audio: { sample_rate: number }
  inference: { noise_scale: number; length_scale: number; noise_w: number }
  phoneme_id_map: Record<string, number[]>
  num_speakers?: number
  speaker_id_map?: Record<string, number>
  espeak?: { voice: string }
}

export interface PiperPhonemizeModule {
  callMain(args: string[]): void
}

export type PiperPhonemizeFactory = (config: {
  print?: (text: string) => void
  printErr?: (text: string) => void
  locateFile?: (url: string) => string
}) => Promise<PiperPhonemizeModule>

declare global {
  interface Window {
    createPiperPhonemize?: PiperPhonemizeFactory
  }
}

export interface ModelSource {
  kind: TtsModelSource
  url: string
}

export interface VoiceModelResult {
  buffer: ArrayBuffer
  source: TtsModelSource
}

export interface FetchVoiceModelOptions {
  mirrorBase?: string
  onProgress?: (progress: TtsProgress) => void
  signal?: AbortSignal
}

export const voiceModelUrl = (voice: PiperVoiceEntry): string =>
  `${TTS_BASE_PATH}/voices/${voice.modelFile}`

export const voiceConfigUrl = (voice: PiperVoiceEntry): string =>
  `${TTS_BASE_PATH}/voices/${voice.configFile}`

/** Piper repository layout: <language>/<locale>/<name>/<quality>/<voiceId>. */
export const deriveRepoPath = (voiceId: string): string => {
  const [locale = '', name = '', quality = ''] = voiceId.split('-')
  const language = locale.split('_')[0] ?? ''
  return `${language}/${locale}/${name}/${quality}/${voiceId}`
}

export const resolveMirrorBase = (manifest: PiperVoiceManifest): string => {
  const configured = import.meta.env.VITE_TTS_MIRROR_BASE
  const base = (configured ?? manifest.mirrorBase ?? DEFAULT_MIRROR_BASE).trim()
  return base.replace(/\/+$/, '')
}

/** Ordered model locations: mirror first, app origin as the fallback. */
export const buildModelSources = (voice: PiperVoiceEntry, mirrorBase: string): ModelSource[] => {
  const sources: ModelSource[] = []
  if (mirrorBase) {
    sources.push({ kind: 'mirror', url: `${mirrorBase}/${voice.repoPath ?? deriveRepoPath(voice.id)}.onnx` })
  }
  sources.push({ kind: 'server', url: voiceModelUrl(voice) })
  return sources
}

/** Reads `public/tts/voices/manifest.json`; an empty list means assets were never provisioned. */
export const loadVoiceManifest = async (): Promise<PiperVoiceManifest> => {
  try {
    const response = await fetch(`${TTS_BASE_PATH}/voices/manifest.json`, { cache: 'no-cache' })
    if (!response.ok) {
      return { voices: [] }
    }
    const manifest = (await response.json()) as PiperVoiceManifest
    return { ...manifest, voices: Array.isArray(manifest.voices) ? manifest.voices : [] }
  } catch (error) {
    console.warn('无法读取本地语音清单。', error)
    return { voices: [] }
  }
}

export const loadVoiceConfig = async (voice: PiperVoiceEntry): Promise<PiperVoiceConfig> => {
  const response = await fetch(voiceConfigUrl(voice))
  if (!response.ok) {
    throw new Error(`读取语音配置失败（HTTP ${response.status}）：${voice.configFile}`)
  }
  return (await response.json()) as PiperVoiceConfig
}

const sourceLabel = (kind: TtsModelSource): string =>
  kind === 'mirror' ? '镜像站' : kind === 'cache' ? '本地缓存' : '服务器'

const fetchFromSource = async (
  source: ModelSource,
  voice: PiperVoiceEntry,
  options: FetchVoiceModelOptions,
): Promise<ArrayBuffer> => {
  const controller = new AbortController()
  const forwardAbort = () => controller.abort()
  options.signal?.addEventListener('abort', forwardAbort, { once: true })

  let stalled = false
  let stallTimer: ReturnType<typeof setTimeout> | undefined
  const resetStallTimer = () => {
    clearTimeout(stallTimer)
    stallTimer = setTimeout(() => {
      stalled = true
      controller.abort()
    }, STALL_TIMEOUT_MS)
  }

  try {
    resetStallTimer()
    const response = await fetch(source.url, { signal: controller.signal })
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }

    const total = Number(response.headers.get('content-length') ?? 0) || voice.sizeBytes || 0
    if (!response.body) {
      const buffer = await response.arrayBuffer()
      return buffer
    }

    const reader = response.body.getReader()
    const chunks: Uint8Array[] = []
    let loaded = 0

    for (;;) {
      resetStallTimer()
      const { done, value } = await reader.read()
      if (done) {
        break
      }
      chunks.push(value)
      loaded += value.length
      options.onProgress?.({
        stage: 'model',
        loaded,
        total,
        ratio: total > 0 ? Math.min(1, loaded / total) : 0,
        message:
          total > 0
            ? `从${sourceLabel(source.kind)}加载语音模型 ${Math.round((loaded / total) * 100)}%`
            : `从${sourceLabel(source.kind)}加载语音模型…`,
        source: source.kind,
      })
    }

    const merged = new Uint8Array(loaded)
    let offset = 0
    for (const chunk of chunks) {
      merged.set(chunk, offset)
      offset += chunk.length
    }
    return merged.buffer
  } catch (error) {
    if (options.signal?.aborted) {
      throw new TtsCanceledError()
    }
    if (stalled) {
      throw new Error(`${STALL_TIMEOUT_MS / 1000} 秒无数据`)
    }
    throw error instanceof Error ? error : new Error('下载失败')
  } finally {
    clearTimeout(stallTimer)
    options.signal?.removeEventListener('abort', forwardAbort)
  }
}

/**
 * Downloads a voice model, trying the mirror first and the app origin second.
 * A source is rejected when it answers with an error, stalls, or delivers a
 * byte count that does not match the manifest (mirrors sometimes answer with
 * an HTML error page).
 */
export const fetchVoiceModel = async (
  voice: PiperVoiceEntry,
  options: FetchVoiceModelOptions = {},
): Promise<VoiceModelResult> => {
  const sources = buildModelSources(voice, options.mirrorBase ?? '')
  const failures: string[] = []

  for (const source of sources) {
    if (options.signal?.aborted) {
      throw new TtsCanceledError()
    }
    try {
      const buffer = await fetchFromSource(source, voice, options)
      if (voice.sizeBytes > 0 && buffer.byteLength !== voice.sizeBytes) {
        throw new Error(`字节数不符（期望 ${voice.sizeBytes}，实际 ${buffer.byteLength}）`)
      }
      return { buffer, source: source.kind }
    } catch (error) {
      if (error instanceof TtsCanceledError || options.signal?.aborted) {
        throw new TtsCanceledError()
      }
      failures.push(`${sourceLabel(source.kind)}：${error instanceof Error ? error.message : '未知错误'}`)
    }
  }

  throw new Error(
    `语音模型下载失败（${failures.join('；')}）。请检查网络，或在服务器执行 npm run tts:setup。`,
  )
}

let phonemizePromise: Promise<PiperPhonemizeFactory> | null = null

/**
 * Loads the Emscripten `piper_phonemize` glue straight from `public/tts/piper`.
 * Loading it as a classic script keeps the CommonJS/Emscripten glue out of the
 * Vite dependency graph entirely.
 */
export const loadPiperPhonemize = (): Promise<PiperPhonemizeFactory> => {
  if (phonemizePromise) {
    return phonemizePromise
  }

  phonemizePromise = new Promise<PiperPhonemizeFactory>((resolve, reject) => {
    if (typeof window === 'undefined') {
      reject(new Error('语音引擎只能在浏览器中运行。'))
      return
    }
    if (typeof window.createPiperPhonemize === 'function') {
      resolve(window.createPiperPhonemize)
      return
    }

    const script = document.createElement('script')
    script.src = `${TTS_BASE_PATH}/piper/piper_phonemize.js`
    script.async = true
    script.onload = () => {
      if (typeof window.createPiperPhonemize === 'function') {
        resolve(window.createPiperPhonemize)
      } else {
        reject(new Error('piper_phonemize.js 加载完成但未导出 createPiperPhonemize。'))
      }
    }
    script.onerror = () => {
      reject(new Error('无法加载 piper_phonemize.js，请先运行 npm run tts:setup。'))
    }
    document.head.appendChild(script)
  })

  return phonemizePromise
}
