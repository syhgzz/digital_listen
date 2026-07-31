import type { TtsEngine } from './engine'
import { WavPlayer } from './engine'

export const PIPER_VOICE = 'en_US-lessac-medium'

const modelBase = `${import.meta.env.BASE_URL}models/piper/`
const onnxBase = `${import.meta.env.BASE_URL}onnx/`
const phonemizeBase = `${import.meta.env.BASE_URL}piper/`

const modelJsonUrl = `${modelBase}en/en_US/lessac/medium/${PIPER_VOICE}.onnx.json`

const wavPlayer = new WavPlayer()

let engineModule: typeof import('piper-tts-web') | null = null
let engine: InstanceType<typeof import('piper-tts-web').PiperWebEngine> | null = null
let availability: boolean | null = null

const checkAvailability = async (): Promise<boolean> => {
  if (availability !== null) {
    return availability
  }
  try {
    const response = await fetch(modelJsonUrl, { method: 'HEAD' })
    if (!response.ok) {
      availability = false
      return false
    }
    const contentType = response.headers.get('content-type') ?? ''
    availability = !contentType.includes('text/html')
  } catch {
    availability = false
  }
  return availability
}

export const piperEngine: TtsEngine = {
  id: 'piper',
  label: `Piper 神经语音（${PIPER_VOICE} · 需先下载模型）`,

  available: checkAvailability,

  async speak(text: string, rate: number) {
    if (!(await checkAvailability())) {
      throw new Error('Piper 语音模型未下载，请先运行 npm run models 下载模型。')
    }

    if (!engineModule) {
      engineModule = await import('piper-tts-web')
    }
    if (!engine) {
      const { OnnxWebWorkerRuntime, PhonemizeWebWorkerRuntime, PiperWebWorkerEngine, RemoteVoiceProvider } =
        engineModule
      engine = new PiperWebWorkerEngine({
        voiceProvider: new RemoteVoiceProvider({ baseUrl: modelBase }),
        // numThreads=1：ORT 多线程（em-pthread）与 piper-tts-web 的 worker
        // RPC 消息处理器冲突，单线程模式稳定且无需 WebGPU。
        onnxRuntime: new OnnxWebWorkerRuntime({ basePath: onnxBase, numThreads: 1 }),
        phonemizeRuntime: new PhonemizeWebWorkerRuntime({ basePath: phonemizeBase }),
      })
    }

    const { file } = await engine.generate(text, PIPER_VOICE, 0)
    const wavBytes = await file.arrayBuffer()
    await wavPlayer.play(wavBytes, rate)
  },

  stop() {
    wavPlayer.stop()
  },
}
