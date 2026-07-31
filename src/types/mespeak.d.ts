declare module 'mespeak' {
  export interface MeSpeak {
    loadConfig(json: unknown): void
    loadVoice(json: unknown): void
    setDefaultVoice(id: string): void
    getDefaultVoice(): string
    setVolume(volume: number): void
    getVolume(): number
    isConfigLoaded(): boolean
    isVoiceLoaded(): boolean
    resetQueue(): void
    canPlay(): boolean
    stop(): void
    speak(
      text: string,
      options?: {
        amplitude?: number
        pitch?: number
        speed?: number
        voice?: string
        wordgap?: number
        volume?: number
        rawdata?: string
      },
    ): number[] | Uint8Array | ArrayBuffer | null
  }

  const meSpeak: MeSpeak
  export default meSpeak
}

declare module 'mespeak/src/mespeak_config.json' {
  const value: unknown
  export default value
}

declare module 'mespeak/voices/en/en-us.json' {
  const value: unknown
  export default value
}

