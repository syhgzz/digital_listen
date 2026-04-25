export type PracticeModule = 'phone' | 'date' | 'number'
export type SpeechRatePreset = 'normal' | 'slightlyFast' | 'fastest'

export interface PracticeItem {
  id: string
  speakText: string
  answerText: string
}

export interface PhoneSettings {
  digitCount: number
}

export interface DateSettings {
  startDate: string
  endDate: string
}

export interface NumberSettings {
  integerDigits: number
  fractionDigits: number
}

export interface ModuleSettings {
  phone: PhoneSettings
  date: DateSettings
  number: NumberSettings
}
