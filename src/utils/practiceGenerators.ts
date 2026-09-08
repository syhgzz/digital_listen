import type { PracticeItem } from '../types/practice'
import { dateToSpeakText, digitsToWords, formatDateLabel, numberToSpeakText } from './speechText'

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

const toLocalISODate = (date: Date): string => {
  const year = String(date.getFullYear())
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export const createPhonePracticeItems = (count: number, digitCount: number): PracticeItem[] =>
  Array.from({ length: count }, (_, index) => {
    const digits = randomDigitString(digitCount)
    return {
      id: `phone-${index + 1}`,
      speakText: digitsToWords(digits),
      answerText: digits,
    }
  })

export const createDatePracticeItems = (
  count: number,
  startDateISO: string,
  endDateISO: string,
): PracticeItem[] => {
  const startDate = new Date(`${startDateISO}T00:00:00`)
  const endDate = new Date(`${endDateISO}T00:00:00`)
  const daySpan = Math.floor((endDate.getTime() - startDate.getTime()) / 86_400_000)

  return Array.from({ length: count }, (_, index) => {
    const offset = daySpan === 0 ? 0 : randomInt(0, daySpan)
    const date = new Date(startDate)
    date.setDate(startDate.getDate() + offset)

    return {
      id: `date-${index + 1}`,
      speakText: dateToSpeakText(date),
      answerText: `${toLocalISODate(date)} (${formatDateLabel(date)})`,
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

    return {
      id: `number-${index + 1}`,
      speakText: numberToSpeakText(numericValue),
      answerText: numericValue,
    }
  })
