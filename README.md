# 数字听力训练（Vue）

基于 **Vue 3 + TypeScript + Vite** 的数字听力练习应用，包含三个模块：

1. 电话号码听力：随机 30 题，支持自定义号码位数（逐位朗读）。
2. 日期听力：随机 30 题，支持自定义日期范围（整日期英文朗读）。
3. 数字听力：随机 30 题，支持配置小数点前后位数（整体数字朗读，如 `1234567890` 读作 “one billion two hundred thirty-four million …”）。

## 语音引擎

应用使用统一的 **Piper 神经语音引擎**（[rhasspy/piper](https://github.com/rhasspy/piper) 的 WASM 版），在浏览器内本地运行，跨浏览器/操作系统表现一致。

- 语音模型：`en_US-amy-medium`（英文，自然神经网络语音）。
- 运行方式：Web Worker + onnxruntime-web（单线程，无需 cross-origin isolation）。
- 语速通过 Piper 的 `length_scale` 参数控制（正常 / 稍快 / 最快），无变调。
- 首次使用需下载约 60MB 语音模型，浏览器会缓存，后续秒开。

### 资源同步

Piper 运行时与模型文件不纳入版本库，由同步脚本生成到 `public/piper/`：

```bash
npm install        # postinstall 会自动复制运行时资源（不含模型下载）
npm run sync-piper # 完整同步：复制运行时资源 + 下载语音模型（约 60MB）
```

`public/piper/` 已被 `.gitignore` 忽略，可随时用上述命令重建。

> 模型默认从 `hf-mirror.com`（HuggingFace 镜像）下载。如需更换镜像或语音，修改 `scripts/sync-piper-assets.mjs` 中的 `MODEL_BASE`。

## 快捷键

| 按键 | 功能 |
|---|---|
| `Space` | 重复当前题目发音 |
| `→` | 下一题 |
| `R` | 重新开始 |

快捷键在按钮获得焦点时依然有效；仅在聚焦输入框/下拉框等可编辑控件时让位。

## 本地运行

```bash
npm install
npm run sync-piper   # 首次运行：下载语音模型
npm run dev
```

## 生产构建

```bash
npm run build    # vue-tsc 类型检查 + vite 构建
npm run preview  # 预览构建产物
```

> 无测试框架，未配置测试命令。

## 架构

- 单页应用，无路由 / 状态管理库，模块切换在 `App.vue` 中用 `v-if`/`v-show` 完成。
- 语音逻辑在 `src/composables/usePiperTts.ts`（Worker 驱动 + `speakGeneration`/`suppressUntilGen` 取消语义）。
- 题目生成在 `src/utils/practiceGenerators.ts`，朗读文本由 `src/utils/numberToWords.ts` 与 `src/utils/dateToWords.ts` 生成。
- 设置持久化：`localStorage` key `digital-listen:settings:v1`。
- 全局 `window.keydown` 监听快捷键，`isInteractiveTarget()` 仅在可编辑控件上让位。
