declare module 'piper-tts-web' {
  export class FetchProvider {
    fetch(url: string): Promise<unknown>
    destroy(): void
  }

  export class RemoteVoiceProvider {
    constructor(options?: { provider?: FetchProvider; baseUrl?: string; separator?: string })
    list(): Promise<unknown>
    fetch(voice: string): Promise<[Record<string, unknown>, string]>
    destroy(): void
  }

  export class HuggingFaceVoiceProvider extends RemoteVoiceProvider {}

  export class OnnxWebRuntime {
    constructor(options?: { ort?: unknown; basePath?: string; numThreads?: number })
    destroy(): void
  }

  export class OnnxWebGPUWorkerRuntime extends OnnxWebRuntime {}

  export class OnnxWebWorkerRuntime {
    constructor(options?: { worker?: Worker; basePath?: string; numThreads?: number })
    destroy(): void
  }

  export class PhonemizeWebWorkerRuntime {
    constructor(options?: { provider?: FetchProvider; basePath?: string })
    destroy(): void
  }

  export class ExpressionWebRuntime {
    constructor(options?: { provider?: FetchProvider; basePath?: string })
    destroy(): void
  }

  export interface PiperGenerateResponse {
    phonemeData: {
      phoneme_ids: number[]
      phonemes: string[]
      text: string
    }
    file: Blob
    duration: number
  }

  export class PiperWebEngine {
    constructor(options?: {
      onnxRuntime?: OnnxWebRuntime | OnnxWebWorkerRuntime
      phonemizeRuntime?: PhonemizeWebRuntime | PhonemizeWebWorkerRuntime
      expressionRuntime?: ExpressionWebRuntime
      voiceProvider?: RemoteVoiceProvider
    })
    generate(text: string, voice: string, speaker?: number): Promise<PiperGenerateResponse>
    expressions(phonemeData: unknown, duration?: number): Promise<unknown>
    destroy(): void
  }

  export class PiperWebWorkerEngine extends PiperWebEngine {}
}
