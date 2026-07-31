# 数字听力训练（Vue）

基于 **Vue 3 + TypeScript + Vite** 的数字听力练习应用，包含三个模块：

1. 电话号码听力：随机 30 题，支持自定义号码位数，每个数字逐位朗读。
2. 日期听力：随机 30 题，支持自定义日期范围。
3. 数字听力：随机 30 题，支持配置小数点前后位数，整数部分读成完整数字（例如 1234567890 读作 one billion two hundred thirty-four million five hundred sixty-seven thousand eight hundred ninety）。

## 语音引擎

应用内置统一的浏览器端语音引擎，发音与操作系统和浏览器无关，在所有平台上表现一致：

| 引擎 | 说明 |
|---|---|
| **eSpeak 开源引擎（默认）** | 内置 [meSpeak.js](https://www.masswerk.at/mespeak/)（eSpeak 的浏览器移植版，GPL-3.0）。纯前端合成，完全离线，约 1-2MB，任何浏览器/系统都能稳定播放，且固定使用 en-US 英文发音。 |
| **Piper 神经语音（可选）** | 内置 [piper-tts-web](https://github.com/Poket-Jony/piper-tts-web)（MIT）。浏览器内 WASM 推理，音质自然。首次使用前需下载模型（约 63MB）： |

```bash
npm run models
```

国内网络可用镜像下载：

```bash
PIPER_MIRROR=https://hf-mirror.com npm run models
```

Piper 引擎在浏览器内使用多线程 WASM 推理，需要跨源隔离（SharedArrayBuffer）。开发服务器与 `vite preview` 已自动配置对应响应头；生产部署时请在你的静态服务器上配置：

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

若浏览器环境不支持，Piper 会自动不可用，不影响 eSpeak 默认引擎。

- 操作系统自带语音（Web Speech API）保留为可选引擎，便于与内置引擎对比。
- 语速支持「正常 / 稍快 / 最快」三档。
- 快捷键：`Space` 重复发音、`→` 下一题、`R` 重新开始（焦点在按钮上时依然生效；输入框内不响应以避免干扰输入）。
- 应用启动后会自动准备题目并朗读第一题。

## 本地运行

```bash
npm install
npm run dev
```

## 生产构建

```bash
npm run build
npm run preview
```

注意：构建后 `dist/` 会包含 Piper 运行时（onnx/piper/worker 目录），部署时需要一并发布。
