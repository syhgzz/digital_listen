import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)))
const outDir = join(rootDir, 'public', 'models', 'piper', 'en', 'en_US', 'lessac', 'medium')

const mirror = process.env.PIPER_MIRROR ?? 'https://huggingface.co'
const baseUrl = `${mirror}/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium`

const files = ['en_US-lessac-medium.onnx', 'en_US-lessac-medium.onnx.json']

const download = async (url, destination) => {
  console.log(`下载 ${url}`)
  const response = await fetch(url, { redirect: 'follow' })
  if (!response.ok) {
    throw new Error(`下载失败（HTTP ${response.status}）：${url}`)
  }

  const contentLength = Number(response.headers.get('content-length') ?? '0')
  const reader = response.body?.getReader()
  const chunks = []
  let received = 0
  let lastProgress = 0

  if (reader) {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) {
        break
      }
      chunks.push(value)
      received += value.byteLength
      if (contentLength > 0 && received - lastProgress > contentLength * 0.1) {
        lastProgress = received
        console.log(`  ${Math.round((received / contentLength) * 100)}%`)
      }
    }
  }

  await mkdir(dirname(destination), { recursive: true })
  await writeFile(destination, Buffer.concat(chunks))
  console.log(`完成：${destination}（${received} 字节）`)
}

const main = async () => {
  console.log(`模型镜像：${mirror}`)
  for (const file of files) {
    await download(`${baseUrl}/${file}`, join(outDir, file))
  }
  console.log('\n全部下载完成。Piper 引擎（en_US-lessac-medium）已可用。')
}

main().catch((error) => {
  console.error(error.message ?? error)
  console.error('\n提示：国内网络可尝试 PIPER_MIRROR=https://hf-mirror.com 重试。')
  process.exit(1)
})
