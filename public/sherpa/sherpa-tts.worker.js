const ENGINE_BASE = '/sherpa/'

let tts = null
let pendingGenerateRequests = []

self.Module = {
  locateFile: (path) => ENGINE_BASE + path,
  setStatus: (status) => {
    self.postMessage({ type: 'status', status: String(status ?? '') })
  },
  onRuntimeInitialized: () => {
    self.postMessage({ type: 'status', status: 'Initializing TTS model...' })
    try {
      tts = createOfflineTts(self.Module)
      const queued = pendingGenerateRequests
      pendingGenerateRequests = []
      self.postMessage({ type: 'ready' })
      for (const message of queued) {
        handleGenerate(message)
      }
    } catch (error) {
      tts = null
      self.postMessage({ type: 'error', message: engineErrorMessage(error) })
    }
  },
}

function engineErrorMessage(error) {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : JSON.stringify(error)
  return `Local TTS engine error: ${message}. Ensure "npm run setup:tts" has been run so public/sherpa files exist.`
}

function handleGenerate(message) {
  if (!tts) {
    if (message) {
      pendingGenerateRequests.push(message)
    }
    return
  }

  const { text, speed, id } = message
  let audio
  try {
    audio = tts.generate({ text, sid: 0, speed: Number(speed) || 1 })
  } catch (error) {
    self.postMessage({ type: 'generate-error', id, message: engineErrorMessage(error) })
    return
  }

  const samples = audio.samples
  self.postMessage(
    { type: 'audio', id, sampleRate: audio.sampleRate, samples },
    [samples.buffer],
  )
}

self.onmessage = (event) => {
  const message = event.data
  if (!message) {
    return
  }
  if (message.type === 'generate') {
    handleGenerate(message)
  }
}

self.onerror = () => {
  self.postMessage({
    type: 'error',
    message:
      'Failed to initialize the local TTS engine worker. Run "npm run setup:tts" and check that public/sherpa/ contains the engine files.',
  })
}

importScripts('sherpa-onnx-tts.js', 'sherpa-onnx-wasm-main-tts.js')
