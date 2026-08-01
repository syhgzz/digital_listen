import { TtsSession, download, stored } from '@mintplex-labs/piper-tts-web'
import type { ProgressCallback, VoiceId } from '@mintplex-labs/piper-tts-web'

/**
 * Piper 本地神经语音引擎封装。
 *
 * - 模型（.onnx）首次使用时从 HuggingFace 下载并缓存到浏览器 OPFS，
 *   之后完全离线可用。
 * - ONNX Runtime 与 piper_phonemize 的 WASM 运行时资源已随项目打包在
 *   public/piper/ 下，通过 wasmPaths 指向本地，不依赖第三方 CDN。
 */

export interface PiperVoiceDef {
  voiceId: VoiceId
  name: string
}

// 模型文件（.onnx + .onnx.json）已随项目内置在 public/piper-models/ 下，
// 通过 patches/ 中的补丁使 piper-tts-web 从本地同源路径加载模型，
// 无需外网、无 CORS 问题；首次使用后模型会缓存到浏览器 OPFS。
// 如需改用其他模型源，可用 VITE_PIPER_MODEL_BASE 环境变量覆盖。
export const PIPER_VOICES: PiperVoiceDef[] = [
  { voiceId: 'en_US-lessac-medium', name: 'Piper · Lessac（清晰女声）' },
]

const WASM_PATHS = {
  onnxWasm: '/piper/',
  piperWasm: '/piper/piper_phonemize.wasm',
  piperData: '/piper/piper_phonemize.data',
}

const sessions = new Map<VoiceId, TtsSession>()
const pendingSessions = new Map<VoiceId, Promise<TtsSession>>()

const getSession = (voiceId: VoiceId, onProgress?: ProgressCallback): Promise<TtsSession> => {
  const existing = sessions.get(voiceId)
  if (existing) {
    return Promise.resolve(existing)
  }

  let pending = pendingSessions.get(voiceId)
  if (!pending) {
    pending = TtsSession.create({ voiceId, wasmPaths: WASM_PATHS, progress: onProgress }).then(
      (session) => {
        sessions.set(voiceId, session)
        pendingSessions.delete(voiceId)
        return session
      },
    )
    pendingSessions.set(voiceId, pending)
  }
  return pending
}

/** 合成指定文本，返回 WAV Blob。首次使用会下载模型（可能耗时较长）。 */
export const synthesizePiperSpeech = async (
  voiceId: VoiceId,
  text: string,
  onProgress?: ProgressCallback,
): Promise<Blob> => {
  const session = await getSession(voiceId, onProgress)
  return session.predict(text)
}

/** 后台预下载模型（静默失败，失败不影响主流程）。 */
export const preloadPiperVoice = (voiceId: VoiceId, onProgress?: ProgressCallback): Promise<void> =>
  download(voiceId, onProgress).catch(() => undefined)

/** 查询模型是否已缓存到 OPFS。 */
export const isPiperVoiceStored = (voiceId: VoiceId): Promise<boolean> =>
  stored()
    .then((list) => list.includes(voiceId))
    .catch(() => false)

interface ActivePlayback {
  audio: HTMLAudioElement
  objectUrl: string
}

let activePlayback: ActivePlayback | null = null

/** 停止当前 Piper 音频播放。 */
export const stopPiperPlayback = (): void => {
  if (!activePlayback) {
    return
  }
  const { audio, objectUrl } = activePlayback
  activePlayback = null
  audio.onended = null
  audio.onerror = null
  audio.pause()
  audio.removeAttribute('src')
  audio.load()
  URL.revokeObjectURL(objectUrl)
}

/**
 * 播放 WAV Blob。语速通过 playbackRate 实现（preservesPitch 尽量保持音高）。
 * 返回 Promise，播放结束或出错时 resolve / reject；被 stopPiperPlayback 中断时 resolve。
 */
export const playWavBlob = (blob: Blob, rate: number): Promise<void> => {
  stopPiperPlayback()

  const objectUrl = URL.createObjectURL(blob)
  const audio = new Audio(objectUrl)
  audio.playbackRate = rate
  audio.preservesPitch = true
  ;(audio as unknown as { mozPreservesPitch?: boolean }).mozPreservesPitch = true

  const playback: ActivePlayback = { audio, objectUrl }
  activePlayback = playback

  return new Promise<void>((resolve, reject) => {
    audio.onended = () => {
      if (activePlayback === playback) {
        stopPiperPlayback()
      }
      resolve()
    }
    audio.onerror = () => {
      if (activePlayback === playback) {
        stopPiperPlayback()
      }
      reject(new Error('音频播放失败。'))
    }
    void audio.play().catch((error: unknown) => {
      if (activePlayback === playback) {
        stopPiperPlayback()
      }
      const message = error instanceof Error ? error.message : '未知错误'
      reject(new Error(`音频播放失败：${message}`))
    })
  })
}
