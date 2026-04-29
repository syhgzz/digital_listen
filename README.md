# 数字听力训练（Vue）

基于 **Vue 3 + TypeScript + Vite** 的数字听力练习应用，包含三个模块：

1. 电话号码听力：随机 30 题，支持自定义号码位数。
2. 日期听力：随机 30 题，支持自定义日期范围。
3. 数字听力：随机 30 题，支持配置小数点前后位数。

应用的语音引擎按优先级回退：

1. **操作系统内部自带语音引擎**（首选，浏览器 Web Speech API）
2. **本地开源自然语言语音引擎**（可配置 HTTP 接口）
3. **在线自然语言语音引擎**（可配置 HTTP 接口）

支持 `en-US` 声音（最多展示 5 个）与「正常 / 稍快 / 最快」语速。  
快捷键为：`Space` 重复发音、`→` 下一题、`R` 重新开始。  
应用启动后会自动准备题目并朗读第一题。

## 可选语音引擎配置

默认只使用操作系统内部语音引擎。本地/在线引擎默认关闭，可通过环境变量启用：

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
# digital_listen
