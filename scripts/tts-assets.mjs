#!/usr/bin/env node
/**
 * Provisions the local (self-hosted) TTS assets into `public/tts`:
 *
 *   node scripts/tts-assets.mjs --runtime                 copy the Piper WASM runtime from node_modules
 *                                                        (and trim the phonemize data to English)
 *   node scripts/tts-assets.mjs --runtime --full-phonemize keep the untrimmed phonemize data
 *   node scripts/tts-assets.mjs --defaults                download the default English voice set (~360MB)
 *   node scripts/tts-assets.mjs --voice en_US-amy-medium  download one voice (repeatable)
 *   node scripts/tts-assets.mjs --voices a,b,c            download an explicit voice list
 *   node scripts/tts-assets.mjs                           runtime + default voices (npm run tts:setup)
 *
 * Everything lands in `public/tts` which is gitignored. The manifest is always
 * rebuilt by scanning the directory, so adding or removing a voice keeps the
 * list served to the frontend in sync.
 */
import { mkdir, readFile, readdir, rm, stat, writeFile, copyFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const ttsRoot = path.join(projectRoot, 'public', 'tts')

/** Default English voice set (~60MB each). Trim or extend with --voices. */
const DEFAULT_VOICES = [
  'en_US-lessac-medium',
  'en_US-hfc_female-medium',
  'en_US-hfc_male-medium',
  'en_US-ryan-medium',
  'en_GB-jenny_dioco-medium',
  'en_GB-alan-medium',
]

/** Friendly labels shown in the UI; unknown ids fall back to the voice id. */
const VOICE_LABELS = {
  'en_US-lessac-medium': 'Lessac（美音·女声）',
  'en_US-hfc_female-medium': 'HFC Female（美音·女声）',
  'en_US-hfc_male-medium': 'HFC Male（美音·男声）',
  'en_US-ryan-medium': 'Ryan（美音·男声）',
  'en_US-amy-medium': 'Amy（美音·女声）',
  'en_GB-jenny_dioco-medium': 'Jenny（英音·女声）',
  'en_GB-alan-medium': 'Alan（英音·男声）',
}

/** Mirror the browser tries first; written into the manifest for the frontend. */
const MIRROR_BASE =
  process.env.VITE_TTS_MIRROR_BASE ?? 'https://hf-mirror.com/diffusionstudio/piper-voices/resolve/main'

const MODEL_BASES = [
  process.env.VITE_TTS_MODEL_BASE,
  MIRROR_BASE,
  'https://huggingface.co/diffusionstudio/piper-voices/resolve/main',
  'https://hf-mirror.com/diffusionstudio/piper-voices/resolve/main',
].filter((base, index, list) => typeof base === 'string' && base.length > 0 && list.indexOf(base) === index)

/** Piper voice repository layout: <language>/<locale>/<name>/<quality>/<voiceId>.onnx */
const voiceRepositoryPath = (voiceId) => {
  const [locale, name, quality] = voiceId.split('-')
  const language = locale.split('_')[0]
  return `${language}/${locale}/${name}/${quality}/${voiceId}`
}

const args = process.argv.slice(2)
const wantRuntime = args.includes('--runtime') || args.length === 0
let voices = []
let voicesExplicit = false
for (let index = 0; index < args.length; index += 1) {
  if (args[index] === '--voice' || args[index] === '--voices') {
    const value = args[index + 1]
    if (!value) {
      throw new Error('--voice/--voices 需要提供音色 id，例如 --voice en_US-amy-medium')
    }
    voices.push(...value.split(',').map((id) => id.trim()).filter(Boolean))
    voicesExplicit = true
    index += 1
  }
}
// A bare invocation provisions everything; `--runtime` alone never downloads a
// 60MB model behind the user's back (predev/prebuild use that form).
if (!voicesExplicit && (args.length === 0 || args.includes('--defaults'))) {
  voices.push(...DEFAULT_VOICES)
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

  await prunePhonemizeData()
}

/**
 * Trims the Emscripten file package down to English.
 *
 * `piper_phonemize.data` ships espeak-ng dictionaries for ~110 languages and is
 * 18MB, but the app only ever speaks English, which needs `en_dict` alone
 * (163KB). Every other entry - the core phoneme tables plus all language and
 * voice definition files - is kept, so voice lookups still work; only the
 * unused dictionaries are dropped. The file the browser downloads shrinks from
 * 18MB to ~0.9MB, which matters because it is served from the app origin and
 * that is usually the slowest hop.
 *
 * Escape hatch: `TTS_FULL_PHONEMIZE=1` (or `--full-phonemize`) keeps the
 * original package, needed if a non-English voice is ever added.
 */
const prunePhonemizeData = async () => {
  if (process.env.TTS_FULL_PHONEMIZE === '1' || args.includes('--full-phonemize')) {
    log('  音素数据保持全量（TTS_FULL_PHONEMIZE=1）')
    return
  }

  const jsPath = path.join(ttsRoot, 'piper', 'piper_phonemize.js')
  const dataPath = path.join(ttsRoot, 'piper', 'piper_phonemize.data')
  const source = await readFile(jsPath, 'utf8')

  const filesKey = '"files":['
  const filesKeyIndex = source.indexOf(filesKey)
  if (filesKeyIndex < 0) {
    throw new Error('piper_phonemize.js 中未找到 loadPackage 的文件清单。')
  }
  const arrayOpen = filesKeyIndex + filesKey.length - 1
  const arrayEnd = findArrayEnd(source, arrayOpen + 1)
  if (arrayEnd < 0) {
    throw new Error('piper_phonemize.js 的文件清单格式无法解析。')
  }

  const files = JSON.parse(source.slice(arrayOpen, arrayEnd))
  const kept = files.filter(
    (entry) => !entry.filename.endsWith('_dict') || entry.filename.endsWith('/en_dict'),
  )
  if (kept.length === files.length) {
    log('  音素数据无需裁剪')
    return
  }

  const data = await readFile(dataPath)
  const chunks = []
  let offset = 0
  const nextFiles = kept.map((entry) => {
    const start = offset
    const end = start + (entry.end - entry.start)
    chunks.push(data.subarray(entry.start, entry.end))
    offset = end
    return { filename: entry.filename, start, end }
  })

  await writeFile(dataPath, Buffer.concat(chunks))
  const tail = source
    .slice(arrayEnd)
    .replace(/("remote_package_size"\s*:\s*)\d+/, `$1${offset}`)
  await writeFile(jsPath, `${source.slice(0, arrayOpen)}${JSON.stringify(nextFiles)}${tail}`)

  log(
    `  音素数据已裁剪：${(data.length / 1048576).toFixed(1)}MB → ${(offset / 1048576).toFixed(1)}MB` +
      `（保留 ${kept.length}/${files.length} 个文件，仅去掉非英文词典）`,
  )
}

/** Index just past the `]` matching the `[` that opened the array at `start`. */
const findArrayEnd = (text, start) => {
  // `start` is the first character *inside* the array, so the opening bracket
  // is already counted.
  let depth = 1
  for (let index = start; index < text.length; index += 1) {
    const char = text[index]
    if (char === '"') {
      index += 1
      while (index < text.length && text[index] !== '"') {
        if (text[index] === '\\') {
          index += 1
        }
        index += 1
      }
      continue
    }
    if (char === '[') {
      depth += 1
    } else if (char === ']') {
      depth -= 1
      if (depth === 0) {
        return index + 1
      }
    }
  }
  return -1
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
}

/**
 * Rebuilds manifest.json by scanning the voices directory, so the list the
 * frontend sees always matches what is actually provisioned on disk.
 */
const rebuildManifest = async () => {
  const voicesDir = path.join(ttsRoot, 'voices')
  const modelFiles = (await readdir(voicesDir).catch(() => []))
    .filter((file) => file.endsWith('.onnx'))
    .sort()

  const entries = []
  for (const modelFile of modelFiles) {
    const id = modelFile.replace(/\.onnx$/, '')
    const configFile = `${modelFile}.json`
    let sampleRate = 22050
    try {
      const config = JSON.parse(await readFile(path.join(voicesDir, configFile), 'utf8'))
      sampleRate = config?.audio?.sample_rate ?? 22050
    } catch {
      // Missing or unreadable config: keep the default sample rate.
    }

    entries.push({
      id,
      label: VOICE_LABELS[id] ?? id,
      name: id.split('-')[1] ?? id,
      language: (id.split('-')[0] ?? '').replace('_', '-'),
      quality: id.split('-')[2] ?? 'medium',
      sizeBytes: await fileSize(path.join(voicesDir, modelFile)),
      modelFile,
      configFile,
      repoPath: voiceRepositoryPath(id),
      sampleRate,
    })
  }

  const manifest = {
    generatedAt: new Date().toISOString(),
    mirrorBase: MIRROR_BASE,
    voices: entries,
  }
  await writeFile(
    path.join(voicesDir, 'manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8',
  )
  log(`  已写入 manifest.json（${entries.length} 个音色）`)
  return entries
}

const main = async () => {
  log('准备本地语音资源…')
  await mkdir(ttsRoot, { recursive: true })

  if (wantRuntime) {
    await copyRuntimeAssets()
  }

  if (voices.length > 0) {
    for (const voiceId of voices) {
      log(`准备音色 ${voiceId}`)
      await downloadVoice(voiceId)
    }
    const entries = await rebuildManifest()
    const totalMb = entries.reduce((sum, entry) => sum + entry.sizeBytes, 0) / 1_048_576
    log(`  当前共 ${entries.length} 个音色，合计 ${totalMb.toFixed(0)}MB`)
  } else {
    const present = (await readdir(path.join(ttsRoot, 'voices')).catch(() => [])).filter((file) =>
      file.endsWith('.onnx'),
    )
    if (present.length === 0) {
      log('提示：尚未准备本地语音模型，请运行 npm run tts:setup（约 360MB，只需一次）。')
    } else {
      await rebuildManifest()
    }
  }

  log('完成。')
}

main().catch((error) => {
  console.error(`\n语音资源准备失败：${error.message}`)
  process.exitCode = 1
})
