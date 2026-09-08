import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  buildModelSources,
  deriveRepoPath,
  fetchVoiceModel,
  loadVoiceManifest,
  resolveMirrorBase,
  type PiperVoiceEntry,
} from './piperAssets'
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

const stubFetch = (handler: (url: string) => Response | Promise<Response>) => {
  const mock = vi.fn(async (input: RequestInfo | URL) => handler(String(input)))
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

describe('resolveMirrorBase', () => {
  it('prefers the manifest value and strips trailing slashes', () => {
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

describe('fetchVoiceModel', () => {
  it('uses the mirror and does not touch the server when it succeeds', async () => {
    const mock = stubFetch((url) => {
      expect(url).toBe(modelUrl)
      return binaryResponse([1, 2, 3, 4, 5, 6, 7, 8])
    })

    const result = await fetchVoiceModel(voice, { mirrorBase: MIRROR })

    expect(result.source).toBe('mirror')
    expect(result.buffer.byteLength).toBe(8)
    expect(mock).toHaveBeenCalledTimes(1)
  })

  it('falls back to the app origin when the mirror fails', async () => {
    const seen: string[] = []
    stubFetch((url) => {
      seen.push(url)
      return url === modelUrl
        ? binaryResponse([], 404)
        : binaryResponse([1, 2, 3, 4, 5, 6, 7, 8])
    })

    const result = await fetchVoiceModel(voice, { mirrorBase: MIRROR })

    expect(result.source).toBe('server')
    expect(seen).toEqual([modelUrl, serverUrl])
  })

  it('rejects a mirror response whose byte count does not match the manifest', async () => {
    const seen: string[] = []
    stubFetch((url) => {
      seen.push(url)
      // A mirror error page that still answers 200 must not be accepted.
      return url === modelUrl
        ? binaryResponse([1, 2, 3], 200)
        : binaryResponse([1, 2, 3, 4, 5, 6, 7, 8])
    })

    const result = await fetchVoiceModel(voice, { mirrorBase: MIRROR })

    expect(result.source).toBe('server')
    expect(seen).toEqual([modelUrl, serverUrl])
  })

  it('reports both sources when every attempt fails', async () => {
    stubFetch(() => binaryResponse([], 500))

    await expect(fetchVoiceModel(voice, { mirrorBase: MIRROR })).rejects.toThrow(
      /镜像站：HTTP 500；服务器：HTTP 500/,
    )
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
      onProgress: (item) => progress.push(`${item.source}:${item.message}`),
    })

    expect(progress.length).toBeGreaterThan(0)
    expect(progress.every((entry) => entry.startsWith('mirror:从镜像站加载语音模型'))).toBe(true)
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
