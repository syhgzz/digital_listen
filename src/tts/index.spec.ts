import { afterEach, describe, expect, it, vi } from 'vitest'
import { createTtsEngines } from './index'

const engineIds = () => createTtsEngines().chain.map((engine) => engine.id)

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('createTtsEngines', () => {
  it('never registers a system (OS) voice engine', () => {
    const engines = createTtsEngines()
    expect(engineIds()).not.toContain('system')
    expect(Object.keys(engines).sort()).toEqual(['chain', 'piper', 'remote'])
  })

  it('chains only the local engine when no online endpoint is configured', () => {
    vi.stubEnv('VITE_REMOTE_TTS_ENDPOINT', '')
    vi.stubEnv('VITE_REMOTE_TTS_ENABLED', '')
    expect(engineIds()).toEqual(['piper'])
  })

  it('appends the online engine after the local one when configured', () => {
    vi.stubEnv('VITE_REMOTE_TTS_ENDPOINT', 'http://127.0.0.1:5000/speak')
    vi.stubEnv('VITE_REMOTE_TTS_ENABLED', '')
    expect(engineIds()).toEqual(['piper', 'remote'])
  })
})
