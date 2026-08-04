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

const UNDER_20 = [
  'zero',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
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

const SCALE_WORDS = ['', 'thousand', 'million', 'billion', 'trillion']

const ORDINAL_DAY_WORDS: Record<number, string> = {
  1: 'first',
  2: 'second',
  3: 'third',
  4: 'fourth',
  5: 'fifth',
  6: 'sixth',
  7: 'seventh',
  8: 'eighth',
  9: 'ninth',
  10: 'tenth',
  11: 'eleventh',
  12: 'twelfth',
  13: 'thirteenth',
  14: 'fourteenth',
  15: 'fifteenth',
  16: 'sixteenth',
  17: 'seventeenth',
  18: 'eighteenth',
  19: 'nineteenth',
  20: 'twentieth',
  21: 'twenty-first',
  22: 'twenty-second',
  23: 'twenty-third',
  24: 'twenty-fourth',
  25: 'twenty-fifth',
  26: 'twenty-sixth',
  27: 'twenty-seventh',
  28: 'twenty-eighth',
  29: 'twenty-ninth',
  30: 'thirtieth',
  31: 'thirty-first',
}

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

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

export const integerToWords = (value: number): string => {
  const normalized = Math.floor(Math.abs(value))

  if (normalized < 20) {
    return UNDER_20[normalized] ?? String(normalized)
  }

  const chunks: number[] = []
  let remaining = normalized
  while (remaining > 0) {
    chunks.push(remaining % 1000)
    remaining = Math.floor(remaining / 1000)
  }

  const parts: string[] = []
  for (let i = chunks.length - 1; i >= 0; i -= 1) {
    const chunk = chunks[i]
    if (chunk === 0) {
      continue
    }

    const chunkWords: string[] = []
    const hundreds = Math.floor(chunk / 100)
    if (hundreds > 0) {
      chunkWords.push(`${UNDER_20[hundreds]} hundred`)
    }
    const rest = chunk % 100
    if (rest > 0) {
      if (rest < 20) {
        chunkWords.push(UNDER_20[rest])
      } else {
        const tensWord = TENS[Math.floor(rest / 10)]
        const unit = rest % 10
        chunkWords.push(unit === 0 ? tensWord : `${tensWord}-${UNDER_20[unit]}`)
      }
    }

    parts.push(`${chunkWords.join(' ')} ${SCALE_WORDS[i]}`.trim())
  }

  return parts.join(' ')
}

export const numericValueToSpeechWords = (value: string): string => {
  const dotIndex = value.indexOf('.')
  if (dotIndex < 0) {
    return integerToWords(Number(value))
  }

  const integerPart = value.slice(0, dotIndex)
  const fractionPart = value.slice(dotIndex + 1)
  const integerWords = integerToWords(Number(integerPart || '0'))
  if (!fractionPart) {
    return integerWords
  }
  return `${integerWords} point ${digitsToSpeechWords(fractionPart)}`
}

export const yearToSpeechWords = (year: number): string => {
  if (year < 1000 || year > 9999) {
    return digitsToSpeechWords(String(year))
  }

  if (year < 2000) {
    const high = Math.floor(year / 100)
    const low = year % 100
    if (low === 0) {
      return `${integerToWords(high)} hundred`
    }
    if (low < 10) {
      return `${integerToWords(high)} oh ${UNDER_20[low]}`
    }
    return `${integerToWords(high)} ${integerToWords(low)}`
  }

  if (year < 2010) {
    return integerToWords(year)
  }

  const high = Math.floor(year / 100)
  const low = year % 100
  if (low === 0) {
    return `${integerToWords(high)} hundred`
  }
  return `${integerToWords(high)} ${integerToWords(low)}`
}

export const dateToSpeechWords = (date: Date): string => {
  const monthName = MONTH_NAMES[date.getMonth()] ?? ''
  const dayWord = ORDINAL_DAY_WORDS[date.getDate()] ?? String(date.getDate())
  return `${monthName} ${dayWord}, ${yearToSpeechWords(date.getFullYear())}`
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

    const spoken = dateToSpeechWords(date)
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
      speakText: numericValueToSpeechWords(numericValue),
      answerText: numericValue,
    }
  })
