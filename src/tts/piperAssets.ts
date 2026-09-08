import type { TtsProgress } from './types'

/** Layout written by `scripts/tts-assets.mjs` into `public/tts`. */
export const TTS_BASE_PATH = '/tts'

export interface PiperVoiceEntry {
  id: string
  name: string
  language: string
  quality: string
  sizeBytes: number
  modelFile: string
  configFile: string
}

export interface PiperVoiceManifest {
  generatedAt?: string
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

export const voiceModelUrl = (voice: PiperVoiceEntry): string =>
  `${TTS_BASE_PATH}/voices/${voice.modelFile}`

export const voiceConfigUrl = (voice: PiperVoiceEntry): string =>
  `${TTS_BASE_PATH}/voices/${voice.configFile}`

/** Reads `public/tts/voices/manifest.json`; an empty list means assets were never provisioned. */
export const loadVoiceManifest = async (): Promise<PiperVoiceEntry[]> => {
  try {
    const response = await fetch(`${TTS_BASE_PATH}/voices/manifest.json`, { cache: 'no-cache' })
    if (!response.ok) {
      return []
    }
    const manifest = (await response.json()) as PiperVoiceManifest
    return Array.isArray(manifest.voices) ? manifest.voices : []
  } catch (error) {
    console.warn('无法读取本地语音清单。', error)
    return []
  }
}

export const loadVoiceConfig = async (voice: PiperVoiceEntry): Promise<PiperVoiceConfig> => {
  const response = await fetch(voiceConfigUrl(voice))
  if (!response.ok) {
    throw new Error(`读取语音配置失败（HTTP ${response.status}）：${voice.configFile}`)
  }
  return (await response.json()) as PiperVoiceConfig
}

export const fetchVoiceModel = async (
  voice: PiperVoiceEntry,
  onProgress?: (progress: TtsProgress) => void,
): Promise<ArrayBuffer> => {
  const response = await fetch(voiceModelUrl(voice))
  if (!response.ok) {
    throw new Error(
      `语音模型缺失（HTTP ${response.status}）：${voice.modelFile}，请先运行 npm run tts:setup`,
    )
  }

  const total = Number(response.headers.get('content-length') ?? voice.sizeBytes ?? 0)
  if (!response.body) {
    return response.arrayBuffer()
  }

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let loaded = 0

  for (;;) {
    const { done, value } = await reader.read()
    if (done) {
      break
    }
    chunks.push(value)
    loaded += value.length
    onProgress?.({
      stage: 'model',
      loaded,
      total,
      ratio: total > 0 ? Math.min(1, loaded / total) : 0,
      message: total > 0 ? `加载语音模型 ${Math.round((loaded / total) * 100)}%` : '加载语音模型…',
    })
  }

  const merged = new Uint8Array(loaded)
  let offset = 0
  for (const chunk of chunks) {
    merged.set(chunk, offset)
    offset += chunk.length
  }
  return merged.buffer
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
