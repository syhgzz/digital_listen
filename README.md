# 数字听力训练（Vue）

基于 **Vue 3 + TypeScript + Vite** 的数字听力练习应用，包含三个模块：

1. **电话号码听力**：随机 30 题，每位数字单独朗读（`five five five one two three`）。
2. **日期听力**：随机 30 题，按 `September eighth, twenty twenty-five` 朗读。
3. **数字听力**：随机 30 题，整数部分整体朗读、小数部分逐位朗读
   （`1234567890` → `one billion two hundred thirty-four million five hundred sixty-seven thousand eight hundred ninety`）。

## 统一语音引擎

应用不再依赖操作系统语音：**Piper (VITS) 神经语音模型以 WASM 形式在浏览器内本地推理**，
语音资源由本项目自己托管，因此在任何浏览器 / 操作系统上的发音完全一致，并且首次准备完成后可完全离线使用。

朗读文本全部由 `src/utils/speechText.ts` 生成纯英文单词，不依赖 `Intl` 或浏览器区域设置，
所以日期与数字不会再出现非英文发音。

引擎按以下顺序回退：

1. **本地神经语音**（首选，`public/tts`，WASM + ONNX Runtime）
2. **在线语音引擎**（可选，配置 `VITE_REMOTE_TTS_ENDPOINT` 后才会出现）
3. **系统语音**（兜底；只会选择 `en-*` 语音，绝不会使用中文等非英文默认语音）

## 准备语音资源

```bash
npm install          # 自动复制 ONNX Runtime / Piper 的 WASM 运行时到 public/tts
npm run tts:setup    # 下载约 60MB 的英文语音模型到 public/tts/voices
npm run dev
```

- 语音资源位于 `public/tts/`，已在 `.gitignore` 中忽略，不需要提交到仓库。
- `npm run tts:setup` 依次尝试 `VITE_TTS_MODEL_BASE` → HuggingFace → `hf-mirror.com`；
  国内网络可显式指定镜像，例如：

  ```bash
  VITE_TTS_MODEL_BASE=https://hf-mirror.com/diffusionstudio/piper-voices/resolve/main npm run tts:setup
  ```

- 想换音色或增加音色：

  ```bash
  node scripts/tts-assets.mjs --voice en_US-hfc_female-medium
  ```

  新增的音色会写入 `public/tts/voices/manifest.json`，并在「语音设置」下拉框中出现。

## 快捷键

`Space` 重复发音、`→` 下一题、`R` 重新开始。

按钮获得焦点（出现焦点框）后快捷键依然有效：命中快捷键时会先让按钮失焦再执行动作；
输入框、日期选择器、下拉框等控件内不会误触发（下拉框仅屏蔽与原生行为冲突的按键）。

## 可选配置

```bash
VITE_REMOTE_TTS_ENDPOINT=http://127.0.0.1:5000/speak   # 可选在线语音引擎
VITE_REMOTE_TTS_TIMEOUT_MS=10000
```

请求方式为 `POST` JSON：

```json
{ "text": "hello world", "lang": "en-US", "rate": 1 }
```

## 常用命令

```bash
npm run dev        # 开发服务器（自动准备 WASM 运行时）
npm run build      # 类型检查 + 生产构建
npm run test       # 单元测试（朗读文本、快捷键判定、题目生成）
npm run tts:setup  # 重新准备语音资源
```

## 部署（nginx）

仓库内附带部署配置 `nginx/digital-listen.conf`（监听 **53002**）与说明 `nginx/README.md`：

```bash
npm run build
sudo rsync -a --delete dist/ /var/www/digital_listen_dsh41f/
sudo cp nginx/digital-listen.conf /etc/nginx/conf.d/
sudo nginx -t && sudo systemctl reload nginx
```

配置要点：`assets/` 与语音模型长期缓存、`manifest.json`/Piper 运行时每次校验、
gzip 压缩 wasm、COOP/COEP 开启 ONNX Runtime 多线程，详见 `nginx/README.md`。

## 许可说明

- Piper 语音模型、`onnxruntime-web`、`@diffusionstudio/piper-wasm` 的代码均为 MIT。
- `piper_phonemize.data` 内含 eSpeak-NG 数据，遵循 **GPL-3.0**；本项目为本地个人工具，
  若对外分发请注意该许可要求。
