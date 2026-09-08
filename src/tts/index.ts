import { PiperEngine, type PiperEngineOptions } from './piperEngine'
import { RemoteEngine } from './remoteEngine'
import { SystemEngine } from './systemEngine'
import type { TtsEngine } from './types'

export interface TtsEngines {
  piper: PiperEngine
  remote: RemoteEngine
  system: SystemEngine
  /** Ordered fallback chain: local neural voice first, then optional remote, then OS voices. */
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
  const system = new SystemEngine()

  const chain: TtsEngine[] = [piper]
  if (remote.isConfigured() || parseBooleanFlag(import.meta.env.VITE_REMOTE_TTS_ENABLED)) {
    chain.push(remote)
  }
  chain.push(system)

  return { piper, remote, system, chain }
}

export * from './types'
export { PiperEngine } from './piperEngine'
export { RemoteEngine } from './remoteEngine'
export { SystemEngine, isSystemEngineSupported } from './systemEngine'
