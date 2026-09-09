import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  buildModelSources,
  defaultVoiceKey,
  deriveRepoPath,
  fetchVoiceModel,
  loadVoiceManifest,
  resolveMirrorBase,
  resolveVoiceKey,
  type PiperVoiceEntry,
} from './piperAssets'
import { PiperEngine } from './piperEngine'
import { TtsCanceledError } from './types'

const MIRROR = 'https://hf-mirror.example/diffusionstudio/piper-voices/resolve/main'

const voice: PiperVoiceEntry = {
  id: 'en_US-lessac-medium',
  label: 'Lessac（美音·女声）',
  name: 'lessac',
  language: 'en-US',
  quality: 'medium',
  sizeBytes: 8,
  modelFile: 'en_US-lessac-medium.onnx',
  configFile: 'en_US-lessac-medium.onnx.json',
  repoPath: 'en/en_US/lessac/medium/en_US-lessac-medium',
}

const modelUrl = `${MIRROR}/${voice.repoPath}.onnx`
const serverUrl = `/tts/voices/${voice.modelFile}`

const binaryResponse = (bytes: number[], status = 200) =>
  new Response(new Uint8Array(bytes), {
    status,
    headers: { 'content-length': String(bytes.length) },
  })

/** A body that stays open, so the download never completes on its own. */
const openStreamResponse = (bytes: number[], closeAfterMs?: number) =>
  new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(bytes))
        if (closeAfterMs !== undefined) {
          setTimeout(() => {
            try {
              controller.close()
            } catch {
              // The reader was cancelled (source lost the race); nothing to do.
            }
          }, closeAfterMs)
        }
      },
    }),
    { status: 200, headers: { 'content-length': String(bytes.length) } },
  )

/** A body that delivers bytes and then fails, mimicking a dropped connection. */
const failingStreamResponse = (bytes: number[], errorAfterMs: number) =>
  new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(bytes))
        setTimeout(() => {
          try {
            controller.error(new Error('连接中断'))
          } catch {
            // Already cancelled.
          }
        }, errorAfterMs)
      },
    }),
    { status: 200, headers: { 'content-length': String(bytes.length) } },
  )

/** A body that never produces a byte, mimicking an unreachable mirror. */
const silentResponse = () =>
  new Response(new ReadableStream<Uint8Array>({ start() {} }), { status: 200 })

const stubFetch = (
  handler: (url: string, init?: RequestInit) => Response | Promise<Response>,
) => {
  const mock = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => handler(String(input), init),
  )
  vi.stubGlobal('fetch', mock)
  return mock
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('deriveRepoPath', () => {
  it('derives the Piper repository path from the voice id', () => {
    expect(deriveRepoPath('en_US-lessac-medium')).toBe('en/en_US/lessac/medium/en_US-lessac-medium')
    expect(deriveRepoPath('en_GB-jenny_dioco-medium')).toBe(
      'en/en_GB/jenny_dioco/medium/en_GB-jenny_dioco-medium',
    )
  })
})

describe('buildModelSources', () => {
  it('tries the mirror before the app origin', () => {
    expect(buildModelSources(voice, MIRROR)).toEqual([
      { kind: 'mirror', url: modelUrl },
      { kind: 'server', url: serverUrl },
    ])
  })

  it('uses the app origin only when no mirror is configured', () => {
    expect(buildModelSources(voice, '')).toEqual([{ kind: 'server', url: serverUrl }])
  })

  it('derives the repo path when the manifest does not carry one', () => {
    const legacy: PiperVoiceEntry = { ...voice, repoPath: undefined }
    expect(buildModelSources(legacy, MIRROR)[0].url).toBe(modelUrl)
  })
})

describe('resolveMirrorBase', () => {  it('prefers the manifest value and strips trailing slashes', () => {
    expect(resolveMirrorBase({ mirrorBase: `${MIRROR}/`, voices: [] })).toBe(MIRROR)
  })

  it('falls back to the built-in mirror for legacy manifests', () => {
    expect(resolveMirrorBase({ voices: [] })).toContain('hf-mirror.com')
  })

  it('lets VITE_TTS_MIRROR_BASE win', () => {
    vi.stubEnv('VITE_TTS_MIRROR_BASE', 'https://mirror.internal/voices')
    expect(resolveMirrorBase({ mirrorBase: MIRROR, voices: [] })).toBe('https://mirror.internal/voices')
  })

  it('can disable the mirror with an empty value', () => {
    vi.stubEnv('VITE_TTS_MIRROR_BASE', '')
    expect(resolveMirrorBase({ mirrorBase: MIRROR, voices: [] })).toBe('')
  })
})

