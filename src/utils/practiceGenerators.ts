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
  'ten', 'eleven', 'twelve', 'thirteen', 'fourteen',
  'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen',
]
const TENS = [
  '', '', 'twenty', 'thirty', 'forty', 'fifty',
  'sixty', 'seventy', 'eighty', 'ninety',
]
const SCALES = ['', 'thousand', 'million', 'billion', 'trillion']

/**
 * Convert a number less than 1000 to English words.
 */
const convertHundreds = (n: number): string => {
  if (n === 0) return ''

  const parts: string[] = []
  const hundreds = Math.floor(n / 100)
  const remainder = n % 100

  if (hundreds > 0) {
    parts.push(`${ONES[hundreds]} hundred`)
  }

  if (remainder > 0) {
    if (remainder < 10) {
      parts.push(ONES[remainder])
    } else if (remainder < 20) {
      parts.push(TEENS[remainder - 10])
    } else {
      const tens = Math.floor(remainder / 10)
      const ones = remainder % 10
      parts.push(ones > 0 ? `${TENS[tens]}-${ONES[ones]}` : TENS[tens])
    }
  }

  return parts.join(' ')
}

/**
 * Convert an integer to English words (international number system).
 * e.g., 1234567890 → "one billion two hundred thirty-four million five hundred sixty-seven thousand eight hundred ninety"
 */
export const numberToWords = (num: number): string => {
  if (num === 0) return 'zero'
  if (!Number.isInteger(num) || num < 0) return String(num)

  const parts: string[] = []
  let remaining = num
  let scaleIndex = 0

  while (remaining > 0) {
    const chunk = remaining % 1000
    if (chunk > 0) {
      const chunkWords = convertHundreds(chunk)
      const withScale = scaleIndex > 0 ? `${chunkWords} ${SCALES[scaleIndex]}` : chunkWords
      parts.unshift(withScale)
    }
    remaining = Math.floor(remaining / 1000)
    scaleIndex += 1
  }

  return parts.join(' ')
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

const numberToSpeechWords = (value: string): string => {
  if (value.includes('.')) {
    const [intPart, fracPart] = value.split('.')
    const intWords = numberToWords(Number(intPart))
    const fracWords = fracPart
      .split('')
      .map((char) => DIGIT_WORDS[char] ?? char)
      .join(' ')
    return `${intWords} point ${fracWords}`
  }
  return numberToWords(Number(value))
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

    // Remove commas from date format for better TTS pronunciation
    const spoken = longDateFormatter.format(date).replace(/,/g, '')
    return {
      id: `date-${index + 1}`,
      speakText: spoken,
      answerText: `${toLocalISODate(date)} (${longDateFormatter.format(date)})`,
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
      speakText: numberToSpeechWords(numericValue),
      answerText: numericValue,
    }
  })
