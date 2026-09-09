import { PiperEngine, type PiperEngineOptions } from './piperEngine'
import { RemoteEngine } from './remoteEngine'
import type { TtsEngine } from './types'

export interface TtsEngines {
  piper: PiperEngine
  remote: RemoteEngine
  /** Ordered fallback chain: local neural voice first, then the optional online engine. */
  chain: TtsEngine[]
}

const parseBooleanFlag = (value: string | undefined): boolean =>
  value === '1' || value?.toLowerCase() === 'true'

export const createTtsEngines = (options: PiperEngineOptions = {}): TtsEngines => {
  const piper = new PiperEngine(options)
  const remote = new RemoteEngine({
    endpoint: import.meta.env.VITE_REMOTE_TTS_ENDPOINT,
    timeoutMs: Number(import.meta.env.VITE_REMOTE_TTS_TIMEOUT_MS ?? '') || undefined,
  })

  const chain: TtsEngine[] = [piper]
  if (remote.isConfigured() || parseBooleanFlag(import.meta.env.VITE_REMOTE_TTS_ENABLED)) {
    chain.push(remote)
  }

  return { piper, remote, chain }
}

export * from './types'
export { PiperEngine } from './piperEngine'
export { RemoteEngine } from './remoteEngine'
