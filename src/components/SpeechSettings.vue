<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import type { SpeechRatePreset } from '../types/practice'
import type { TtsEngineStatus, TtsModelSource, TtsProgress, TtsVoiceOption } from '../tts/types'

const props = defineProps<{
  voiceOptions: TtsVoiceOption[]
  selectedVoiceKey: string
  ratePreset: SpeechRatePreset
  engineStatus: TtsEngineStatus
  prepareProgress: TtsProgress | null
  isPreparing: boolean
  error: string
  hasLocalVoice: boolean
  canTest: boolean
  modelSource: TtsModelSource | null
}>()

const emit = defineEmits<{
  'update:selectedVoiceKey': [key: string]
  'update:ratePreset': [preset: SpeechRatePreset]
  'voice-change': [key: string]
  test: []
}>()

const RATE_PRESETS: SpeechRatePreset[] = ['normal', 'slightlyFast', 'fastest']
const RATE_LABELS: Record<SpeechRatePreset, string> = {
  normal: '正常',
  slightlyFast: '稍快',
  fastest: '最快',
}

const STATUS_LABELS: Record<TtsEngineStatus, string> = {
  unavailable: '不可用',
  idle: '未加载',
  preparing: '准备中',
  ready: '就绪',
  error: '加载失败',
}

const SOURCE_LABELS: Record<TtsModelSource, string> = {
  cache: '本地缓存',
  mirror: '镜像站',
  server: '服务器',
}

const groupedOptions = computed(() => {
  const groups = new Map<string, TtsVoiceOption[]>()
  for (const option of props.voiceOptions) {
    const list = groups.get(option.group) ?? []
    list.push(option)
    groups.set(option.group, list)
  }
  return [...groups.entries()].map(([group, options]) => ({ group, options }))
})

/** Ticks while preparing so a long engine init never looks frozen. */
const elapsedSeconds = ref(0)
let ticker: ReturnType<typeof setInterval> | undefined
watch(
  () => props.isPreparing,
  (preparing) => {
    clearInterval(ticker)
    ticker = undefined
    if (!preparing) {
      elapsedSeconds.value = 0
      return
    }
    elapsedSeconds.value = 0
    ticker = setInterval(() => {
      elapsedSeconds.value += 1
    }, 1000)
  },
  { immediate: true },
)
onUnmounted(() => clearInterval(ticker))

const statusText = computed(() => {
  if (props.isPreparing) {
    const message = props.prepareProgress?.message ?? '准备中…'
    return elapsedSeconds.value > 2 ? `${message} ${elapsedSeconds.value}s` : message
  }
  const base = STATUS_LABELS[props.engineStatus]
  if (props.engineStatus === 'ready' && props.modelSource) {
    return `${base} · ${SOURCE_LABELS[props.modelSource]}`
  }
  return base
})

const showSetupHint = computed(
  () => !props.isPreparing && props.engineStatus === 'error' && !props.hasLocalVoice,
)

const onVoiceChange = (event: Event) => {
  const key = (event.target as HTMLSelectElement).value
  emit('update:selectedVoiceKey', key)
  emit('voice-change', key)
}
</script>

<template>
  <section class="card" aria-labelledby="speech-settings-title">
    <h2 id="speech-settings-title" class="card-title">语音设置</h2>

    <div class="settings-grid">
      <label class="field">
        <span>语音</span>
        <select :value="selectedVoiceKey" :disabled="voiceOptions.length === 0" @change="onVoiceChange">
          <option v-if="voiceOptions.length === 0" value="" disabled>正在读取语音列表…</option>
          <optgroup v-for="entry in groupedOptions" :key="entry.group" :label="entry.group">
            <option v-for="option in entry.options" :key="option.key" :value="option.key">
              {{ option.label }}
            </option>
          </optgroup>
        </select>
      </label>

      <label class="field">
        <span>语速</span>
        <select
          :value="ratePreset"
          @change="
            emit('update:ratePreset', ($event.target as HTMLSelectElement).value as SpeechRatePreset)
          "
        >
          <option v-for="preset in RATE_PRESETS" :key="preset" :value="preset">
            {{ RATE_LABELS[preset] }}
          </option>
        </select>
      </label>

      <div class="field">
        <span>试听</span>
        <div class="field-row">
          <button type="button" :disabled="!canTest" @click="emit('test')">朗读示例</button>
          <span class="status-chip" :class="{ 'status-chip--busy': isPreparing }">{{ statusText }}</span>
        </div>
      </div>
    </div>

    <p v-if="error" class="error-text">{{ error }}</p>
    <p v-if="showSetupHint" class="hint-text">
      本地语音资源尚未准备：在项目目录执行 <code>npm run tts:setup</code> 后刷新页面即可。
    </p>
  </section>
</template>
