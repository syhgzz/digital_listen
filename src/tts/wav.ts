/**
 * Converts the mono Float32 PCM buffer produced by the Piper/VITS model into a
 * playable 16-bit PCM WAV blob.
 */
export const floatPcmToWavBlob = (samples: Float32Array, sampleRate: number): Blob => {
  const headerLength = 44
  const view = new DataView(new ArrayBuffer(samples.length * 2 + headerLength))

  view.setUint32(0, 0x46464952, true) // "RIFF"
  view.setUint32(4, view.buffer.byteLength - 8, true)
  view.setUint32(8, 0x45564157, true) // "WAVE"
  view.setUint32(12, 0x20746d66, true) // "fmt "
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, 1, true) // mono
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  view.setUint32(36, 0x61746164, true) // "data"
  view.setUint32(40, samples.length * 2, true)

  let offset = headerLength
  for (let index = 0; index < samples.length; index += 1) {
    const sample = samples[index]
    const clamped = sample >= 1 ? 1 : sample <= -1 ? -1 : sample
    view.setInt16(offset, Math.round(clamped * 32767), true)
    offset += 2
  }

  return new Blob([view.buffer], { type: 'audio/x-wav' })
}

/** Root-mean-square level of a PCM buffer; used by the smoke test to prove audio is not silent. */
export const pcmRms = (samples: Float32Array): number => {
  if (samples.length === 0) {
    return 0
  }
  let sum = 0
  for (let index = 0; index < samples.length; index += 1) {
    sum += samples[index] * samples[index]
  }
  return Math.sqrt(sum / samples.length)
}
