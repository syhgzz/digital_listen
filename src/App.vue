<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { useTts } from './composables/useTts'
import type { ModuleSettings, PracticeItem, PracticeModule, SpeechRatePreset } from './types/practice'
import {
  createDatePracticeItems,
  createNumberPracticeItems,
  createPhonePracticeItems,
} from './utils/practiceGenerators'

interface PersistedSettings {
  phone?: {
    digitCount?: number
  }
  date?: {
    startDate?: string
    endDate?: string
  }
  number?: {
    integerDigits?: number
    fractionDigits?: number
  }
  voiceURI?: string
  speechRatePreset?: SpeechRatePreset
  showAnswers?: boolean
}

const SESSION_SIZE = 30
const SETTINGS_STORAGE_KEY = 'digital-listen:settings:v1'

const moduleLabels: Record<PracticeModule, string> = {
  phone: '电话号码听力',
  date: '日期听力',
  number: '数字听力',
}
const modules: PracticeModule[] = ['phone', 'date', 'number']
const speechRatePresets: SpeechRatePreset[] = ['normal', 'slightlyFast', 'fastest']
const speechRateLabels: Record<SpeechRatePreset, string> = {
  normal: '正常',
  slightlyFast: '稍快',
  fastest: '最快',
}
const engineSourceLabels = {
  os: '操作系统内部语音引擎',
  local: '本地开源语音引擎',
  online: '在线语音引擎',
  none: '暂无可用语音引擎',
} as const

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const asInteger = (value: unknown): number | null =>
  typeof value === 'number' && Number.isInteger(value) ? value : null

const asBoolean = (value: unknown): boolean | null => (typeof value === 'boolean' ? value : null)

const asDateString = (value: unknown): string | null =>
  typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null

const asString = (value: unknown): string | null => (typeof value === 'string' ? value : null)

const asSpeechRatePreset = (value: unknown): SpeechRatePreset | null =>
  value === 'normal' || value === 'slightlyFast' || value === 'fastest' ? value : null

const toISODate = (date: Date): string => {
  const year = String(date.getFullYear())
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const getDefaultDateRange = () => {
  const endDate = new Date()
  const startDate = new Date()
  startDate.setDate(endDate.getDate() - 365)

  return {
    startDate: toISODate(startDate),
    endDate: toISODate(endDate),
  }
}

const readPersistedSettings = (): PersistedSettings => {
  if (typeof window === 'undefined') {
    return {}
  }

  const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY)
  if (!raw) {
    return {}
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (error) {
    console.error('Failed to parse persisted settings.', error)
    return {}
  }

  if (!isRecord(parsed)) {
    return {}
  }

  return parsed as PersistedSettings
}

const defaultDateRange = getDefaultDateRange()
const persistedSettings = readPersistedSettings()

const settings = reactive<ModuleSettings>({
  phone: {
    digitCount: asInteger(persistedSettings.phone?.digitCount) ?? 10,
  },
  date: {
    startDate: asDateString(persistedSettings.date?.startDate) ?? defaultDateRange.startDate,
    endDate: asDateString(persistedSettings.date?.endDate) ?? defaultDateRange.endDate,
  },
  number: {
    integerDigits: asInteger(persistedSettings.number?.integerDigits) ?? 6,
    fractionDigits: asInteger(persistedSettings.number?.fractionDigits) ?? 2,
  },
})

const activeModule = ref<PracticeModule>('phone')
const sessionItems = ref<PracticeItem[]>([])
const currentIndex = ref(0)
const showAnswers = ref(asBoolean(persistedSettings.showAnswers) ?? false)
const moduleError = ref('')

const {
  activeEngineSource,
  allVoiceOptions,
  anyEngineConfigured,
  availableVoices,
  selectedRatePreset,
  selectedVoiceURI,
  speaking,
  ttsError,
  speak,
  stop,
} = useTts({
  langPrefix: 'en-US',
  maxVoices: 5,
  initialVoiceURI: asString(persistedSettings.voiceURI) ?? undefined,
  initialRatePreset: asSpeechRatePreset(persistedSettings.speechRatePreset) ?? 'normal',
})

const currentItem = computed(() => sessionItems.value[currentIndex.value] ?? null)
const hasNextItem = computed(() => currentIndex.value < sessionItems.value.length - 1)
const progressLabel = computed(() =>
  sessionItems.value.length > 0 ? `${currentIndex.value + 1} / ${sessionItems.value.length}` : '未开始',
)

const isInteractiveTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) {
    return false
  }

  return (
    target.isContentEditable ||
    Boolean(
      target.closest(
        'input, textarea, select, button, a, summary, details, [role="button"], [role="link"]',
      ),
    )
  )
}

