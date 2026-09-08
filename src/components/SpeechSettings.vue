<script setup lang="ts">
import { computed } from 'vue'
import type { SpeechRatePreset } from '../types/practice'
import type { TtsEngineStatus, TtsProgress, TtsVoiceOption } from '../tts/types'

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
}>()

const emit = defineEmits<{
  'update:selectedVoiceKey': [key: string]
  'update:ratePreset': [preset: SpeechRatePreset]
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

const groupedOptions = computed(() => {
  const groups = new Map<string, TtsVoiceOption[]>()
  for (const option of props.voiceOptions) {
    const list = groups.get(option.group) ?? []
    list.push(option)
    groups.set(option.group, list)
  }
  return [...groups.entries()].map(([group, options]) => ({ group, options }))
})

const statusText = computed(() => {
  if (props.isPreparing) {
    const percent = Math.round((props.prepareProgress?.ratio ?? 0) * 100)
    return `准备中 ${percent}%`
  }
  return STATUS_LABELS[props.engineStatus]
})

const showSetupHint = computed(
  () => !props.isPreparing && props.engineStatus === 'error' && !props.hasLocalVoice,
)
</script>

<template>
  <section class="card" aria-labelledby="speech-settings-title">
    <h2 id="speech-settings-title" class="card-title">语音设置</h2>

    <div class="settings-grid">
      <label class="field">
        <span>语音</span>
        <select
          :value="selectedVoiceKey"
          :disabled="voiceOptions.length === 0"
          @change="
            emit('update:selectedVoiceKey', (($event.target as HTMLSelectElement).value))
          "
        >
          <option v-if="voiceOptions.length === 0" value="" disabled>暂无可用语音</option>
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
          <span class="status-chip">{{ statusText }}</span>
        </div>
      </div>
    </div>

    <p v-if="error" class="error-text">{{ error }}</p>
    <p v-if="showSetupHint" class="hint-text">
      本地语音资源尚未准备：在项目目录执行 <code>npm run tts:setup</code> 后刷新页面即可。
    </p>
  </section>
</template>
