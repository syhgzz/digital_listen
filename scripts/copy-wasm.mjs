import { copyFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const files = [
  'node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.jsep.mjs',
  'node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.jsep.wasm',
  'node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.mjs',
  'node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm',
  'node_modules/@diffusionstudio/piper-wasm/build/piper_phonemize.data',
  'node_modules/@diffusionstudio/piper-wasm/build/piper_phonemize.wasm',
]

for (const file of files) {
  const destinationGroup = file.includes('piper-wasm') ? 'piper' : 'ort'
  const destination = join(root, 'public/wasm', destinationGroup, file.split('/').at(-1))
  mkdirSync(dirname(destination), { recursive: true })
  copyFileSync(join(root, file), destination)
}
