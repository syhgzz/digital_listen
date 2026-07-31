import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// Piper 神经语音在浏览器内使用多线程 WASM 推理，需要跨源隔离才能启用
// SharedArrayBuffer。生产环境部署时也需要在静态服务器上配置同样的响应头。
const crossOriginIsolationHeaders = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  optimizeDeps: {
    // piper-tts-web 的分发包内含 eval 动态 require shim，预打包会破坏它。
    exclude: ['piper-tts-web'],
  },
  server: {
    headers: crossOriginIsolationHeaders,
  },
  preview: {
    headers: crossOriginIsolationHeaders,
  },
})
