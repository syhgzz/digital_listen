import type { TtsModelSource, TtsProgress } from './types'
import { AUTO_VOICE_KEY, TtsCanceledError } from './types'

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
  /**
   * How long the sources compete before the one with the most bytes wins.
   * `0` disables the race and downloads the sources strictly in order.
   */
  raceWindowMs?: number
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

/**
 * Select key used when the user has no valid stored choice: the preferred
 * default voice when it is provisioned, otherwise the first available one.
 */
export const defaultVoiceKey = (voices: PiperVoiceEntry[]): string => {
  if (voices.length === 0) {
    return ''
  }
  const preferred = voices.find((voice) => voice.id === DEFAULT_VOICE_ID) ?? voices[0]
  return `piper:${preferred.id}`
}

/**
 * Keeps a stored selection only when it still exists; the legacy `auto` value
 * (and anything no longer provisioned) falls back to the preferred voice.
 */
export const resolveVoiceKey = (
  storedKey: string | undefined,
  availableKeys: string[],
  preferredKey: string,
): string => {
  if (storedKey && storedKey !== AUTO_VOICE_KEY && availableKeys.includes(storedKey)) {
    return storedKey
  }
  return preferredKey || availableKeys[0] || ''
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
    // `referrerPolicy: 'no-referrer'` is required: hf-mirror.com answers any
    // request that carries a Referer with an anti-hotlink HTML page (200, no
    // CORS headers), which the browser turns into a CORS failure. A browser
    // always sends Referer for cross-origin fetches, while the Node download
    // script does not - that is why the mirror only worked server-side.
    const response = await fetch(source.url, {
      signal: controller.signal,
      referrerPolicy: 'no-referrer',
    })
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
 * Sources are started in parallel and the one that has delivered the most bytes
 * when this window elapses wins. Long enough to cover the mirror's redirect and
 * its first-byte latency, short enough that an unreachable mirror costs only a
 * few seconds instead of the full stall timeout.
 */
export const DEFAULT_RACE_WINDOW_MS = 5_000

interface DownloadCandidate {
  source: ModelSource
  controller: AbortController
  loaded: number
  failure: Error | null
  promise: Promise<ArrayBuffer>
}

const downloadErrorMessage = (failures: string[]): string =>
  `语音模型下载失败（${failures.join('；')}）。请检查网络，或在服务器执行 npm run tts:setup。`

const startCandidate = (
  source: ModelSource,
  voice: PiperVoiceEntry,
  options: FetchVoiceModelOptions,
  onProgress: (candidate: DownloadCandidate, progress: TtsProgress) => void,
): DownloadCandidate => {
  const controller = new AbortController()
  const forwardAbort = () => controller.abort()
  options.signal?.addEventListener('abort', forwardAbort, { once: true })

  const candidate: DownloadCandidate = {
    source,
    controller,
    loaded: 0,
    failure: null,
    promise: Promise.resolve(new ArrayBuffer(0)),
  }

  candidate.promise = fetchFromSource(source, voice, {
    ...options,
    signal: controller.signal,
    onProgress: (progress) => {
      candidate.loaded = progress.loaded
      onProgress(candidate, progress)
    },
  })
    .then((buffer) => {
      if (voice.sizeBytes > 0 && buffer.byteLength !== voice.sizeBytes) {
        throw new Error(`字节数不符（期望 ${voice.sizeBytes}，实际 ${buffer.byteLength}）`)
      }
      return buffer
    })
    .catch((error: unknown) => {
      candidate.failure = error instanceof Error ? error : new Error('未知错误')
      throw candidate.failure
    })
    .finally(() => {
      options.signal?.removeEventListener('abort', forwardAbort)
    })

  // Losers are rejected on purpose; keep the rejection from surfacing as unhandled.
  void candidate.promise.catch(() => undefined)

  return candidate
}

/** Resolves with the winning candidate, or `null` when every source failed. */
const waitForWinner = (
  candidates: DownloadCandidate[],
  raceWindowMs: number,
): Promise<DownloadCandidate | null> =>
  new Promise((resolve) => {
    let decided = false
    let timer: ReturnType<typeof setTimeout> | undefined

    const decide = (winner: DownloadCandidate | null) => {
      if (decided) {
        return
      }
      decided = true
      clearTimeout(timer)
      resolve(winner)
    }

    const alive = () => candidates.filter((candidate) => !candidate.failure)

    const leader = (): DownloadCandidate | null =>
      alive().reduce<DownloadCandidate | null>(
        (best, candidate) => (best === null || candidate.loaded > best.loaded ? candidate : best),
        null,
      )

    timer = setTimeout(() => {
      const fastest = leader()
      if (fastest && fastest.loaded > 0) {
        decide(fastest)
        return
      }
      const remaining = alive()
      if (remaining.length === 1) {
        decide(remaining[0])
      }
      // No source has delivered anything yet: keep waiting, each one still has
      // its own stall timeout and may yet start producing bytes.
    }, raceWindowMs)

    for (const candidate of candidates) {
      candidate.promise.then(
        () => decide(candidate),
        () => {
          const remaining = alive()
          if (remaining.length === 0) {
            decide(null)
          } else if (remaining.length === 1) {
            decide(remaining[0])
          }
        },
      )
    }
  })

const downloadSequentially = async (
  sources: ModelSource[],
  voice: PiperVoiceEntry,
  options: FetchVoiceModelOptions,
): Promise<VoiceModelResult> => {
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
      const reason = error instanceof Error ? error.message : '未知错误'
      failures.push(`${sourceLabel(source.kind)}：${reason}`)
      console.warn(`[tts] 语音模型来源不可用（${sourceLabel(source.kind)}）：${reason}`)
    }
  }

  throw new Error(downloadErrorMessage(failures))
}

