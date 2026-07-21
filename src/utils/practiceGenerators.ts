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

const ONES = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine']
const TEENS = [
  'ten',
  'eleven',
  'twelve',
  'thirteen',
  'fourteen',
  'fifteen',
  'sixteen',
  'seventeen',
  'eighteen',
  'nineteen',
]
const TENS = [
  '',
  '',
  'twenty',
  'thirty',
  'forty',
  'fifty',
  'sixty',
  'seventy',
  'eighty',
  'ninety',
]
const SCALES = ['', 'thousand', 'million', 'billion']

const convertHundreds = (n: number): string => {
  const parts: string[] = []

  if (n >= 100) {
    const hundreds = Math.floor(n / 100)
    parts.push(`${ONES[hundreds]} hundred`)
    n %= 100
  }

  if (n >= 20) {
    const tens = Math.floor(n / 10)
    const ones = n % 10
    parts.push(ones > 0 ? `${TENS[tens]}-${ONES[ones]}` : TENS[tens])
  } else if (n >= 10) {
    parts.push(TEENS[n - 10])
  } else if (n > 0) {
    parts.push(ONES[n])
  }

  return parts.join(' ')
}

const integerToWords = (numStr: string): string => {
  if (numStr === '0') {
    return 'zero'
  }

  // Remove leading zeros except for single zero
  const trimmed = numStr.replace(/^0+/, '') || '0'
  if (trimmed === '0') {
    return 'zero'
  }

  const groups: string[] = []
  let remaining = trimmed

  while (remaining.length > 0) {
    const start = Math.max(0, remaining.length - 3)
    groups.push(remaining.slice(start))
    remaining = remaining.slice(0, start)
  }

  return groups
    .map((group, index) => {
      const n = parseInt(group, 10)
      if (n === 0) {
        return ''
      }
      const words = convertHundreds(n)
      const scale = SCALES[index]
      return scale ? `${words} ${scale}` : words
    })
    .filter(Boolean)
    .reverse()
    .join(' ')
}

const numberToEnglishWords = (value: string): string => {
  const parts = value.split('.')
  const integerPart = integerToWords(parts[0])

  if (parts.length === 1 || parts[1] === '') {
    return integerPart
  }

  const fractionWords = parts[1]
    .split('')
    .map((d) => DIGIT_WORDS[d] ?? d)
    .join(' ')

  return `${integerPart} point ${fractionWords}`
}

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
      speakText: numberToEnglishWords(numericValue),
      answerText: numericValue,
    }
  })
