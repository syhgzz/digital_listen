import { cp, mkdir, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)))
const sourceDir = join(rootDir, 'node_modules', 'piper-tts-web', 'dist')
const publicDir = join(rootDir, 'public')

const targets = ['onnx', 'piper', 'worker']

const main = async () => {
  for (const target of targets) {
    const source = join(sourceDir, target)
    const destination = join(publicDir, target)
    await rm(destination, { recursive: true, force: true })
    await mkdir(publicDir, { recursive: true })
    await cp(source, destination, { recursive: true })
    console.log(`已复制 ${target} → public/${target}`)
  }
}

main().catch((error) => {
  console.error('复制 Piper 运行时文件失败：', error)
  process.exit(1)
})
