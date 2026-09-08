#!/usr/bin/env node
/**
 * Provisions the local (self-hosted) TTS assets into `public/tts`:
 *
 *   node scripts/tts-assets.mjs --runtime            copy ORT + Piper WASM from node_modules
 *   node scripts/tts-assets.mjs --voice <id> [...]   download one or more Piper voices
 *   node scripts/tts-assets.mjs --runtime --voice en_US-lessac-medium   (npm run tts:setup)
 *
 * Everything lands in `public/tts` which is gitignored: a fresh clone runs
 * `npm install` (runtime assets are copied automatically) and one explicit
 * `npm run tts:setup` to fetch the ~60MB voice model. After that the app is
 * fully offline and every browser uses exactly the same voice.
 */
import { createHash } from 'node:crypto'
import { mkdir, readFile, readdir, rm, stat, writeFile, copyFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const ttsRoot = path.join(projectRoot, 'public', 'tts')

const DEFAULT_VOICE = 'en_US-lessac-medium'

const MODEL_BASES = [
  process.env.VITE_TTS_MODEL_BASE,
  'https://huggingface.co/diffusionstudio/piper-voices/resolve/main',
  'https://hf-mirror.com/diffusionstudio/piper-voices/resolve/main',
].filter((base) => typeof base === 'string' && base.length > 0)

/** Piper voice repository layout: <language>/<locale>/<name>/<quality>/<voiceId>.onnx */
const voiceRepositoryPath = (voiceId) => {
  const [locale, name, quality] = voiceId.split('-')
  const language = locale.split('_')[0]
  return `${language}/${locale}/${name}/${quality}/${voiceId}`
}

const args = process.argv.slice(2)
const wantRuntime = args.includes('--runtime') || args.length === 0
const voices = []
for (let index = 0; index < args.length; index += 1) {
  if (args[index] === '--voice') {
    const value = args[index + 1]
    if (!value) {
      throw new Error('--voice 需要提供音色 id，例如 --voice en_US-lessac-medium')
    }
    voices.push(value)
    index += 1
  }
}
// A bare invocation provisions everything; `--runtime` alone never downloads a
// 60MB model behind the user's back (predev/prebuild use that form).
if (voices.length === 0 && args.length === 0) {
  voices.push(DEFAULT_VOICE)
}

const log = (message) => process.stdout.write(`${message}\n`)

const copyRuntimeAssets = async () => {
  const piperSource = path.join(
    projectRoot,
    'node_modules',
    '@diffusionstudio',
    'piper-wasm',
    'build',
  )
  const piperTarget = path.join(ttsRoot, 'piper')

  await mkdir(piperTarget, { recursive: true })

  // ONNX Runtime's wasm assets are resolved by the bundler (Vite emits them
  // into dist/assets), so only the Piper phonemizer needs a public/ copy: it is
  // loaded as a classic script, not as a module.
  const files = [
    [path.join(piperSource, 'piper_phonemize.js'), path.join(piperTarget, 'piper_phonemize.js')],
    [path.join(piperSource, 'piper_phonemize.wasm'), path.join(piperTarget, 'piper_phonemize.wasm')],
    [path.join(piperSource, 'piper_phonemize.data'), path.join(piperTarget, 'piper_phonemize.data')],
  ]

  for (const [from, to] of files) {
    try {
      await copyFile(from, to)
      log(`  运行时资源已就绪：${path.relative(projectRoot, to)}`)
    } catch (error) {
      throw new Error(
        `复制 ${path.relative(projectRoot, from)} 失败，请先执行 npm install。\n${error.message}`,
      )
    }
  }
}

const download = async (url, onProgress) => {
  const response = await fetch(url, { redirect: 'follow' })
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`)
  }
  const total = Number(response.headers.get('content-length') ?? 0)
  if (!response.body) {
    return Buffer.from(await response.arrayBuffer())
  }

  const reader = response.body.getReader()
  const chunks = []
  let loaded = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) {
      break
    }
    chunks.push(Buffer.from(value))
    loaded += value.length
    onProgress?.(loaded, total)
  }
  return Buffer.concat(chunks)
}

const withProgress = (label) => {
  let lastPercent = -1
  return (loaded, total) => {
    if (total <= 0) {
      return
    }
    const percent = Math.floor((loaded / total) * 100)
    if (percent !== lastPercent && percent % 10 === 0) {
      lastPercent = percent
      log(`  ${label} ${percent}%`)
    }
  }
}

const fetchFromBases = async (relativePath, onProgress) => {
  const failures = []
  for (const base of MODEL_BASES) {
    const url = `${base}/${relativePath}`
    try {
      log(`  下载 ${url}`)
      return await download(url, onProgress)
    } catch (error) {
      failures.push(`${url} -> ${error.message}`)
    }
  }
  throw new Error(`所有语音镜像均不可用：\n${failures.join('\n')}`)
}

const fileSize = async (filePath) => {
  try {
    return (await stat(filePath)).size
  } catch {
    return 0
  }
}

const downloadVoice = async (voiceId) => {
  const voicesDir = path.join(ttsRoot, 'voices')
  await mkdir(voicesDir, { recursive: true })

  const modelFile = `${voiceId}.onnx`
  const configFile = `${modelFile}.json`
  const modelPath = path.join(voicesDir, modelFile)
  const configPath = path.join(voicesDir, configFile)
  const repositoryPath = voiceRepositoryPath(voiceId)

  const existingSize = await fileSize(modelPath)
  if (existingSize > 1_000_000) {
    log(`  已存在，跳过下载：${modelFile}（${(existingSize / 1_048_576).toFixed(1)}MB）`)
  } else {
    const buffer = await fetchFromBases(`${repositoryPath}.onnx`, withProgress(modelFile))
    await writeFile(modelPath, buffer)
    log(`  已保存 ${modelFile}（${(buffer.length / 1_048_576).toFixed(1)}MB）`)
  }

  if ((await fileSize(configPath)) === 0) {
    const buffer = await fetchFromBases(`${repositoryPath}.onnx.json`)
    await writeFile(configPath, buffer)
  }

  const config = JSON.parse(await readFile(configPath, 'utf8'))
  return {
    id: voiceId,
    name: voiceId.split('-')[1] ?? voiceId,
    language: voiceId.split('-')[0].replace('_', '-'),
    quality: voiceId.split('-')[2] ?? 'medium',
    sizeBytes: await fileSize(modelPath),
    modelFile,
    configFile,
    sampleRate: config?.audio?.sample_rate ?? 22050,
    md5: createHash('md5').update(await readFile(modelPath)).digest('hex'),
  }
}

const writeManifest = async (entries) => {
  const voicesDir = path.join(ttsRoot, 'voices')
  const existing = await readdir(voicesDir).catch(() => [])
  const onDisk = new Set(existing.filter((file) => file.endsWith('.onnx')))

  const manifest = {
    generatedAt: new Date().toISOString(),
    voices: entries
      .filter((entry) => onDisk.has(entry.modelFile))
      .map(({ sampleRate, md5, ...voice }) => ({ ...voice, sampleRate, md5 })),
  }
  await writeFile(
    path.join(voicesDir, 'manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8',
  )
  log(`  已写入 manifest.json（${manifest.voices.length} 个音色）`)
}

const main = async () => {
  log('准备本地语音资源…')
  await mkdir(ttsRoot, { recursive: true })

  if (wantRuntime) {
    await copyRuntimeAssets()
  }

  if (voices.length > 0) {
    const entries = []
    for (const voiceId of voices) {
      log(`准备音色 ${voiceId}`)
      entries.push(await downloadVoice(voiceId))
    }
    await writeManifest(entries)
  } else {
    const voicesDir = path.join(ttsRoot, 'voices')
    const present = (await readdir(voicesDir).catch(() => [])).filter((file) =>
      file.endsWith('.onnx'),
    )
    if (present.length === 0) {
      log('提示：尚未准备本地语音模型，请运行 npm run tts:setup（约 60MB，只需一次）。')
    }
  }

  log('完成。')
}

main().catch(async (error) => {
  if (error instanceof Error && error.message.startsWith('所有语音镜像')) {
    await rm(path.join(ttsRoot, 'voices'), { recursive: true, force: true })
  }
  console.error(`\n语音资源准备失败：${error.message}`)
  process.exitCode = 1
})
