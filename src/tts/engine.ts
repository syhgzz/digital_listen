import type { SpeechRatePreset } from '../types/practice'

export const speechRateByPreset: Record<SpeechRatePreset, number> = {
  normal: 1,
  slightlyFast: 1.2,
  fastest: 1.4,
}

export interface TtsEngine {
  readonly id: string
  readonly label: string
  available(): Promise<boolean>
  speak(text: string, rate: number): Promise<void>
  stop(): void
}

export class WavPlayer {
  private context: AudioContext | null = null
  private currentSource: AudioBufferSourceNode | null = null
  private generation = 0

  private getContext(): AudioContext {
    if (!this.context) {
      this.context = new AudioContext()
    }
    return this.context
  }

  async play(wavBytes: ArrayBuffer, rate: number): Promise<void> {
    const gen = ++this.generation
    const context = this.getContext()
    if (context.state === 'suspended') {
      await context.resume()
    }

    const audioBuffer = await context.decodeAudioData(wavBytes)
    if (gen !== this.generation) {
      return
    }

    const source = context.createBufferSource()
    source.buffer = audioBuffer
    source.playbackRate.value = rate
    source.connect(context.destination)
    this.currentSource = source

    await new Promise<void>((resolve) => {
      source.onended = () => {
        if (gen === this.generation) {
          this.currentSource = null
        }
        resolve()
      }
      source.start()
    })
  }

  stop() {
    this.generation += 1
    this.currentSource?.stop()
    this.currentSource = null
  }
}
