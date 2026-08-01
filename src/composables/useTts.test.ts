import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent, h, type Ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useTts } from './useTts'

type TtsApi = ReturnType<typeof useTts>

class MockWorker {
  static instances: MockWorker[] = []

  readonly messages: unknown[] = []
  readonly terminate = vi.fn()
  private listeners = new Set<(event: MessageEvent) => void>()
  private errorListeners = new Set<(event: ErrorEvent) => void>()

  constructor() {
    MockWorker.instances.push(this)
  }

  postMessage(message: unknown) {
    this.messages.push(message)
  }

  addEventListener(type: string, listener: EventListenerOrEventListenerObject) {
    if (type === 'message' && typeof listener === 'function') {
      this.listeners.add(listener as (event: MessageEvent) => void)
    }
    if (type === 'error' && typeof listener === 'function') {
      this.errorListeners.add(listener as (event: ErrorEvent) => void)
    }
  }

  removeEventListener(type: string, listener: EventListenerOrEventListenerObject) {
    if (type === 'message' && typeof listener === 'function') {
      this.listeners.delete(listener as (event: MessageEvent) => void)
    }
    if (type === 'error' && typeof listener === 'function') {
      this.errorListeners.delete(listener as (event: ErrorEvent) => void)
    }
  }

  emit(data: unknown) {
    const event = new MessageEvent('message', { data })
    for (const listener of this.listeners) {
      listener(event)
    }
  }

  emitError(message: string) {
    const event = new ErrorEvent('error', { message })
    for (const listener of this.errorListeners) {
      listener(event)
    }
  }
}

class MockAudioContext {
  static instances: MockAudioContext[] = []

  readonly destination = {}
  readonly resume = vi.fn(async () => undefined)
  readonly close = vi.fn(async () => undefined)
  state: AudioContextState = 'suspended'

  constructor() {
    MockAudioContext.instances.push(this)
  }

}

class MockAudio {
  static instances: MockAudio[] = []
  static playImplementation: (audio: MockAudio) => Promise<void> = async () => undefined

  readonly pause = vi.fn()
  readonly load = vi.fn()
  readonly removeAttribute = vi.fn()
  readonly setAttribute = vi.fn()
  readonly play = vi.fn(() => MockAudio.playImplementation(this))
  onended: (() => void) | null = null
  onerror: ((event: Event) => void) | null = null
  playbackRate = 1
  preservesPitch = false
  mozPreservesPitch = false
  webkitPreservesPitch = false
  src: string

  constructor(src = '') {
    this.src = src
    MockAudio.instances.push(this)
  }
}

const mountComposable = () => {
  let api: TtsApi | undefined
  const wrapper = mount(
    defineComponent({
      setup() {
        api = useTts({ initialRatePreset: 'normal' })
        return () => h('div')
      },
    }),
  )

  if (!api) {
    throw new Error('TTS composable did not initialize.')
  }
  return { api, wrapper }
}

