// Copy WASM runtime files from node_modules into public/wasm/ so the app is
// fully self-hosted (onnxruntime-web dynamically imports its .mjs loader,
// which only works same-origin). Runs automatically via `npm run postinstall`.
import { copyFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

const files = [
  // onnxruntime-web WASM backend (dir is used as ort env.wasm.wasmPaths)
  'node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.jsep.mjs',
  'node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.jsep.wasm',
  'node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.mjs',
  'node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm',
  // piper phonemize (espeak-ng data + wasm)
  'node_modules/@diffusionstudio/piper-wasm/build/piper_phonemize.wasm',
  'node_modules/@diffusionstudio/piper-wasm/build/piper_phonemize.data',
]

for (const file of files) {
  const isPiper = file.includes('piper-wasm')
  const dest = join(root, 'public/wasm', isPiper ? 'piper' : 'ort', file.split('/').pop())
  mkdirSync(dirname(dest), { recursive: true })
  copyFileSync(join(root, file), dest)
  console.log(`copied ${file} -> ${dest}`)
}
