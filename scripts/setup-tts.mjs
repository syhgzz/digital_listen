import { createWriteStream, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { get as httpsGet } from 'node:https'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'

const RELEASE_VERSION = 'v1.10.30'
const ASSET_NAME = `sherpa-onnx-wasm-simd-${RELEASE_VERSION}-en-tts.tar.bz2`
const DOWNLOAD_URL = `https://github.com/k2-fsa/sherpa-onnx/releases/download/${RELEASE_VERSION}/${ASSET_NAME}`
const MARKER_CONTENT = `sherpa-onnx ${RELEASE_VERSION} en-tts (vits-mim-en)\n`
const MAX_ATTEMPTS = 5
const REQUEST_TIMEOUT_MS = 120_000

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const publicDir = join(projectRoot, 'public')
const targetDir = join(publicDir, 'sherpa')
const markerFile = join(targetDir, 'VERSION')

const requestOnce = (url) =>
  new Promise((resolve, reject) => {
    const request = httpsGet(url, (response) => {
      const { statusCode } = response
      if (statusCode >= 300 && statusCode < 400 && response.headers.location) {
        response.resume()
        resolve(requestOnce(response.headers.location))
        return
      }
      if (statusCode !== 200) {
        response.resume()
        reject(new Error(`HTTP ${statusCode}`))
        return
      }
      resolve(response)
    })
    request.setTimeout(REQUEST_TIMEOUT_MS, () => {
      request.destroy(new Error(`Request timed out after ${REQUEST_TIMEOUT_MS / 1000}s.`))
    })
    request.on('error', reject)
  })

const downloadToFile = async (url, filePath) =>
  new Promise((resolve, reject) => {
    requestOnce(url)
      .then((response) => {
        const fileStream = createWriteStream(filePath)
        response.pipe(fileStream)
        fileStream.on('finish', () => fileStream.close(() => resolve()))
        fileStream.on('error', reject)
        response.on('error', reject)
      })
      .catch(reject)
  })

const downloadWithRetry = async (url, filePath) => {
  let lastError = null
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      console.log(`Download attempt ${attempt}/${MAX_ATTEMPTS}...`)
      await downloadToFile(url, filePath)
      return
    } catch (error) {
      lastError = error
      rmSync(filePath, { force: true })
      const message = error instanceof Error ? error.message : String(error)
      console.error(`Attempt ${attempt} failed: ${message}`)
      if (attempt < MAX_ATTEMPTS) {
        const backoffMs = 4000 * attempt
        console.log(`Retrying in ${backoffMs / 1000}s...`)
        await delay(backoffMs)
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Download failed.')
}

const main = async () => {
  if (existsSync(markerFile)) {
    console.log(`Local TTS engine already installed at ${targetDir}, skipping download.`)
    return
  }

  const workDir = join(projectRoot, '.tts-download')
  mkdirSync(workDir, { recursive: true })
  const archivePath = join(workDir, ASSET_NAME)

  console.log('Downloading the local TTS engine (about 85 MB), please wait...')
  console.log(`  ${DOWNLOAD_URL}`)
  await downloadWithRetry(DOWNLOAD_URL, archivePath)

  console.log('Extracting engine files...')
  execSync(`tar xjf ${JSON.stringify(archivePath)}`, { cwd: workDir, stdio: 'inherit' })

  const extractedDir = join(workDir, `sherpa-onnx-wasm-simd-${RELEASE_VERSION}-en-tts`)
  if (!existsSync(extractedDir)) {
    throw new Error(`Extraction failed: expected directory not found (${extractedDir}).`)
  }

  rmSync(targetDir, { recursive: true, force: true })
  mkdirSync(targetDir, { recursive: true })

  const files = [
    'sherpa-onnx-tts.js',
    'sherpa-onnx-wasm-main-tts.js',
    'sherpa-onnx-wasm-main-tts.wasm',
    'sherpa-onnx-wasm-main-tts.data',
  ]
  for (const name of files) {
    execSync(`cp ${JSON.stringify(join(extractedDir, name))} ${JSON.stringify(join(targetDir, name))}`, {
      stdio: 'inherit',
    })
  }

  writeFileSync(markerFile, MARKER_CONTENT, 'utf8')
  rmSync(workDir, { recursive: true, force: true })
  console.log(`Local TTS engine installed under public/sherpa/ (${RELEASE_VERSION}).`)
}

main().catch((error) => {
  console.error('Setup local TTS engine failed:', error instanceof Error ? error.message : error)
  process.exit(1)
})
