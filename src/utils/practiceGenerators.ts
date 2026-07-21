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
const SCALES = ['', 'thousand', 'million', 'billion', 'trillion']

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

const convertHundreds = (n: number): string => {
  const parts: string[] = []
  const hundreds = Math.floor(n / 100)
  const remainder = n % 100
  if (hundreds > 0) {
    parts.push(ONES[hundreds] + ' hundred')
  }
  if (remainder >= 20) {
    const tens = Math.floor(remainder / 10)
    const ones = remainder % 10
    parts.push(TENS[tens] + (ones > 0 ? '-' + ONES[ones] : ''))
  } else if (remainder >= 10) {
    parts.push(TEENS[remainder - 10])
  } else if (remainder > 0) {
    parts.push(ONES[remainder])
  }
  return parts.join(' ')
}

const numberToEnglishWords = (numStr: string): string => {
  if (numStr === '0') return 'zero'
  if (numStr.length === 0) return ''

  const padded = numStr.padStart(Math.ceil(numStr.length / 3) * 3, '0')
  const groups: string[] = []

  for (let i = 0; i < padded.length; i += 3) {
    const chunk = parseInt(padded.slice(i, i + 3), 10)
    if (chunk === 0) continue
    const scaleIdx = (padded.length - i - 3) / 3
    const chunkWords = convertHundreds(chunk)
    const scale = SCALES[scaleIdx]
    groups.push(chunkWords + (scale ? ' ' + scale : ''))
  }

  return groups.join(' ')
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

    const integerWords = numberToEnglishWords(integerPart)
    const fractionWords =
      fractionPart
        .split('')
        .map((char) => DIGIT_WORDS[char] ?? char)
        .join(' ')
    const speakText =
      fractionDigits > 0 ? `${integerWords} point ${fractionWords}` : integerWords

    return {
      id: `number-${index + 1}`,
      speakText,
      answerText: numericValue,
    }
  })
