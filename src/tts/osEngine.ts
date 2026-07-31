import type { TtsEngine } from './engine'

const isSpeechSynthesisAvailable = (): boolean =>
  typeof window !== 'undefined' &&
  'speechSynthesis' in window &&
  'SpeechSynthesisUtterance' in window

const supported = isSpeechSynthesisAvailable()
let currentVoiceURI = ''

export const osEngine: TtsEngine = {
  id: 'os',
  label: '操作系统语音引擎（可选）',

  available() {
    return Promise.resolve(supported)
  },

  async speak(text: string, rate: number) {
    if (!supported) {
      throw new Error('操作系统内部语音引擎不可用。')
    }

    const voices = window.speechSynthesis.getVoices()
    const voice =
      currentVoiceURI === ''
        ? voices.find((v) => v.default)
        : voices.find((v) => v.voiceURI === currentVoiceURI)

    await new Promise<void>((resolve, reject) => {
      const utterance = new SpeechSynthesisUtterance(text)
      utterance.lang = 'en-US'
      if (voice) {
        utterance.voice = voice
      }
      utterance.rate = rate

      utterance.onstart = () => {}
      utterance.onend = () => resolve()
      utterance.onerror = (event) => {
        if (event.error === 'interrupted' || event.error === 'canceled') {
          resolve()
          return
        }
        reject(new Error(`操作系统语音播放失败：${event.error}`))
      }

      window.speechSynthesis.speak(utterance)
    })
  },

  stop() {
    if (supported) {
      window.speechSynthesis.cancel()
    }
  },
}

export const setOsVoiceURI = (voiceURI: string) => {
  currentVoiceURI = voiceURI
}
