# 数字听力训练（Vue）

基于 **Vue 3 + TypeScript + Vite** 的数字听力练习应用，包含三个模块：

1. 电话号码听力：随机 30 题，支持自定义号码位数。
2. 日期听力：随机 30 题，支持自定义日期范围。
3. 数字听力：随机 30 题，支持配置小数点前后位数。

应用使用项目内置的 MIT 许可 Piper WASM 英语语音引擎，不依赖操作系统声音或浏览器 Web Speech API。模型在浏览器 Worker 中运行，模型文件从应用自身地址加载，并在支持的浏览器中复用模型缓存；Safari/WebKit 会使用同源静态资源缓存，避免其 OPFS 模型缓存错误影响播放。

支持「正常 / 稍快 / 最快」语速。首次播放需要点击“开始训练”或“重复发音”以满足浏览器音频权限策略；首次加载模型约需下载 63 MB，之后由浏览器缓存复用。
快捷键为：`Space` 重复发音、`→` 下一题、`R` 重新开始。  
应用启动后不会自动播放，首次播放由用户操作触发。

## 本地运行

```bash
npm install
npm run setup:models
npm run dev
```

## 生产构建

```bash
npm run build
```

`npm run setup:models` 会下载固定版本的 `en_US-lessac-medium` 模型并校验 SHA-256。`npm install` 会将 Piper 和 ONNX Runtime 的 WASM 文件复制到 `public/wasm/`；`npm run build` 会先执行模型校验，避免漏带模型资源。

## 支持范围

支持当前及上一主要版本的 Chrome、Edge、Firefox、Safari，以及 Android Chrome 和 iOS Safari。浏览器必须支持 WebAssembly、Web Worker 和 Web Audio；不支持这些能力的旧浏览器会显示兼容性错误。
