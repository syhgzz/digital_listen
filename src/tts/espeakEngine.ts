import type { TtsEngine } from './engine'
import { WavPlayer } from './engine'

const DEFAULT_SPEED_WPM = 175

const wavPlayer = new WavPlayer()

type MeSpeakModule = typeof import('mespeak')
let meSpeakModule: MeSpeakModule | null = null
let meSpeak: MeSpeakModule['default'] | null = null
let meSpeakConfig: unknown = null
let enUsVoice: unknown = null

const ensureVoiceLoaded = async () => {
  if (!meSpeakModule) {
    meSpeakModule = await import('mespeak')
    meSpeak = meSpeakModule.default
  }
  if (!meSpeakConfig) {
    meSpeakConfig = (await import('mespeak/src/mespeak_config.json')).default
  }
  if (!enUsVoice) {
    enUsVoice = (await import('mespeak/voices/en/en-us.json')).default
  }
  if (!meSpeak) {
    throw new Error('eSpeak 引擎初始化失败。')
  }
  if (!meSpeak.isConfigLoaded()) {
    meSpeak.loadConfig(meSpeakConfig)
  }
  if (!meSpeak.isVoiceLoaded()) {
    meSpeak.loadVoice(enUsVoice)
  }
}

export const espeakEngine: TtsEngine = {
  id: 'espeak',
  label: 'eSpeak 开源引擎（内置 · 最稳定）',

  available() {
    return Promise.resolve(true)
  },

  async speak(text: string, rate: number) {
    await ensureVoiceLoaded()

    const result = meSpeak?.speak(text, {
      speed: DEFAULT_SPEED_WPM,
      pitch: 50,
      rawdata: 'array',
    })

    if (!result) {
      throw new Error('eSpeak 引擎合成失败。')
    }

    const bytes = Array.isArray(result)
      ? Uint8Array.from(result)
      : result instanceof Uint8Array
        ? result
        : new Uint8Array(result)
    const wavBytes = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    ) as ArrayBuffer
    await wavPlayer.play(wavBytes, rate)
  },

  stop() {
    meSpeak?.resetQueue()
    wavPlayer.stop()
  },
}
