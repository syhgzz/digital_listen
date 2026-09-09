import {
  TtsCanceledError,
  type TtsEngine,
  type TtsEngineStatus,
  type TtsProgress,
  type TtsSpeakOptions,
} from './types'

export interface RemoteEngineOptions {
  endpoint?: string
  timeoutMs?: number
}

const DEFAULT_TIMEOUT_MS = 10_000

/**
 * Optional HTTP engine (a self-hosted Piper server, for example). It is only
 * registered when `VITE_REMOTE_TTS_ENDPOINT` is configured, so the default
 * setup never depends on the network.
 */
export class RemoteEngine implements TtsEngine {
  readonly id = 'remote' as const
  readonly label = '在线语音'

  private readonly endpoint: string
  private readonly timeoutMs: number
  private controller: AbortController | null = null
  private status: TtsEngineStatus

  constructor(options: RemoteEngineOptions = {}) {
    this.endpoint = options.endpoint?.trim() ?? ''
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
    this.status = this.endpoint ? 'ready' : 'unavailable'
  }

  isConfigured(): boolean {
    return this.endpoint.length > 0
  }

  getStatus(): TtsEngineStatus {
    return this.status
  }

  async prepare(onProgress?: (progress: TtsProgress) => void): Promise<void> {
    if (!this.endpoint) {
      throw new Error('在线语音引擎未配置 endpoint。')
    }
    this.status = 'ready'
    onProgress?.({ stage: 'runtime', loaded: 1, total: 1, ratio: 1, message: '在线语音已就绪' })
  }

  async speak(text: string, options: TtsSpeakOptions): Promise<void> {
    const trimmed = text.trim()
    if (!trimmed) {
      throw new Error('朗读文本不能为空。')
    }
    if (!this.endpoint) {
      throw new Error('在线语音引擎未配置 endpoint。')
    }

    this.cancel()
    const controller = new AbortController()
    this.controller = controller
    const timeout = window.setTimeout(() => controller.abort(), this.timeoutMs)

    try {
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: trimmed, lang: 'en-US', rate: options.rate }),
        signal: controller.signal,
      })
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }
      this.status = 'ready'
    } catch (error) {
      this.status = 'error'
      if (controller.signal.aborted) {
        throw new TtsCanceledError('在线语音引擎请求已取消。')
      }
      throw error instanceof Error ? error : new Error('在线语音引擎请求失败。')
    } finally {
      window.clearTimeout(timeout)
      if (this.controller === controller) {
        this.controller = null
      }
    }
  }

  cancel(): void {
    this.controller?.abort()
    this.controller = null
  }

  dispose(): void {
    this.cancel()
  }
}
