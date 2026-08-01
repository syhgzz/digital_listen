# 数字听力训练（Vue）

基于 **Vue 3 + TypeScript + Vite** 的数字听力练习应用，包含三个模块：

1. 电话号码听力：随机 30 题，支持自定义号码位数。
2. 日期听力：随机 30 题，支持自定义日期范围。
3. 数字听力：随机 30 题，支持配置小数点前后位数。

## 语音引擎

**Piper 本地神经语音引擎为默认引擎**，保证所有浏览器 / 操作系统上的发音一致：

- 模型文件（`en_US-lessac-medium.onnx`，约 60 MB）随项目打包在
  `public/piper-models/`，运行时 WASM（ONNX Runtime + piper_phonemize）打包在
  `public/piper/` —— 无需外网、无 CORS 问题。
- 首次使用后模型缓存到浏览器 OPFS，后续访问不重复加载。
- 语音下拉框仍可切换为「操作系统语音」（Web Speech API）作备选；
  Piper 引擎不可用时自动回退系统语音并提示。
- 若需使用其他模型源，设置环境变量 `VITE_PIPER_MODEL_BASE`（任意
  HuggingFace 镜像的 `diffusionstudio/piper-voices/resolve/main` 路径）。

> `@mintplex-labs/piper-tts-web` 通过 `patches/` 中的 patch-package 补丁
> 将模型源指向本地目录并固定单线程推理，`npm install` 时自动应用。

## 朗读规则

- 电话号码：逐位朗读（`one two three ...`）。
- 数字：整体朗读（`1234567890` → `one billion two hundred thirty-four
  million five hundred sixty-seven thousand eight hundred ninety`），小数读作
  `point` 加逐位数字。
- 日期：英文单词朗读（`2026-08-01` → `August first, twenty twenty-six`）。

## 界面与快捷键

- 设置按「语音设置 / 题目参数 / 显示设置」分组。
- 快捷键：`Space` 重复发音、`→` 下一题、`R` 重新开始；
  按钮聚焦时快捷键依然有效（不干扰输入框内的编辑操作）。

## 可选 HTTP 语音引擎

默认使用 Piper 引擎。本地/在线 HTTP 引擎默认关闭，可通过环境变量启用：

```bash
VITE_LOCAL_TTS_ENABLED=true
VITE_LOCAL_TTS_ENDPOINT=http://127.0.0.1:5000/speak
VITE_ONLINE_TTS_ENABLED=true
VITE_ONLINE_TTS_ENDPOINT=https://example.com/tts
```

请求方式为 `POST` JSON，基础请求体：

```json
{
  "text": "hello world",
  "lang": "en-US",
  "ratePreset": "normal",
  "rate": 1
}
```

## 本地运行

```bash
npm install
npm run dev
```

## 生产构建

```bash
npm run build
```
