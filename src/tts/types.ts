export type TtsEngineId = 'piper' | 'remote' | 'system'
export type TtsEngineKind = 'local' | 'online' | 'system'
export type TtsEngineStatus = 'unavailable' | 'idle' | 'preparing' | 'ready' | 'error'
export type TtsProgressStage = 'runtime' | 'voice' | 'model' | 'synthesis'

export interface TtsProgress {
  stage: TtsProgressStage
  loaded: number
  total: number
  ratio: number
  message: string
}

export interface TtsSpeakOptions {
  rate: number
  onStart?: () => void
  onEnd?: () => void
}

export interface TtsEngine {
  readonly id: TtsEngineId
  readonly label: string
  readonly kind: TtsEngineKind
  getStatus(): TtsEngineStatus
  prepare(onProgress?: (progress: TtsProgress) => void): Promise<void>
  speak(text: string, options: TtsSpeakOptions): Promise<void>
  cancel(): void
  dispose(): void
}

/** A selectable voice entry shown in the UI. */
export interface TtsVoiceOption {
  /** Unique value bound to the `<select>`; `${engineId}:${voiceId}` or `auto`. */
  key: string
  engineId: TtsEngineId
  voiceId?: string
  label: string
  group: string
  available: boolean
}

export const AUTO_VOICE_KEY = 'auto'

/** Raised when the browser refused playback because no user gesture happened yet. */
export class TtsPlaybackBlockedError extends Error {
  constructor(message = '浏览器阻止了自动播放，请先与页面交互。') {
    super(message)
    this.name = 'TtsPlaybackBlockedError'
  }
}

export const isPlaybackBlockedError = (error: unknown): boolean =>
  error instanceof TtsPlaybackBlockedError ||
  (error instanceof Error && error.name === 'NotAllowedError')

/** Raised when a newer speak request superseded the one in flight. */
export class TtsCanceledError extends Error {
  constructor(message = '朗读已被取消。') {
    super(message)
    this.name = 'TtsCanceledError'
  }
}

export const isCanceledError = (error: unknown): boolean =>
  error instanceof TtsCanceledError || (error instanceof Error && error.name === 'AbortError')
