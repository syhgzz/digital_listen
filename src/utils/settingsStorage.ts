import type { ModuleSettings, PracticeModule, SpeechRatePreset } from '../types/practice'

export const SETTINGS_STORAGE_KEY = 'digital-listen:settings:v2'
export const LEGACY_SETTINGS_STORAGE_KEY = 'digital-listen:settings:v1'

export interface PersistedSettings {
  version: 2
  module?: PracticeModule
  phone?: { digitCount?: number }
  date?: { startDate?: string; endDate?: string }
  number?: { integerDigits?: number; fractionDigits?: number }
  showAnswers?: boolean
  tts?: { voiceKey?: string; ratePreset?: SpeechRatePreset }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

export const asInteger = (value: unknown): number | null =>
  typeof value === 'number' && Number.isInteger(value) ? value : null

export const asBoolean = (value: unknown): boolean | null =>
  typeof value === 'boolean' ? value : null

export const asDateString = (value: unknown): string | null =>
  typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null

export const asString = (value: unknown): string | null =>
  typeof value === 'string' ? value : null

export const asSpeechRatePreset = (value: unknown): SpeechRatePreset | null =>
  value === 'normal' || value === 'slightlyFast' || value === 'fastest' ? value : null

export const asPracticeModule = (value: unknown): PracticeModule | null =>
  value === 'phone' || value === 'date' || value === 'number' ? value : null

const migrateLegacy = (legacy: Record<string, unknown>): PersistedSettings => {
  const legacyVoiceURI = asString(legacy.voiceURI)
  let voiceKey: string | undefined
  if (legacyVoiceURI) {
    voiceKey = legacyVoiceURI.startsWith('__') ? 'auto' : `system:${legacyVoiceURI}`
  }

  return {
    version: 2,
    phone: isRecord(legacy.phone) ? (legacy.phone as PersistedSettings['phone']) : undefined,
    date: isRecord(legacy.date) ? (legacy.date as PersistedSettings['date']) : undefined,
    number: isRecord(legacy.number) ? (legacy.number as PersistedSettings['number']) : undefined,
    showAnswers: asBoolean(legacy.showAnswers) ?? undefined,
    tts: {
      voiceKey,
      ratePreset: asSpeechRatePreset(legacy.speechRatePreset) ?? undefined,
    },
  }
}

export const readPersistedSettings = (): PersistedSettings => {
  if (typeof window === 'undefined') {
    return { version: 2 }
  }

  const parse = (key: string): Record<string, unknown> | null => {
    const raw = window.localStorage.getItem(key)
    if (!raw) {
      return null
    }
    try {
      const parsed: unknown = JSON.parse(raw)
      return isRecord(parsed) ? parsed : null
    } catch (error) {
      console.error(`无法解析已保存的设置（${key}）。`, error)
      return null
    }
  }

  const current = parse(SETTINGS_STORAGE_KEY)
  if (current) {
    return { ...(current as unknown as Partial<PersistedSettings>), version: 2 }
  }

  const legacy = parse(LEGACY_SETTINGS_STORAGE_KEY)
  return legacy ? migrateLegacy(legacy) : { version: 2 }
}

/** Read-modify-write so several watchers can persist independent slices safely. */
export const updatePersistedSettings = (patch: Partial<Omit<PersistedSettings, 'version'>>): void => {
  if (typeof window === 'undefined') {
    return
  }
  const merged: PersistedSettings = { ...readPersistedSettings(), ...patch, version: 2 }
  try {
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(merged))
  } catch (error) {
    console.error('无法保存设置。', error)
  }
}

export const toISODate = (date: Date): string => {
  const year = String(date.getFullYear())
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export const getDefaultDateRange = (): { startDate: string; endDate: string } => {
  const endDate = new Date()
  const startDate = new Date()
  startDate.setDate(endDate.getDate() - 365)
  return { startDate: toISODate(startDate), endDate: toISODate(endDate) }
}

export const createDefaultSettings = (persisted: PersistedSettings): ModuleSettings => {
  const fallbackRange = getDefaultDateRange()
  return {
    phone: {
      digitCount: asInteger(persisted.phone?.digitCount) ?? 10,
    },
    date: {
      startDate: asDateString(persisted.date?.startDate) ?? fallbackRange.startDate,
      endDate: asDateString(persisted.date?.endDate) ?? fallbackRange.endDate,
    },
    number: {
      integerDigits: asInteger(persisted.number?.integerDigits) ?? 6,
      fractionDigits: asInteger(persisted.number?.fractionDigits) ?? 2,
    },
  }
}