const validatePhoneModule = (): string => {
  if (!Number.isInteger(settings.phone.digitCount)) {
    return '电话号码位数必须是整数。'
  }
  if (settings.phone.digitCount < 3 || settings.phone.digitCount > 20) {
    return '电话号码位数范围应为 3 到 20。'
  }
  return ''
}

const validateDateModule = (): string => {
  if (!settings.date.startDate || !settings.date.endDate) {
    return '请完整选择日期范围。'
  }

  const start = new Date(`${settings.date.startDate}T00:00:00`)
  const end = new Date(`${settings.date.endDate}T00:00:00`)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return '日期范围无效，请重新选择。'
  }
  if (start.getTime() > end.getTime()) {
    return '开始日期不能晚于结束日期。'
  }
  return ''
}

const validateNumberModule = (): string => {
  if (!Number.isInteger(settings.number.integerDigits)) {
    return '小数点前位数必须是整数。'
  }
  if (!Number.isInteger(settings.number.fractionDigits)) {
    return '小数点后位数必须是整数。'
  }
  if (settings.number.integerDigits < 1 || settings.number.integerDigits > 12) {
    return '小数点前位数范围应为 1 到 12。'
  }
  if (settings.number.fractionDigits < 0 || settings.number.fractionDigits > 8) {
    return '小数点后位数范围应为 0 到 8。'
  }
  return ''
}

const clearSession = () => {
  stop()
  sessionItems.value = []
  currentIndex.value = 0
}

const speakCurrentItem = () => {
  if (!currentItem.value) {
    return
  }
  void speak(currentItem.value.speakText)
}

const buildSessionItems = (module: PracticeModule): PracticeItem[] => {
  if (module === 'phone') {
    return createPhonePracticeItems(SESSION_SIZE, settings.phone.digitCount)
  }

  if (module === 'date') {
    return createDatePracticeItems(SESSION_SIZE, settings.date.startDate, settings.date.endDate)
  }

  return createNumberPracticeItems(
    SESSION_SIZE,
    settings.number.integerDigits,
    settings.number.fractionDigits,
  )
}

const validateModule = (module: PracticeModule): string => {
  if (module === 'phone') {
    return validatePhoneModule()
  }
  if (module === 'date') {
    return validateDateModule()
  }
  return validateNumberModule()
}

const startSession = () => {
  const validationError = validateModule(activeModule.value)
  if (validationError) {
    moduleError.value = validationError
    return
  }

  moduleError.value = ''
  sessionItems.value = buildSessionItems(activeModule.value)
  currentIndex.value = 0
  speakCurrentItem()
}

const restartSession = () => {
  startSession()
}

const switchModule = (module: PracticeModule) => {
  if (activeModule.value === module) {
    return
  }
  activeModule.value = module
  moduleError.value = ''
  clearSession()
  startSession()
}

const repeatCurrent = () => {
  if (!currentItem.value) {
    return
  }
  speakCurrentItem()
}

const nextItem = () => {
  if (!hasNextItem.value) {
    return
  }

  currentIndex.value += 1
  speakCurrentItem()
}

const handleGlobalKeydown = (event: KeyboardEvent) => {
  if (event.defaultPrevented || event.repeat) {
    return
  }
  if (event.altKey || event.ctrlKey || event.metaKey) {
    return
  }
  if (isInteractiveTarget(event.target)) {
    return
  }

  if (event.code === 'ArrowRight') {
    if (!hasNextItem.value) {
      return
    }
    event.preventDefault()
    nextItem()
    return
  }

  if (event.code === 'Space') {
    if (!currentItem.value) {
      return
    }
    event.preventDefault()
    repeatCurrent()
    return
  }

  if (event.code === 'KeyR') {
    event.preventDefault()
    restartSession()
  }
}

watch(
  [
    () => settings.phone.digitCount,
    () => settings.date.startDate,
    () => settings.date.endDate,
    () => settings.number.integerDigits,
    () => settings.number.fractionDigits,
    () => selectedRatePreset.value,
    () => selectedVoiceURI.value,
    () => showAnswers.value,
  ],
  () => {
    if (typeof window === 'undefined') {
      return
    }

    const payload: PersistedSettings = {
      phone: { digitCount: settings.phone.digitCount },
      date: { startDate: settings.date.startDate, endDate: settings.date.endDate },
      number: {
        integerDigits: settings.number.integerDigits,
        fractionDigits: settings.number.fractionDigits,
      },
      speechRatePreset: selectedRatePreset.value,
      showAnswers: showAnswers.value,
      voiceURI: selectedVoiceURI.value,
    }
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(payload))
  },
)

