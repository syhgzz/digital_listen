import type { PracticeItem } from '../types/practice'
import { integerToEnglishWords, ordinalToEnglishWords, yearToEnglishWords } from './numberToWords'

const DIGIT_WORDS: Record<string, string> = {
  '0': 'zero',
  '1': 'one',
  '2': 'two',
  '3': 'three',
  '4': 'four',
  '5': 'five',
  '6': 'six',
  '7': 'seven',
  '8': 'eight',
  '9': 'nine',
}

const longDateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'long',
  day: 'numeric',
  year: 'numeric',
})

const monthFormatter = new Intl.DateTimeFormat('en-US', { month: 'long' })

const randomInt = (min: number, max: number): number =>
  Math.floor(Math.random() * (max - min + 1)) + min

const randomDigitString = (length: number, firstNonZero = false): string => {
  let result = ''
  for (let i = 0; i < length; i += 1) {
    const min = firstNonZero && i === 0 ? 1 : 0
    result += String(randomInt(min, 9))
  }
  return result
}

const parseISODateParts = (value: string) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) {
    return null
  }
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  }
}

const createLocalCalendarDate = (year: number, month: number, day: number): Date => {
  const date = new Date(0)
  date.setFullYear(year, month - 1, day)
  date.setHours(0, 0, 0, 0)
  return date
}

const createUTCDateFromSerial = (serialDay: number): Date => {
  const utcDate = new Date(serialDay * 86_400_000)
  return createLocalCalendarDate(
    utcDate.getUTCFullYear(),
    utcDate.getUTCMonth() + 1,
    utcDate.getUTCDate(),
  )
}

const toLocalISODate = (date: Date): string => {
  const year = String(date.getFullYear()).padStart(4, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const calendarDayNumber = (date: Date): number =>
  (() => {
    const utcDate = new Date(0)
    utcDate.setUTCFullYear(date.getFullYear(), date.getMonth(), date.getDate())
    utcDate.setUTCHours(0, 0, 0, 0)
    return utcDate.getTime() / 86_400_000
  })()

const digitsToSpeechWords = (value: string): string =>
  value
    .split('')
    .map((char) => DIGIT_WORDS[char] ?? char)
    .join(' ')

export const createPhonePracticeItems = (count: number, digitCount: number): PracticeItem[] =>
  Array.from({ length: count }, (_, index) => {
    const digits = randomDigitString(digitCount)
    return {
      id: `phone-${index + 1}`,
      speakText: digitsToSpeechWords(digits),
      answerText: digits,
    }
  })

export const createDatePracticeItems = (
  count: number,
  startDateISO: string,
  endDateISO: string,
): PracticeItem[] => {
  const startParts = parseISODateParts(startDateISO)
  const endParts = parseISODateParts(endDateISO)
  if (!startParts || !endParts) {
    return []
  }

  const startDate = createLocalCalendarDate(startParts.year, startParts.month, startParts.day)
  const endDate = createLocalCalendarDate(endParts.year, endParts.month, endParts.day)
  const startSerial = calendarDayNumber(startDate)
  const daySpan = Math.max(0, calendarDayNumber(endDate) - calendarDayNumber(startDate))

  return Array.from({ length: count }, (_, index) => {
    const offset = daySpan === 0 ? 0 : randomInt(0, daySpan)
    const date = createUTCDateFromSerial(startSerial + offset)

    const spoken = longDateFormatter.format(date)
    const monthName = monthFormatter.format(date)
    const day = date.getDate()
    const spokenText = `${monthName} ${ordinalToEnglishWords(day)}, ${yearToEnglishWords(date.getFullYear())}`
    return {
      id: `date-${index + 1}`,
      speakText: spokenText,
      answerText: `${toLocalISODate(date)} (${spoken})`,
    }
  })
}

export const createNumberPracticeItems = (
  count: number,
  integerDigits: number,
  fractionDigits: number,
): PracticeItem[] =>
  Array.from({ length: count }, (_, index) => {
    const integerPart = randomDigitString(integerDigits, integerDigits > 1)
    const fractionPart = fractionDigits > 0 ? randomDigitString(fractionDigits) : ''
    const numericValue = fractionDigits > 0 ? `${integerPart}.${fractionPart}` : integerPart

    const integerWords = integerToEnglishWords(integerPart)
    const speakText = fractionDigits > 0
      ? `${integerWords}, point, ${digitsToSpeechWords(fractionPart)}`
      : integerWords

    return {
      id: `number-${index + 1}`,
      speakText,
      answerText: numericValue,
    }
  })
