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

const ONES: string[] = [
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

const TENS: string[] = [
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

const SCALES: string[] = ['', 'thousand', 'million', 'billion']

const MONTH_NAMES: string[] = [
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

const ORDINAL_ONES: Record<number, string> = {
  1: 'first',
  2: 'second',
  3: 'third',
  4: 'fourth',
  5: 'fifth',
  6: 'sixth',
  7: 'seventh',
  8: 'eighth',
  9: 'ninth',
}

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

const threeDigitsToWords = (value: number): string => {
  if (value === 0) {
    return ''
  }
  const parts: string[] = []
  const hundred = Math.floor(value / 100)
  const rest = value % 100
  if (hundred > 0) {
    parts.push(`${ONES[hundred]} hundred`)
  }
  if (rest > 0) {
    if (rest < 20) {
      parts.push(ONES[rest])
    } else {
      const ten = Math.floor(rest / 10)
      const one = rest % 10
      parts.push(one > 0 ? `${TENS[ten]}-${ONES[one]}` : TENS[ten])
    }
  }
  return parts.join(' ')
}

/**
 * 将整数数字串转成整体英文读数（最多支持 12 位整数，即十亿级）。
 * 示例：'1234567890' → 'one billion two hundred thirty-four million
 * five hundred sixty-seven thousand eight hundred ninety'
 */
export const numberToEnglishWords = (digits: string): string => {
  const normalized = digits.replace(/^0+(?=\d)/, '')
  if (!normalized || normalized === '0') {
    return 'zero'
  }

  const groupCount = Math.ceil(normalized.length / 3)
  const padded = normalized.padStart(groupCount * 3, '0')
  const parts: string[] = []

  for (let i = 0; i < groupCount; i += 1) {
    const groupValue = Number(padded.slice(i * 3, i * 3 + 3))
    if (groupValue === 0) {
      continue
    }
    const words = threeDigitsToWords(groupValue)
    const scale = SCALES[groupCount - 1 - i]
    parts.push(scale ? `${words} ${scale}` : words)
  }

  return parts.join(' ')
}

/** 将 1-31 的日期数字转成序数词，如 1 → 'first'，21 → 'twenty-first'。 */
export const ordinalWord = (day: number): string => {
  if (day < 1 || day > 31) {
    return String(day)
  }
  if (day === 12) {
    return 'twelfth'
  }
  if (day < 20) {
    return ORDINAL_ONES[day] ?? `${ONES[day]}th`
  }
  const ten = Math.floor(day / 10)
  const one = day % 10
  if (one === 0) {
    // twenty → twentieth，thirty → thirtieth
    return `${TENS[ten].replace(/y$/, 'ie')}th`
  }
  return `${TENS[ten]}-${ORDINAL_ONES[one]}`
}

/** 年份转英文读数：2026 → 'twenty twenty-six'，1999 → 'nineteen ninety-nine'。 */
export const yearToWords = (year: number): string => {
  if (year >= 2000 && year < 2010) {
    return year === 2000 ? 'two thousand' : `two thousand ${ONES[year - 2000]}`
  }
  if (year >= 1000) {
    const firstHalf = Math.floor(year / 100)
    const secondHalf = year % 100
    const firstWords = numberToEnglishWords(String(firstHalf))
    return secondHalf === 0 ? `${firstWords} hundred` : `${firstWords} ${numberToEnglishWords(String(secondHalf))}`
  }
  return numberToEnglishWords(String(year))
}

/** 日期转纯英文单词：2026-08-01 → 'August first, twenty twenty-six'。 */
const dateToEnglishWords = (date: Date): string => {
  const month = MONTH_NAMES[date.getMonth()]
  const day = ordinalWord(date.getDate())
  const year = yearToWords(date.getFullYear())
  return `${month} ${day}, ${year}`
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

    const spoken = dateToEnglishWords(date)
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
    const speakText =
      fractionDigits > 0
        ? `${integerWords} point ${digitsToSpeechWords(fractionPart)}`
        : integerWords

    return {
      id: `number-${index + 1}`,
      speakText,
      answerText: numericValue,
    }
  })