onMounted(() => {
  window.addEventListener('keydown', handleGlobalKeydown)
  startSession()
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleGlobalKeydown)
})
</script>

<template>
  <main class="app">
    <header class="hero">
      <h1>数字听力训练</h1>
      <p>基于 Vue 的数字听写练习工具：每个模块随机生成 30 题并自动朗读。</p>
    </header>

    <section class="panel">
      <div class="tabs" role="tablist" aria-label="训练模块">
        <button
          v-for="module in modules"
          :key="module"
          :class="['tab-button', { active: activeModule === module }]"
          type="button"
          role="tab"
          :aria-selected="activeModule === module"
          @click="switchModule(module)"
        >
          {{ moduleLabels[module] }}
        </button>
      </div>

      <div class="settings-grid">
        <label class="field">
          <span>语音引擎</span>
          <select v-model="selectedVoiceURI" :disabled="allVoiceOptions.length === 0">
            <option value="" disabled>
              {{ allVoiceOptions.length > 0 ? '请选择语音' : '暂无可用语音引擎' }}
            </option>
            <option
              v-for="opt in allVoiceOptions"
              :key="opt.id"
              :value="opt.id"
            >
              {{ opt.name }}（{{ opt.sourceLabel }}）
            </option>
          </select>
        </label>

        <label class="field">
          <span>语速</span>
          <select v-model="selectedRatePreset">
            <option v-for="preset in speechRatePresets" :key="preset" :value="preset">
              {{ speechRateLabels[preset] }}
            </option>
          </select>
        </label>

        <div class="field">
          <span>显示答案</span>
          <label class="switch-field">
            <input v-model="showAnswers" class="switch-input" type="checkbox" />
            <span class="switch-track" aria-hidden="true"></span>
            <span class="switch-text">{{ showAnswers ? '已开启' : '已关闭' }}</span>
          </label>
        </div>

        <template v-if="activeModule === 'phone'">
          <label class="field">
            <span>电话号码位数</span>
            <input v-model.number="settings.phone.digitCount" type="number" min="3" max="20" />
          </label>
        </template>

        <template v-else-if="activeModule === 'date'">
          <label class="field">
            <span>开始日期</span>
            <input v-model="settings.date.startDate" type="date" />
          </label>
          <label class="field">
            <span>结束日期</span>
            <input v-model="settings.date.endDate" type="date" />
          </label>
        </template>

        <template v-else>
          <label class="field">
            <span>小数点前位数</span>
            <input
              v-model.number="settings.number.integerDigits"
              type="number"
              min="1"
              max="12"
            />
          </label>
          <label class="field">
            <span>小数点后位数</span>
            <input
              v-model.number="settings.number.fractionDigits"
              type="number"
              min="0"
              max="8"
            />
          </label>
        </template>
      </div>

      <p v-if="!anyEngineConfigured" class="error-text">当前没有可用语音引擎，请先配置本地或在线引擎。</p>
      <p v-if="moduleError" class="error-text">{{ moduleError }}</p>
      <p v-if="ttsError" class="error-text">{{ ttsError }}</p>

      <div class="actions">
        <button type="button" class="primary" @click="restartSession">重新开始（R）</button>
        <button type="button" :disabled="!currentItem || !anyEngineConfigured" @click="repeatCurrent">
          重复发音（空格）
        </button>
        <button type="button" :disabled="!hasNextItem" @click="nextItem">下一个（→）</button>
      </div>

      <div class="status">
        <span>当前模块：{{ moduleLabels[activeModule] }}</span>
        <span>进度：{{ progressLabel }}</span>
        <span>引擎：{{ engineSourceLabels[activeEngineSource] }}</span>
        <span v-if="speaking">状态：朗读中...</span>
        <span v-if="currentItem">快捷键：空格重复，右箭头下一题，R 重新开始</span>
      </div>

      <div v-if="currentItem" class="question-card">
        <p class="title">请听并写下你听到的内容</p>
        <p v-if="showAnswers" class="answer">{{ currentItem.answerText }}</p>
        <p v-else class="masked">答案当前隐藏，可打开“显示答案”开关查看。</p>
      </div>
      <div v-else class="question-card empty">启动时会自动准备题目并朗读第一题。</div>
    </section>
  </main>
</template>
