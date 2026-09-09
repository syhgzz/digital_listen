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

### 语音模型从哪里加载

单条声线约 60MB，加载顺序为：

1. **浏览器 OPFS 缓存**（`tts-model/`）——命中则零网络，刷新页面秒开
2. **HF 镜像站**（默认 `https://hf-mirror.com/diffusionstudio/piper-voices/resolve/main`）——离服务器远的客户端更快
3. **本站 `/tts/voices/`**——镜像被墙/超时/字节数不符时自动兜底（连续 10 秒无数据即放弃）

> 注意：hf-mirror / aifasthub 等「国内镜像」只镜像元数据，大文件会 302 跳转到 AWS
> （`cas-bridge.xethub.hf.co` / `us.aws.cdn.hf.co`），国内网络常常连不上，此时会自动回退到本站。
> 如果镜像在你的网络里不可用，可设 `VITE_TTS_MIRROR_BASE=` 关闭镜像优先，直接从服务器加载。

镜像下载完成后会写入 OPFS，因此第二次访问不再下载（镜像的签名跳转无法被浏览器 HTTP 缓存复用）。
来源会显示在「语音设置」的状态标签上（`就绪 · 镜像站` / `本地缓存` / `服务器`）。

> 首次加载在模型下载完成后还需要约 10–60 秒初始化（编译 63MB 模型图 + 加载 18MB 音素数据），
> 期间状态标签会显示「正在初始化语音引擎…」与已耗时秒数，控制台还会打印各阶段耗时
> （`[tts] 声线 … 就绪：下载 Xs · 会话 Ys · 音素 Zs`）。
> 用 **HTTPS** 部署时页面才会进入 `crossOriginIsolated`，ONNX Runtime 可多线程，初始化和合成都更快；
> 当前 HTTP 访问为单线程。

## 准备语音资源

```bash
npm install          # 自动复制 Piper 的 WASM 运行时到 public/tts
npm run tts:setup    # 下载默认的 6 条英文声线（约 360MB）到 public/tts/voices
npm run dev
```

默认声线：

| voiceId | 显示名 |
| --- | --- |
| `en_US-lessac-medium` | Lessac（美音·女声）· 默认 |
| `en_US-hfc_female-medium` | HFC Female（美音·女声） |
| `en_US-hfc_male-medium` | HFC Male（美音·男声） |
| `en_US-ryan-medium` | Ryan（美音·男声） |
| `en_GB-jenny_dioco-medium` | Jenny（英音·女声） |
| `en_GB-alan-medium` | Alan（英音·男声） |

- 语音资源位于 `public/tts/`，已在 `.gitignore` 中忽略，不需要提交到仓库。
- `npm run tts:setup` 下载时依次尝试 `VITE_TTS_MODEL_BASE` → `VITE_TTS_MIRROR_BASE` → HuggingFace → `hf-mirror.com`。
- 增删声线（manifest 会按目录内容自动重建，UI 立即生效）：

  ```bash
  node scripts/tts-assets.mjs --voice en_US-amy-medium          # 只下这一条
  node scripts/tts-assets.mjs --voices en_US-amy-medium,en_GB-alan-medium
  node scripts/tts-assets.mjs --defaults                        # 补齐默认清单
  ```

  磁盘占用按每条约 60MB 估算；`public/tts` 与 `dist/` 各存一份。

## 快捷键

`Space` 重复发音、`→` 下一题、`R` 重新开始。

按钮获得焦点（出现焦点框）后快捷键依然有效：命中快捷键时会先让按钮失焦再执行动作；
输入框、日期选择器、下拉框等控件内不会误触发（下拉框仅屏蔽与原生行为冲突的按键）。

## 可选配置

```bash
VITE_REMOTE_TTS_ENDPOINT=http://127.0.0.1:5000/speak   # 可选在线语音引擎
VITE_REMOTE_TTS_TIMEOUT_MS=10000

VITE_TTS_MIRROR_BASE=https://hf-mirror.com/diffusionstudio/piper-voices/resolve/main
# 置空即关闭镜像优先，只从本站加载：VITE_TTS_MIRROR_BASE=

VITE_TTS_MODEL_BASE=https://hf-mirror.com/diffusionstudio/piper-voices/resolve/main
# 仅影响 npm run tts:setup 在服务器侧下载模型时的首选地址
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

仓库内附带一键部署脚本 `deploy.sh` 与 nginx 配置 `nginx/digital-listen.conf`
（监听 **53002**，发布目录 `/var/www/digital_listen_dsh41f`）：

```bash
cd /srv/digital_listen
./deploy.sh               # 准备语音资源 → 构建 → 发布 → 装配置 → nginx -t 校验并重载
```

> 不要加 `sudo`（需要 root 的步骤脚本会自动 sudo；node 由 nvm 安装时 sudo 会找不到 node）。

手动方式与参数说明见 `nginx/README.md`。

配置要点：`assets/` 与语音模型长期缓存、`manifest.json`/Piper 运行时每次校验、
gzip 压缩 wasm、COOP/COEP 开启 ONNX Runtime 多线程，详见 `nginx/README.md`。

## 许可说明

- Piper 语音模型、`onnxruntime-web`、`@diffusionstudio/piper-wasm` 的代码均为 MIT。
- `piper_phonemize.data` 内含 eSpeak-NG 数据，遵循 **GPL-3.0**；本项目为本地个人工具，
  若对外分发请注意该许可要求。
