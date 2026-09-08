import { computed, reactive, ref, watch } from 'vue'
import type { ModuleSettings, PracticeItem, PracticeModule } from '../types/practice'
import {
  createDatePracticeItems,
  createNumberPracticeItems,
  createPhonePracticeItems,
} from '../utils/practiceGenerators'
import {
  asBoolean,
  asPracticeModule,
  createDefaultSettings,
  readPersistedSettings,
  updatePersistedSettings,
} from '../utils/settingsStorage'

export const MODULE_LABELS: Record<PracticeModule, string> = {
  phone: '电话号码听力',
  date: '日期听力',
  number: '数字听力',
}

export const PRACTICE_MODULES: PracticeModule[] = ['phone', 'date', 'number']

export interface UsePracticeSessionOptions {
  onSpeak: (text: string) => void
  sessionSize?: number
}

export const usePracticeSession = (options: UsePracticeSessionOptions) => {
  const sessionSize = options.sessionSize ?? 30
  const persisted = readPersistedSettings()

  const settings = reactive<ModuleSettings>(createDefaultSettings(persisted))
  const activeModule = ref<PracticeModule>(asPracticeModule(persisted.module) ?? 'phone')
  const sessionItems = ref<PracticeItem[]>([])
  const currentIndex = ref(0)
  const showAnswers = ref(asBoolean(persisted.showAnswers) ?? false)
  const moduleError = ref('')

  const currentItem = computed(() => sessionItems.value[currentIndex.value] ?? null)
  const hasNextItem = computed(() => currentIndex.value < sessionItems.value.length - 1)
  const progressLabel = computed(() =>
    sessionItems.value.length > 0
      ? `${currentIndex.value + 1} / ${sessionItems.value.length}`
      : '未开始',
  )

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

  const validateModule = (module: PracticeModule): string => {
    if (module === 'phone') {
      return validatePhoneModule()
    }
    if (module === 'date') {
      return validateDateModule()
    }
    return validateNumberModule()
  }

  const buildSessionItems = (module: PracticeModule): PracticeItem[] => {
    if (module === 'phone') {
      return createPhonePracticeItems(sessionSize, settings.phone.digitCount)
    }
    if (module === 'date') {
      return createDatePracticeItems(sessionSize, settings.date.startDate, settings.date.endDate)
    }
    return createNumberPracticeItems(
      sessionSize,
      settings.number.integerDigits,
      settings.number.fractionDigits,
    )
  }

  const speakCurrentItem = () => {
    if (currentItem.value) {
      options.onSpeak(currentItem.value.speakText)
    }
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

  const switchModule = (module: PracticeModule) => {
    if (activeModule.value === module) {
      return
    }
    activeModule.value = module
    moduleError.value = ''
    sessionItems.value = []
    currentIndex.value = 0
    startSession()
  }

  const repeatCurrent = () => {
    speakCurrentItem()
  }

  const nextItem = () => {
    if (!hasNextItem.value) {
      return
    }
    currentIndex.value += 1
    speakCurrentItem()
  }

  watch(
    [
      () => activeModule.value,
      () => settings.phone.digitCount,
      () => settings.date.startDate,
      () => settings.date.endDate,
      () => settings.number.integerDigits,
      () => settings.number.fractionDigits,
      () => showAnswers.value,
    ],
    () => {
      updatePersistedSettings({
        module: activeModule.value,
        phone: { digitCount: settings.phone.digitCount },
        date: { startDate: settings.date.startDate, endDate: settings.date.endDate },
        number: {
          integerDigits: settings.number.integerDigits,
          fractionDigits: settings.number.fractionDigits,
        },
        showAnswers: showAnswers.value,
      })
    },
  )

  return {
    activeModule,
    currentIndex,
    currentItem,
    hasNextItem,
    moduleError,
    progressLabel,
    sessionItems,
    settings,
    showAnswers,
    nextItem,
    repeatCurrent,
    restartSession: startSession,
    startSession,
    switchModule,
  }
}
