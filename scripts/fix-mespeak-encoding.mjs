import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)))
const target = join(rootDir, 'node_modules', 'mespeak', 'src', 'ESpeak.js')

const main = async () => {
  const source = await readFile(target)
  if (source.includes(Buffer.from('\\xcf .. \\xd6', 'utf8'))) {
    return
  }

  const fixed = Buffer.from(
    source
      .toString('latin1')
      .replace(/[\u0080-\u00ff]/g, (char) => `\\x${char.charCodeAt(0).toString(16)}`),
    'utf8',
  )

  await writeFile(target, fixed)
  console.log('已修复 mespeak ESpeak.js 的非 UTF-8 字节。')
}

main().catch((error) => {
  console.error('修复 mespeak 编码失败：', error)
  process.exit(1)
})
