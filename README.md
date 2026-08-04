# 数字听力训练（Vue）

基于 **Vue 3 + TypeScript + Vite** 的数字听力练习应用，包含三个模块：

1. 电话号码听力：随机 30 题，支持自定义号码位数（逐位朗读）。
2. 日期听力：随机 30 题，支持自定义日期范围（美式日期整体朗读）。
3. 数字听力：随机 30 题，支持配置小数点前后位数（整数部分整体朗读，小数部分逐位朗读）。

## 统一语音引擎

应用使用 **sherpa-onnx（开源）WASM 本地语音引擎**，在 Web Worker 中运行 VITS
英文模型（`vits-mim-en`，espeak-ng 音素化），通过 Web Audio API 播放合成音频。
所有浏览器、所有操作系统的发音完全一致，不依赖浏览器内置 `speechSynthesis`。

朗读文本由应用生成确定性的英文单词序列（例如
`1234567890` → `one billion two hundred thirty-four million five hundred sixty-seven thousand eight hundred ninety`，
年份 `2026` → `twenty twenty-six`），保证读音正确且跨平台一致。

引擎资产约 107 MB，首次使用前需下载一次（之后离线可用）：

```bash
npm install
npm run setup:tts   # 下载 sherpa-onnx WASM 引擎到 public/sherpa/
npm run dev
```

`public/sherpa/` 下的大文件已被 gitignore，仅 `sherpa-tts.worker.js` 入库。

## 界面与快捷键

界面按功能分为四组：训练模块、语音设置（语速/引擎状态）、题目设置、练习控制。

快捷键：`Space` 重复发音、`→` 下一题、`R` 重新开始。
按钮聚焦时快捷键依然有效；仅在文本输入框聚焦时不触发。

## 生产构建

```bash
npm run build
```
