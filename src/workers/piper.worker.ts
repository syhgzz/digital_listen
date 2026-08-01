import { TtsSession } from '@mintplex-labs/piper-tts-web'
import type { Progress, VoiceId } from '@mintplex-labs/piper-tts-web'

export type PiperRequest = {
  type: 'speak'
  requestId: number
  text: string
}

export type PiperResponse =
  | { type: 'progress'; requestId: number; loaded: number; total: number }
  | { type: 'audio'; requestId: number; audio: Blob }
  | { type: 'error'; requestId: number; message: string }

const VOICE_ID: VoiceId = 'en_US-lessac-medium'
const HUGGING_FACE_MODEL_PREFIX =
  'https://huggingface.co/diffusionstudio/piper-voices/resolve/main/'
const baseUrl = new URL(import.meta.env.BASE_URL, globalThis.location.origin)
const nativeFetch = globalThis.fetch.bind(globalThis)
const worker = globalThis as unknown as Worker

class MissingModelCacheEntry extends Error {
  constructor() {
    super('Piper model cache miss.')
  }
}

const volatileModelFiles = new Map<string, Blob>()
let modelCachePromise: Promise<Cache | null> | null = null

const cacheRequest = (name: string): Request =>
  new Request(new URL(`piper-model-cache/${encodeURIComponent(name)}`, baseUrl))

const getModelCache = async (): Promise<Cache | null> => {
  if (modelCachePromise) {
    return modelCachePromise
  }
  if (typeof caches === 'undefined') {
    return null
  }
  modelCachePromise = caches.open('digital-listen-piper-models').catch(() => null)
  return modelCachePromise
}

class PersistentWritableFileStream {
  private contents: Blob | null = null
  private readonly name: string

  constructor(name: string) {
    this.name = name
  }

  async write(value: BlobPart) {
    this.contents = value instanceof Blob ? value : new Blob([value])
  }

  async close() {
    if (!this.contents) {
      return
    }
    const cache = await getModelCache()
    if (cache) {
      try {
        await cache.put(cacheRequest(this.name), new Response(this.contents))
        return
      } catch {
        // Fall through to the volatile fallback when Cache Storage is unavailable.
      }
    }
    volatileModelFiles.set(this.name, this.contents)
  }
}

class PersistentFileHandle {
  private readonly name: string

  constructor(name: string) {
    this.name = name
  }

  async getFile(): Promise<File> {
    const cache = await getModelCache()
    if (cache) {
      try {
        const response = await cache.match(cacheRequest(this.name))
        if (response) {
          return (await response.blob()) as File
        }
      } catch {
        // Try the volatile fallback below.
      }
    }
    const volatileFile = volatileModelFiles.get(this.name)
    if (volatileFile) {
      return volatileFile as File
    }
    throw new MissingModelCacheEntry()
  }

  async createWritable() {
    return new PersistentWritableFileStream(this.name)
  }

  async remove() {
    const cache = await getModelCache()
    if (cache) {
      try {
        await cache.delete(cacheRequest(this.name))
      } catch {
        // The volatile fallback is still cleared below.
      }
    }
    volatileModelFiles.delete(this.name)
  }
}

class PersistentDirectoryHandle {
  async getDirectoryHandle() {
    return this
  }

  async getFileHandle(name: string) {
    return new PersistentFileHandle(name)
  }
}

const disableFragileModelCache = () => {
  const navigatorWithStorage = globalThis.navigator as Navigator & {
    storage: StorageManager & { getDirectory?: () => Promise<PersistentDirectoryHandle> }
  }
  if (!navigatorWithStorage.storage) {
    return
  }

  try {
    Object.defineProperty(navigatorWithStorage, 'storage', {
      configurable: true,
      value: {
        getDirectory: async () => new PersistentDirectoryHandle(),
      },
    })
  } catch {
    try {
      Object.defineProperty(navigatorWithStorage.storage, 'getDirectory', {
        configurable: true,
        value: async () => new PersistentDirectoryHandle(),
      })
    } catch {
      // If the browser locks both properties, Piper will fall back to its own handling.
    }
  }
}

const isWebKit = () => {
  const userAgent = globalThis.navigator.userAgent
  return /AppleWebKit/.test(userAgent) && !/Chrome|Chromium|Edg|OPR|Firefox/.test(userAgent)
}

if (isWebKit()) {
  disableFragileModelCache()
}

globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const url = typeof input === 'string' || input instanceof URL ? String(input) : input.url
  if (!url.startsWith(HUGGING_FACE_MODEL_PREFIX)) {
    return nativeFetch(input, init)
  }

  const fileName = url.split('/').at(-1)
  if (!fileName || !/^en_US-lessac-medium\.onnx(?:\.json)?$/.test(fileName)) {
    throw new Error('Piper requested an unexpected model asset.')
  }

  const localUrl = new URL(`models/${fileName}`, baseUrl)
  const response = await nativeFetch(localUrl, init)
  if (!response.ok || response.headers.get('content-type')?.includes('text/html')) {
    throw new Error(`Missing local Piper model asset: ${fileName}`)
  }
  return response
}

let sessionPromise: Promise<TtsSession> | null = null
let queue = Promise.resolve()

const configureStableRuntime = () => {
  const workerNavigator = globalThis.navigator as Navigator & {
    gpu?: unknown
    hardwareConcurrency: number
  }

  try {
    Object.defineProperty(workerNavigator, 'gpu', {
      configurable: true,
      value: undefined,
    })
  } catch {
    // Some browsers expose navigator properties as non-configurable.
  }

  try {
    Object.defineProperty(workerNavigator, 'hardwareConcurrency', {
      configurable: true,
      value: 1,
    })
  } catch {
    // Piper will use the browser value if the property cannot be redefined.
  }
}

const post = (message: PiperResponse) => {
  worker.postMessage(message)
}

const ensureSession = (requestId: number): Promise<TtsSession> => {
  if (!sessionPromise) {
    configureStableRuntime()
    const progressRequestId = requestId
    sessionPromise = TtsSession.create({
      voiceId: VOICE_ID,
      wasmPaths: {
        onnxWasm: new URL('wasm/ort/', baseUrl).toString(),
        piperData: new URL('wasm/piper/piper_phonemize.data', baseUrl).toString(),
        piperWasm: new URL('wasm/piper/piper_phonemize.wasm', baseUrl).toString(),
      },
      progress: (progress: Progress) => {
        post({
          type: 'progress',
          requestId: progressRequestId,
          loaded: progress.loaded,
          total: progress.total,
        })
      },
    }).catch((error: unknown) => {
      sessionPromise = null
      TtsSession._instance = null
      throw error
    })
  }
  return sessionPromise
}

const synthesize = async (request: PiperRequest) => {
  try {
    const session = await ensureSession(request.requestId)
    const audio = await session.predict(request.text)
    post({ type: 'audio', requestId: request.requestId, audio })
  } catch (error) {
    post({
      type: 'error',
      requestId: request.requestId,
      message: error instanceof Error ? error.message : 'Unknown Piper synthesis error.',
    })
  }
}

worker.addEventListener('message', (event: MessageEvent<PiperRequest>) => {
  if (event.data.type !== 'speak') {
    return
  }
  queue = queue.then(() => synthesize(event.data))
})
