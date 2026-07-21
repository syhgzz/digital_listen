import { cpSync, existsSync, mkdirSync, createWriteStream, rmSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(__dirname, '..')
const piperPkg = join(projectRoot, 'node_modules', 'piper-wasm')
const publicPiper = join(projectRoot, 'public', 'piper')

const MODEL_BASE = 'https://hf-mirror.com/rhasspy/piper-voices/resolve/v1.0.0/en/en_US/amy/medium/'
const MODEL_FILES = ['en_US-amy-medium.onnx', 'en_US-amy-medium.onnx.json']

const ORT_KEEP = new Set([
  'ort.min.js',
  'ort-wasm-simd.wasm',
  'ort-wasm-simd-threaded.wasm',
  'ort-wasm-threaded.wasm',
  'ort-wasm-threaded.js',
  'ort-wasm-threaded.worker.js',
  'ort-wasm.wasm',
])

const log = (msg) => console.log(`[sync-piper] ${msg}`)

const ensureDir = (p) => {
  if (!existsSync(p)) mkdirSync(p, { recursive: true })
}

const copyFile = (from, to) => {
  ensureDir(dirname(to))
  cpSync(from, to)
  log(`copied ${to.replace(publicPiper, '/public/piper')}`)
}

const copyDir = (from, to) => {
  ensureDir(to)
  cpSync(from, to, { recursive: true })
  log(`copied dir ${to.replace(publicPiper, '/public/piper')}`)
}

const copyOrtSubset = () => {
  const srcDir = join(piperPkg, 'build', 'worker', 'dist')
  const dstDir = join(publicPiper, 'dist')
  ensureDir(dstDir)
  for (const name of readdirSync(srcDir)) {
    if (ORT_KEEP.has(name)) {
      cpSync(join(srcDir, name), join(dstDir, name))
      log(`copied ort asset ${name}`)
    }
  }
}

const downloadFile = async (url, destPath) => {
  const resp = await fetch(url, { redirect: 'follow' })
  if (!resp.ok || !resp.body) {
    throw new Error(`下载失败 ${url}: HTTP ${resp.status}`)
  }
  const total = Number(resp.headers.get('content-length') ?? 0)
  ensureDir(dirname(destPath))
  const tmp = `${destPath}.tmp`
  const out = createWriteStream(tmp)
  let loaded = 0
  let lastReport = 0
  for await (const chunk of resp.body) {
    out.write(chunk)
    loaded += chunk.length
    if (total && loaded - lastReport >= 5 * 1024 * 1024) {
      lastReport = loaded
      log(`  下载中 ${Math.round((loaded / total) * 100)}% (${(loaded / 1048576).toFixed(1)}MB / ${(total / 1048576).toFixed(1)}MB)`)
    }
  }
  await new Promise((r, reject) => {
    out.end((err) => (err ? reject(err) : r()))
  })
  cpSync(tmp, destPath)
  rmSync(tmp)
  log(`downloaded ${destPath.replace(publicPiper, '/public/piper')} (${(loaded / 1048576).toFixed(1)}MB)`)
}

const patchWorker = (workerPath) => {
  let src = readFileSync(workerPath, 'utf8')
  const lengthScaleOrig = 'const lengthScale = modelConfig.inference.length_scale;'
  const lengthScaleNew = 'const lengthScale = data.lengthScale ?? modelConfig.inference.length_scale;'
  if (!src.includes(lengthScaleOrig)) {
    throw new Error(`未找到 lengthScale 注入点，worker 源码可能已变化`)
  }
  src = src.replace(lengthScaleOrig, lengthScaleNew)
  const numThreadsOrig = 'ort.env.wasm.numThreads = navigator.hardwareConcurrency;'
  const numThreadsNew = 'ort.env.wasm.numThreads = 1;'
  if (!src.includes(numThreadsOrig)) {
    throw new Error(`未找到 numThreads 注入点，worker 源码可能已变化`)
  }
  src = src.replace(numThreadsOrig, numThreadsNew)

  // onnxruntime-web 的 int64 张量要求数据为 BigInt，而 piper_worker 传入的是普通 number，
  // 会抛出 "Cannot convert 1 to a BigInt"。将 phonemeIds / 长度 / speakerId 转为 BigInt。
  const feedsOrig = `const feeds = {
    input: new ort.Tensor("int64", phonemeIds, [1, phonemeIds.length]),
    input_lengths: new ort.Tensor("int64", [phonemeIds.length]),
    scales: new ort.Tensor("float32", [noiseScale, lengthScale, noiseW])
  };
  if (Object.keys(modelConfig.speaker_id_map).length)
    feeds.sid = new ort.Tensor("int64", [speakerId]);`
  const feedsNew = `const phonemeIdsBig = phonemeIds.map((id) => BigInt(id));
  const feeds = {
    input: new ort.Tensor("int64", phonemeIdsBig, [1, phonemeIds.length]),
    input_lengths: new ort.Tensor("int64", [BigInt(phonemeIds.length)]),
    scales: new ort.Tensor("float32", [noiseScale, lengthScale, noiseW])
  };
  if (Object.keys(modelConfig.speaker_id_map).length)
    feeds.sid = new ort.Tensor("int64", [BigInt(speakerId)]);`
  if (!src.includes(feedsOrig)) {
    throw new Error(`未找到 feeds 注入点，worker 源码可能已变化`)
  }
  src = src.replace(feedsOrig, feedsNew)

  writeFileSync(workerPath, src)
  log(`patched worker (length_scale override + single-thread onnxruntime + BigInt int64)`)
}

const main = async () => {
  if (!existsSync(piperPkg)) {
    throw new Error(`未找到 ${piperPkg}，请先运行 npm install`)
  }

  ensureDir(publicPiper)

  // 1. phonemize 运行时
  copyFile(join(piperPkg, 'build', 'piper_phonemize.js'), join(publicPiper, 'piper_phonemize.js'))
  copyFile(join(piperPkg, 'build', 'piper_phonemize.wasm'), join(publicPiper, 'piper_phonemize.wasm'))
  copyFile(join(piperPkg, 'build', 'piper_phonemize.data'), join(publicPiper, 'piper_phonemize.data'))

  // 2. espeak-ng-data（phonemize.data 已内嵌，但保留 voices/lang 以防万一）
  copyDir(join(piperPkg, 'espeak-ng', 'espeak-ng-data', 'voices'), join(publicPiper, 'espeak-ng-data', 'voices'))
  copyDir(join(piperPkg, 'espeak-ng', 'espeak-ng-data', 'lang'), join(publicPiper, 'espeak-ng-data', 'lang'))

  // 3. onnxruntime-web 子集
  copyOrtSubset()

  // 4. worker（先复制再打补丁）
  const workerPath = join(publicPiper, 'piper_worker.js')
  copyFile(join(piperPkg, 'build', 'worker', 'piper_worker.js'), workerPath)
  patchWorker(workerPath)

  // 5. 语音模型（网络下载，失败不阻断：postinstall 场景下不应破坏 npm install）
  const skipModel = process.argv.includes('--skip-model')
  const voicesDir = join(publicPiper, 'voices')
  ensureDir(voicesDir)
  if (skipModel) {
    log('PIPER_SKIP_MODEL=1，跳过模型下载（仅复制运行时资源）')
  } else {
    for (const name of MODEL_FILES) {
      const dest = join(voicesDir, name)
      if (existsSync(dest)) {
        log(`已存在，跳过下载 ${name}`)
        continue
      }
      try {
        log(`开始下载 ${name} ...`)
        await downloadFile(MODEL_BASE + name, dest)
      } catch (err) {
        log(`⚠️  下载 ${name} 失败（postinstall 不阻断）：${err.message}`)
        log(`    请手动运行：npm run sync-piper`)
      }
    }
  }

  log('同步完成 ✅')
}

main().catch((err) => {
  console.error('[sync-piper] 失败:', err)
  process.exit(1)
})