describe('defaultVoiceKey / resolveVoiceKey', () => {
  const voices: PiperVoiceEntry[] = [
    { ...voice, id: 'en_GB-alan-medium' },
    { ...voice, id: 'en_US-lessac-medium' },
  ]

  it('prefers lessac as the default regardless of manifest order', () => {
    expect(defaultVoiceKey(voices)).toBe('piper:en_US-lessac-medium')
    expect(defaultVoiceKey([])).toBe('')
  })

  it('keeps a stored selection that still exists', () => {
    expect(
      resolveVoiceKey('piper:en_GB-alan-medium', ['piper:en_GB-alan-medium'], 'piper:en_US-lessac-medium'),
    ).toBe('piper:en_GB-alan-medium')
  })

  it('migrates the legacy auto value and unknown voices to the default', () => {
    expect(resolveVoiceKey('auto', ['piper:en_US-lessac-medium'], 'piper:en_US-lessac-medium')).toBe(
      'piper:en_US-lessac-medium',
    )
    expect(
      resolveVoiceKey('piper:gone', ['piper:en_US-lessac-medium'], 'piper:en_US-lessac-medium'),
    ).toBe('piper:en_US-lessac-medium')
  })
})

describe('fetchVoiceModel', () => {
  it('keeps the mirror when it completes the download first', async () => {
    const seen: string[] = []
    stubFetch((url) => {
      seen.push(url)
      return url === modelUrl
        ? binaryResponse([1, 2, 3, 4, 5, 6, 7, 8])
        : openStreamResponse([1, 2])
    })

    const result = await fetchVoiceModel(voice, { mirrorBase: MIRROR, raceWindowMs: 50 })

    expect(result.source).toBe('mirror')
    expect(result.buffer.byteLength).toBe(8)
    // Both sources are started in parallel so the fastest one can be measured.
    expect(seen).toEqual([modelUrl, serverUrl])
  })

  it('switches to the app origin when the mirror delivers nothing', async () => {
    stubFetch((url) => (url === modelUrl ? silentResponse() : binaryResponse([1, 2, 3, 4, 5, 6, 7, 8])))

    const result = await fetchVoiceModel(voice, { mirrorBase: MIRROR, raceWindowMs: 50 })

    expect(result.source).toBe('server')
    expect(result.buffer.byteLength).toBe(8)
  })

  it('picks the source with the most bytes when the race window closes', async () => {
    const shortVoice = { ...voice, sizeBytes: 4 }
    stubFetch((url) =>
      url === modelUrl ? openStreamResponse([1, 2], 5_000) : openStreamResponse([1, 2, 3, 4], 40),
    )

    const result = await fetchVoiceModel(shortVoice, { mirrorBase: MIRROR, raceWindowMs: 20 })

    expect(result.source).toBe('server')
    expect(result.buffer.byteLength).toBe(4)
  })

  it('aborts the slower source once the race is decided', async () => {
    const signals: AbortSignal[] = []
    stubFetch((url, init) => {
      if (init?.signal) {
        signals.push(init.signal)
      }
      return url === modelUrl ? binaryResponse([1, 2, 3, 4, 5, 6, 7, 8]) : silentResponse()
    })

    const result = await fetchVoiceModel(voice, { mirrorBase: MIRROR, raceWindowMs: 50 })

    expect(result.source).toBe('mirror')
    expect(signals[1]?.aborted).toBe(true)
  })

  it('retries the other source when the winner fails after the race', async () => {
    let serverCalls = 0
    stubFetch((url) => {
      if (url === modelUrl) {
        return failingStreamResponse([1, 2, 3, 4], 60)
      }
      serverCalls += 1
      return serverCalls === 1
        ? openStreamResponse([1, 2], 5_000)
        : binaryResponse([1, 2, 3, 4, 5, 6, 7, 8])
    })

    const result = await fetchVoiceModel(voice, { mirrorBase: MIRROR, raceWindowMs: 20 })

    expect(result.source).toBe('server')
    expect(result.buffer.byteLength).toBe(8)
    expect(serverCalls).toBe(2)
  })

  it('omits the Referer so anti-hotlink mirrors serve the file', async () => {
    const mock = stubFetch(() => binaryResponse([1, 2, 3, 4, 5, 6, 7, 8]))

    await fetchVoiceModel(voice, { mirrorBase: MIRROR, raceWindowMs: 50 })

    const init = mock.mock.calls[0]?.[1] as RequestInit | undefined
    expect(init?.referrerPolicy).toBe('no-referrer')
  })

  it('falls back to the app origin when the mirror fails', async () => {
    const seen: string[] = []
    stubFetch((url) => {
      seen.push(url)
      return url === modelUrl
        ? binaryResponse([], 404)
        : binaryResponse([1, 2, 3, 4, 5, 6, 7, 8])
    })

    const result = await fetchVoiceModel(voice, { mirrorBase: MIRROR, raceWindowMs: 50 })

    expect(result.source).toBe('server')
    expect(seen).toEqual([modelUrl, serverUrl])
  })

  it('rejects a mirror response whose byte count does not match the manifest', async () => {
    stubFetch((url) =>
      // A mirror error page that still answers 200 must not be accepted.
      url === modelUrl
        ? binaryResponse([1, 2, 3], 200)
        : binaryResponse([1, 2, 3, 4, 5, 6, 7, 8]),
    )

    const result = await fetchVoiceModel(voice, { mirrorBase: MIRROR, raceWindowMs: 50 })

    expect(result.source).toBe('server')
  })

  it('reports both sources when every attempt fails', async () => {
    stubFetch(() => binaryResponse([], 500))

    await expect(
      fetchVoiceModel(voice, { mirrorBase: MIRROR, raceWindowMs: 50 }),
    ).rejects.toThrow(/镜像站：HTTP 500；服务器：HTTP 500/)
  })

  it('throws a cancellation error when the caller aborts', async () => {
    const controller = new AbortController()
    stubFetch(() => {
      controller.abort()
      throw new DOMException('aborted', 'AbortError')
    })

    await expect(
      fetchVoiceModel(voice, { mirrorBase: MIRROR, signal: controller.signal }),
    ).rejects.toBeInstanceOf(TtsCanceledError)
  })

  it('reports download progress with the active source', async () => {
    stubFetch(() => binaryResponse([1, 2, 3, 4, 5, 6, 7, 8]))
    const progress: string[] = []

    await fetchVoiceModel(voice, {
      mirrorBase: MIRROR,
      raceWindowMs: 0,
      onProgress: (item) => progress.push(`${item.source}:${item.message}`),
    })

    expect(progress.length).toBeGreaterThan(0)
    expect(progress.every((entry) => entry.startsWith('mirror:从镜像站加载语音模型'))).toBe(true)
  })

  it('reports progress only for the source that is winning the race', async () => {
    stubFetch((url) => (url === modelUrl ? binaryResponse([], 404) : binaryResponse([1, 2, 3, 4, 5, 6, 7, 8])))
    const progress: string[] = []

    const result = await fetchVoiceModel(voice, {
      mirrorBase: MIRROR,
      raceWindowMs: 50,
      onProgress: (item) => progress.push(`${item.source}:${item.message}`),
    })

    expect(result.source).toBe('server')
    expect(progress.length).toBeGreaterThan(0)
    expect(progress.every((entry) => entry.startsWith('server:'))).toBe(true)
  })

  it('downloads strictly in order when the race window is disabled', async () => {
    const seen: string[] = []
    stubFetch((url) => {
      seen.push(url)
      return url === modelUrl
        ? binaryResponse([1, 2, 3, 4, 5, 6, 7, 8])
        : binaryResponse([], 500)
    })

    const result = await fetchVoiceModel(voice, { mirrorBase: MIRROR, raceWindowMs: 0 })

    expect(result.source).toBe('mirror')
    expect(seen).toEqual([modelUrl])
  })
})

describe('loadVoiceManifest', () => {
  it('returns an empty list when the manifest is not provisioned', async () => {
    stubFetch(() => binaryResponse([], 404))
    expect(await loadVoiceManifest()).toEqual({ voices: [] })
  })

  it('tolerates a manifest without a voices array', async () => {
    stubFetch(() => new Response('{}', { status: 200 }))
    expect(await loadVoiceManifest()).toEqual({ voices: [] })
  })
})

describe('PiperEngine.loadVoices', () => {
  it('fetches the manifest once and reuses the cached list', async () => {
    const mock = stubFetch((url) =>
      url.endsWith('manifest.json')
        ? new Response(JSON.stringify({ mirrorBase: MIRROR, voices: [voice] }), { status: 200 })
        : binaryResponse([], 404),
    )

    const engine = new PiperEngine()
    const first = await engine.loadVoices()
    const second = await engine.loadVoices()

    expect(first).toHaveLength(1)
    expect(first[0].id).toBe('en_US-lessac-medium')
    expect(second).toBe(first)
    expect(mock).toHaveBeenCalledTimes(1)
  })
})
