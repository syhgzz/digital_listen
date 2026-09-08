import {
  TtsCanceledError,
  TtsPlaybackBlockedError,
  type TtsEngine,
  type TtsEngineStatus,
  type TtsProgress,
  type TtsSpeakOptions,
} from './types'

const NATURAL_VOICE_KEYWORDS = ['natural', 'neural', 'premium', 'enhanced', 'siri', 'google']
const VOICE_LOAD_TIMEOUT_MS = 3_000

export interface SystemVoiceEntry {
  voiceURI: string
  name: string
  lang: string
}

interface PendingUtterance {
  resolve: () => void
  reject: (error: Error) => void
}

const isSpeechSynthesisAvailable = (): boolean =>
  typeof window !== 'undefined' &&
  'speechSynthesis' in window &&
  'SpeechSynthesisUtterance' in window

const voicePriority = (voice: SpeechSynthesisVoice): number => {
  const name = voice.name.toLowerCase()
  const keywordScore = NATURAL_VOICE_KEYWORDS.some((keyword) => name.includes(keyword)) ? 4 : 0
  const langScore = voice.lang.toLowerCase() === 'en-us' ? 3 : 1
  const defaultScore = voice.default ? 2 : 0
  return keywordScore + langScore + defaultScore
}

/**
 * Operating-system voices, used only as a fallback. Unlike the previous
 * implementation this never selects a non-English voice: on a Chinese or
 * German system the browser default would read English numbers with the wrong
 * phonology, so the engine always picks an `en-*` voice explicitly.
 */
export class SystemEngine implements TtsEngine {
  readonly id = 'system' as const
  readonly label = '系统语音'
  readonly kind = 'system' as const

  private voices: SpeechSynthesisVoice[] = []
  private selectedVoiceURI = ''
  private generation = 0
  private watchdog: number | null = null
  private pending: PendingUtterance | null = null
  private preparing: Promise<void> | null = null

  getStatus(): TtsEngineStatus {
    return isSpeechSynthesisAvailable() ? 'ready' : 'unavailable'
  }

  getVoices(): SystemVoiceEntry[] {
    return this.voices.map((voice) => ({
      voiceURI: voice.voiceURI,
      name: voice.name,
      lang: voice.lang,
    }))
  }

  getSelectedVoiceURI(): string {
    return this.selectedVoiceURI
  }

  setVoiceURI(voiceURI: string): void {
    this.selectedVoiceURI = voiceURI
  }

  async prepare(onProgress?: (progress: TtsProgress) => void): Promise<void> {
    if (!isSpeechSynthesisAvailable()) {
      throw new Error('当前浏览器不支持系统语音合成。')
    }
    if (this.voices.length > 0) {
      return
    }
    if (this.preparing) {
      return this.preparing
    }

    this.preparing = this.loadVoices(onProgress).finally(() => {
      this.preparing = null
    })
    return this.preparing
  }

  private async loadVoices(onProgress?: (progress: TtsProgress) => void): Promise<void> {
    const collect = (): SpeechSynthesisVoice[] =>
      window.speechSynthesis
        .getVoices()
        .filter((voice) => voice.lang.toLowerCase().startsWith('en'))
        .sort((left, right) => {
          const diff = voicePriority(right) - voicePriority(left)
          return diff !== 0 ? diff : left.name.localeCompare(right.name)
        })

    this.voices = collect()
    if (this.voices.length === 0) {
      await new Promise<void>((resolve) => {
        const handler = () => {
          window.clearTimeout(timer)
          window.speechSynthesis.removeEventListener('voiceschanged', handler)
          this.voices = collect()
          resolve()
        }
        const timer = window.setTimeout(() => {
          window.speechSynthesis.removeEventListener('voiceschanged', handler)
          resolve()
        }, VOICE_LOAD_TIMEOUT_MS)
        window.speechSynthesis.addEventListener('voiceschanged', handler)
      })
    }

    if (this.voices.length === 0) {
      throw new Error('当前系统没有可用的英文语音。')
    }
    if (!this.selectedVoiceURI || !this.voices.some((v) => v.voiceURI === this.selectedVoiceURI)) {
      this.selectedVoiceURI = this.voices[0].voiceURI
    }
    onProgress?.({ stage: 'runtime', loaded: 1, total: 1, ratio: 1, message: '系统语音已就绪' })
  }

  async speak(text: string, options: TtsSpeakOptions): Promise<void> {
    const trimmed = text.trim()
    if (!trimmed) {
      throw new Error('朗读文本不能为空。')
    }
    await this.prepare()

    this.cancel()
    const generation = ++this.generation

    const utterance = new SpeechSynthesisUtterance(trimmed)
    utterance.lang = 'en-US'
    utterance.rate = options.rate

    const voice =
      this.voices.find((entry) => entry.voiceURI === this.selectedVoiceURI) ?? this.voices[0]
    if (voice) {
      utterance.voice = voice
      utterance.lang = voice.lang
    }

    await new Promise<void>((resolve, reject) => {
      let settled = false
      const settle = (finish: () => void) => {
        if (settled) {
          return
        }
        settled = true
        if (this.watchdog !== null) {
          window.clearTimeout(this.watchdog)
          this.watchdog = null
        }
        this.pending = null
        finish()
      }

      const pending: PendingUtterance = {
        resolve: () =>
          settle(() => {
            options.onEnd?.()
            resolve()
          }),
        reject: (error) => settle(() => reject(error)),
      }
      this.pending = pending

      utterance.onstart = () => {
        options.onStart?.()
      }
      utterance.onend = () => pending.resolve()
      utterance.onerror = (event) => {
        if (event.error === 'interrupted' || event.error === 'canceled') {
          if (generation !== this.generation) {
            pending.reject(new TtsCanceledError())
            return
          }
          pending.resolve()
          return
        }
        if (event.error === 'not-allowed') {
          pending.reject(new TtsPlaybackBlockedError())
          return
        }
        pending.reject(new Error(`系统语音播放失败：${event.error}`))
      }

      this.watchdog = window.setTimeout(
        () => {
          if (generation === this.generation && !window.speechSynthesis.speaking) {
            pending.resolve()
          }
        },
        Math.max(5_000, trimmed.length * 220),
      )

      window.speechSynthesis.speak(utterance)
    })
  }

  cancel(): void {
    this.generation += 1
    const pending = this.pending
    if (isSpeechSynthesisAvailable()) {
      window.speechSynthesis.cancel()
    }
    pending?.reject(new TtsCanceledError())
  }

  dispose(): void {
    this.cancel()
    this.voices = []
  }
}

export const isSystemEngineSupported = isSpeechSynthesisAvailable
