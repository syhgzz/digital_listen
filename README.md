# 数字听力训练（Vue）

基于 **Vue 3 + TypeScript + Vite** 的数字听力练习应用，包含三个模块：

1. 电话号码听力：随机 30 题，逐位朗读，支持自定义号码位数。
2. 日期听力：随机 30 题，英文长格式日期朗读，支持自定义日期范围。
3. 数字听力：随机 30 题，整数部分按英文数字整体朗读（如 one billion ...），小数部分逐位朗读，支持配置小数点前后位数。

## 语音引擎

应用内置 **Piper 神经网络语音引擎**（[`@mintplex-labs/piper-tts-web`](https://www.npmjs.com/package/@mintplex-labs/piper-tts-web)），
完全在浏览器本地通过 WebAssembly 合成语音，不依赖操作系统或浏览器的语音能力，
因此在所有现代浏览器和操作系统上发音完全一致，且始终为英文发音。

- 提供 3 个美式英文声线（HFC 女声 / HFC 男声 / Lessac 女声）与「正常 / 稍快 / 最快」语速。
- **首次运行前需下载语音模型**（每个约 63MB，存放到 `public/models/`，不入库）：

```bash
npm run setup:models
```

下载脚本优先使用 hf-mirror.com 镜像，huggingface.co 可直连的网络会自动回退到官方源。
应用运行时会优先从本地 `models/` 加载模型，并缓存到浏览器 OPFS；若本地文件缺失，
回退到在线下载（可用 `VITE_HF_MIRROR` 指定镜像）。

快捷键为：`Space` 重复发音、`→` 下一题、`R` 重新开始。  
应用启动后会自动准备题目并朗读第一题。

## 本地运行

```bash
npm install
npm run dev
```

## 生产构建

```bash
npm run build
```
# digital_listen
