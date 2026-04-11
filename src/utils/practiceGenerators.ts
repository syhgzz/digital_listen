import type { PracticeItem } from '../types/practice'

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

const digitsToSpeechWords = (value: string): string =>
  value
    .split('')
    .map((char) => DIGIT_WORDS[char] ?? char)
    .join(' ')

const numericToSpeechWords = (value: string): string =>
  value
    .split('')
    .map((char) => {
      if (char === '.') {
        return 'point'
      }
      return DIGIT_WORDS[char] ?? char
    })
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
  const startDate = new Date(`${startDateISO}T00:00:00`)
  const endDate = new Date(`${endDateISO}T00:00:00`)
  const daySpan = Math.floor((endDate.getTime() - startDate.getTime()) / 86_400_000)

  return Array.from({ length: count }, (_, index) => {
    const offset = daySpan === 0 ? 0 : randomInt(0, daySpan)
    const date = new Date(startDate)
    date.setDate(startDate.getDate() + offset)

    const spoken = longDateFormatter.format(date)
    return {
      id: `date-${index + 1}`,
      speakText: spoken,
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

    return {
      id: `number-${index + 1}`,
      speakText: numericToSpeechWords(numericValue),
      answerText: numericValue,
    }
  })