/**
 * Downloads a voice model from the fastest reachable source.
 *
 * The mirror only proxies metadata and 302s the payload to an AWS host, so
 * whether it is faster than the app origin depends entirely on the client's
 * network. Instead of assuming, every source is started at once and the one
 * that has delivered the most bytes after the race window keeps the download;
 * the rest are aborted. A source that answers with an error, stalls, or
 * delivers a byte count that does not match the manifest is disqualified
 * (mirrors sometimes answer with an HTML error page).
 */
export const fetchVoiceModel = async (
  voice: PiperVoiceEntry,
  options: FetchVoiceModelOptions = {},
): Promise<VoiceModelResult> => {
  const sources = buildModelSources(voice, options.mirrorBase ?? '')
  const raceWindowMs = options.raceWindowMs ?? DEFAULT_RACE_WINDOW_MS

  if (sources.length < 2 || raceWindowMs <= 0) {
    return downloadSequentially(sources, voice, options)
  }

  const candidates: DownloadCandidate[] = []
  let chosen: DownloadCandidate | null = null

  const reportProgress = (candidate: DownloadCandidate, progress: TtsProgress) => {
    if (chosen) {
      if (chosen === candidate) {
        options.onProgress?.(progress)
      }
      return
    }
    // Still racing: only the leading source may move the progress bar, so the
    // percentage never jumps back and forth between two downloads.
    const best = candidates.reduce<DownloadCandidate | null>(
      (top, item) => (top === null || item.loaded > top.loaded ? item : top),
      null,
    )
    if (best === candidate) {
      options.onProgress?.(progress)
    }
  }

  for (const source of sources) {
    candidates.push(startCandidate(source, voice, options, reportProgress))
  }

  const winner = await waitForWinner(candidates, raceWindowMs)

  if (options.signal?.aborted) {
    throw new TtsCanceledError()
  }
  if (!winner) {
    throw new Error(
      downloadErrorMessage(
        candidates.map(
          (candidate) =>
            `${sourceLabel(candidate.source.kind)}：${candidate.failure?.message ?? '未知错误'}`,
        ),
      ),
    )
  }

  chosen = winner
  for (const candidate of candidates) {
    if (candidate !== winner) {
      candidate.controller.abort()
    }
  }

  try {
    const buffer = await winner.promise
    return { buffer, source: winner.source.kind }
  } catch (error) {
    const reason = error instanceof Error ? error.message : '未知错误'
    const others = candidates
      .filter((candidate) => candidate !== winner)
      .map((candidate) => candidate.source)
    if (others.length > 0 && !options.signal?.aborted) {
      console.warn(
        `[tts] ${sourceLabel(winner.source.kind)}下载中断（${reason}），改用其他来源重试`,
      )
      return downloadSequentially(others, voice, options)
    }
    throw new Error(downloadErrorMessage([`${sourceLabel(winner.source.kind)}：${reason}`]))
  }
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