describe('useTts', () => {
  beforeEach(() => {
    MockWorker.instances = []
    MockAudioContext.instances = []
    MockAudio.instances = []
    MockAudio.playImplementation = async () => undefined
    vi.stubGlobal('Worker', MockWorker)
    vi.stubGlobal('AudioContext', MockAudioContext)
    vi.stubGlobal('Audio', MockAudio)
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test-audio')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('posts normalized speech to the Piper worker', async () => {
    const { api, wrapper } = mountComposable()

    expect((api.supported as Ref<boolean>).value).toBe(true)
    await api.speak('one hundred')

    expect(MockWorker.instances[0]?.messages).toEqual([
      { type: 'speak', requestId: 1, text: 'one hundred' },
    ])
    wrapper.unmount()
  })

  it('unlocks audio during the user action and reuses the same element', async () => {
    const { api, wrapper } = mountComposable()

    await api.speak('one')

    expect(MockAudio.instances).toHaveLength(1)
    expect(MockAudio.instances[0]?.play).toHaveBeenCalledOnce()

    MockWorker.instances[0]?.emit({
      type: 'audio',
      requestId: 1,
      audio: new Blob(['audio']),
    })
    await flushPromises()

    expect(MockAudio.instances).toHaveLength(1)
    expect(MockAudio.instances[0]?.play).toHaveBeenCalledTimes(2)
    wrapper.unmount()
  })

  it('does not block worker synthesis when the unlock play promise stays pending', async () => {
    let playCall = 0
    MockAudio.playImplementation = () => {
      playCall += 1
      return playCall === 1 ? new Promise<void>(() => undefined) : Promise.resolve()
    }
    const { api, wrapper } = mountComposable()

    void api.speak('one')
    await flushPromises()

    expect(MockAudio.instances[0]?.play).toHaveBeenCalledOnce()
    expect(MockWorker.instances[0]?.messages).toEqual([
      { type: 'speak', requestId: 1, text: 'one' },
    ])
    MockWorker.instances[0]?.emit({
      type: 'audio',
      requestId: 1,
      audio: new Blob(['audio']),
    })
    await flushPromises()

    expect(MockAudio.instances[0]?.play).toHaveBeenCalledTimes(2)
    expect(api.speaking.value).toBe(true)
    wrapper.unmount()
  })

  it('retries media unlock on a later explicit action after playback failure', async () => {
    let playCall = 0
    MockAudio.playImplementation = () => {
      playCall += 1
      if (playCall === 1) {
        return new Promise<void>(() => undefined)
      }
      if (playCall === 2) {
        return Promise.reject(new Error('autoplay rejected'))
      }
      return Promise.resolve()
    }
    const { api, wrapper } = mountComposable()

    void api.speak('first')
    await flushPromises()
    MockWorker.instances[0]?.emit({
      type: 'audio',
      requestId: 1,
      audio: new Blob(['first']),
    })
    await flushPromises()
    expect(api.ttsError.value).toContain('autoplay rejected')

    await api.speak('second')

    expect(MockAudio.instances[0]?.play).toHaveBeenCalledTimes(3)
    expect(MockWorker.instances[0]?.messages.at(-1)).toEqual({
      type: 'speak',
      requestId: 2,
      text: 'second',
    })
    wrapper.unmount()
  })

  it('reports model progress and plays returned audio at the selected rate', async () => {
    const { api, wrapper } = mountComposable()
    api.selectedRatePreset.value = 'slightlyFast'
    await api.speak('twenty-one')

    const worker = MockWorker.instances[0]
    worker?.emit({ type: 'progress', requestId: 1, loaded: 5, total: 10 })
    expect(api.preparing.value).toBe(true)
    expect(api.downloadProgress.value).toBe(50)

    worker?.emit({
      type: 'audio',
      requestId: 1,
      audio: { arrayBuffer: async () => new ArrayBuffer(8) },
    })
    await flushPromises()

    const audio = MockAudio.instances[0]
    expect(audio?.playbackRate).toBe(1.2)
    expect(audio?.preservesPitch).toBe(true)
    expect(audio?.play).toHaveBeenCalledTimes(2)
    expect(api.speaking.value).toBe(true)

    audio?.onended?.()
    expect(api.speaking.value).toBe(false)
    wrapper.unmount()
  })

  it('ignores stale audio and exposes worker errors', async () => {
    const { api, wrapper } = mountComposable()
    await api.speak('first')
    await api.speak('second')

    const worker = MockWorker.instances[0]
    worker?.emit({
      type: 'audio',
      requestId: 1,
      audio: { arrayBuffer: async () => new ArrayBuffer(8) },
    })
    worker?.emit({ type: 'error', requestId: 2, message: 'model unavailable' })
    await flushPromises()

    expect(MockAudio.instances).toHaveLength(1)
    expect(MockAudio.instances[0]?.play).toHaveBeenCalledOnce()
    expect(api.ttsError.value).toContain('model unavailable')
    wrapper.unmount()
  })

  it('stops current playback and terminates the worker on unmount', async () => {
    const { api, wrapper } = mountComposable()
    await api.speak('one')
    const worker = MockWorker.instances[0]
    worker?.emit({
      type: 'audio',
      requestId: 1,
      audio: { arrayBuffer: async () => new ArrayBuffer(8) },
    })
    await flushPromises()

    const audio = MockAudio.instances[0]
    const pauseCallsBeforeStop = audio?.pause.mock.calls.length ?? 0
    api.stop()
    expect(audio?.pause).toHaveBeenCalledTimes(pauseCallsBeforeStop + 1)

    wrapper.unmount()
    expect(worker?.terminate).toHaveBeenCalledOnce()
  })

  it('reports worker initialization failures instead of staying busy', async () => {
    vi.stubGlobal(
      'Worker',
      class BrokenWorker {
        constructor() {
          throw new Error('CSP blocked the worker')
        }
      },
    )
    const { api, wrapper } = mountComposable()

    await api.speak('one')

    expect(api.preparing.value).toBe(false)
    expect(api.ttsError.value).toContain('CSP blocked the worker')
    wrapper.unmount()
  })

  it('reports worker runtime errors', async () => {
    const { api, wrapper } = mountComposable()
    await api.speak('one')

    MockWorker.instances[0]?.emitError('worker crashed')

    expect(api.preparing.value).toBe(false)
    expect(api.ttsError.value).toContain('worker crashed')
    wrapper.unmount()
  })

  it('reports media errors that happen after playback starts', async () => {
    const { api, wrapper } = mountComposable()
    await api.speak('one')
    MockWorker.instances[0]?.emit({
      type: 'audio',
      requestId: 1,
      audio: new Blob(['audio']),
    })
    await flushPromises()

    MockAudio.instances[0]?.onerror?.(new Event('error'))

    expect(api.speaking.value).toBe(false)
    expect(api.ttsError.value).toContain('音频播放失败')
    wrapper.unmount()
  })

  it('does not let a stale rejected play stop newer audio', async () => {
    let rejectFirstPlay: ((reason?: unknown) => void) | undefined
    let playCall = 0
    MockAudio.playImplementation = () => {
      playCall += 1
      if (playCall === 2) {
        return new Promise<void>((_resolve, reject) => {
          rejectFirstPlay = reject
        })
      }
      return Promise.resolve()
    }

    const { api, wrapper } = mountComposable()
    await api.speak('first')
    MockWorker.instances[0]?.emit({
      type: 'audio',
      requestId: 1,
      audio: new Blob(['first']),
    })
    await flushPromises()

    await api.speak('second')
    MockWorker.instances[0]?.emit({
      type: 'audio',
      requestId: 2,
      audio: new Blob(['second']),
    })
    await flushPromises()
    const pauseCallsBeforeStaleRejection = MockAudio.instances[0]?.pause.mock.calls.length ?? 0
    rejectFirstPlay?.(new Error('stale autoplay failure'))
    await flushPromises()

    expect(MockAudio.instances).toHaveLength(1)
    expect(MockAudio.instances[0]?.pause).toHaveBeenCalledTimes(pauseCallsBeforeStaleRejection)
    expect(api.speaking.value).toBe(true)
    expect(api.ttsError.value).toBe('')
    wrapper.unmount()
  })
})
