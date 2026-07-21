import { createReadStream, existsSync, statSync } from 'node:fs'
import { extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, type Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'

const publicDir = fileURLToPath(new URL('./public', import.meta.url))

const WASM_MIME: Record<string, string> = {
  '.mjs': 'text/javascript',
  '.wasm': 'application/wasm',
  '.data': 'application/octet-stream',
}

// Serve /wasm/** straight from public/ during dev, bypassing Vite's module
// transform. onnxruntime-web dynamically imports its .mjs loader with a
// `?import` query, which Vite refuses to serve from /public ("should not be
// imported from source code"). Production builds copy public/ as-is, so this
// is only needed for `vite dev`.
const serveRawWasm = (): Plugin => ({
  name: 'serve-raw-wasm',
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      const pathname = normalize((req.url ?? '').split('?')[0])
      if (!pathname.startsWith('/wasm/') || pathname.includes('..')) {
        next()
        return
      }
      const filePath = join(publicDir, pathname)
      if (!existsSync(filePath) || !statSync(filePath).isFile()) {
        next()
        return
      }
      res.setHeader('Content-Type', WASM_MIME[extname(filePath)] ?? 'application/octet-stream')
      createReadStream(filePath).pipe(res)
    })
  },
})

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue(), serveRawWasm()],
})
