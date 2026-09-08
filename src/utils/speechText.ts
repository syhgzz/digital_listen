/**
 * Deterministic English text normalisation for the listening exercises.
 *
 * Everything the TTS engines receive is generated here, in plain English
 * words, so the pronunciation never depends on `Intl`, on the browser locale
 * or on which operating-system voice happens to be installed.
 */

const DIGIT_WORDS = [
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
] as const

const TEEN_WORDS: Record<number, string> = {
  10: 'ten',
  11: 'eleven',
  12: 'twelve',
  13: 'thirteen',
  14: 'fourteen',
  15: 'fifteen',
  16: 'sixteen',
  17: 'seventeen',
  18: 'eighteen',
  19: 'nineteen',
}

const TENS_WORDS: Record<number, string> = {
  2: 'twenty',
  3: 'thirty',
  4: 'forty',
  5: 'fifty',
  6: 'sixty',
  7: 'seventy',
  8: 'eighty',
  9: 'ninety',
}

const SCALE_WORDS = ['', 'thousand', 'million', 'billion', 'trillion', 'quadrillion'] as const

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
] as const

const ORDINAL_UNDER_20 = [
  '',
  'first',
  'second',
  'third',
  'fourth',
  'fifth',
  'sixth',
  'seventh',
  'eighth',
  'ninth',
  'tenth',
  'eleventh',
  'twelfth',
  'thirteenth',
  'fourteenth',
  'fifteenth',
  'sixteenth',
  'seventeenth',
  'eighteenth',
  'nineteenth',
] as const

const assertDigits = (value: string, label: string): string => {
  const normalized = value.trim()
  if (!/^\d*$/.test(normalized)) {
    throw new Error(`${label} must contain digits only, received "${value}".`)
  }
  return normalized
}

/** Spells a number below 1000, e.g. 234 -> "two hundred thirty-four". */
const underThousandToWords = (value: number): string => {
  if (value <= 0) {
    return ''
  }

  const parts: string[] = []
  const hundreds = Math.floor(value / 100)
  const remainder = value % 100

  if (hundreds > 0) {
    parts.push(`${DIGIT_WORDS[hundreds]} hundred`)
  }

  if (remainder > 0) {
    if (remainder < 10) {
      parts.push(DIGIT_WORDS[remainder])
    } else if (remainder < 20) {
      parts.push(TEEN_WORDS[remainder])
    } else {
      const tens = Math.floor(remainder / 10)
      const units = remainder % 10
      parts.push(units > 0 ? `${TENS_WORDS[tens]}-${DIGIT_WORDS[units]}` : TENS_WORDS[tens])
    }
  }

  return parts.join(' ')
}

/**
 * Reads an integer as a single cardinal number.
 *
 * `numberToEnglishWords('1234567890')` ->
 * `one billion two hundred thirty-four million five hundred sixty-seven thousand eight hundred ninety`
 */
export const numberToEnglishWords = (value: string): string => {
  const digits = assertDigits(value, 'numberToEnglishWords').replace(/^0+(?=\d)/, '')
  if (digits === '') {
    return DIGIT_WORDS[0]
  }

  const groups: number[] = []
  for (let end = digits.length; end > 0; end -= 3) {
    groups.push(Number(digits.slice(Math.max(0, end - 3), end)))
  }

  const parts: string[] = []
  for (let index = groups.length - 1; index >= 0; index -= 1) {
    const group = groups[index]
    if (group === 0) {
      continue
    }
    const scale = SCALE_WORDS[index] ?? ''
    const groupWords = underThousandToWords(group)
    parts.push(scale ? `${groupWords} ${scale}` : groupWords)
  }

  return parts.length > 0 ? parts.join(' ') : DIGIT_WORDS[0]
}

/** Reads a digit string one digit at a time, e.g. "5551234" -> "five five five one two three four". */
export const digitsToWords = (value: string): string =>
  value
    .trim()
    .split('')
    .map((char) => DIGIT_WORDS[Number(char)] ?? char)
    .join(' ')

/**
 * Reads a decimal number: the integer part as a whole number, the fraction
 * one digit at a time. `"1234.56"` -> `one thousand two hundred thirty-four point five six`.
 */
export const numberToSpeakText = (value: string): string => {
  const normalized = value.trim()
  if (normalized === '') {
    return ''
  }

  const [integerPart = '', fractionPart] = normalized.split('.')
  const parts: string[] = [numberToEnglishWords(integerPart === '' ? '0' : integerPart)]

  if (fractionPart !== undefined && fractionPart !== '') {
    parts.push('point', digitsToWords(fractionPart))
  }

  return parts.join(' ')
}

/** Ordinal word for a day of month, e.g. 8 -> "eighth", 21 -> "twenty-first". */
export const ordinalWord = (value: number): string => {
  if (!Number.isInteger(value) || value <= 0) {
    return String(value)
  }
  if (value < 20) {
    return ORDINAL_UNDER_20[value]
  }
  if (value < 100) {
    const tens = Math.floor(value / 10)
    const units = value % 10
    if (units === 0) {
      return `${TENS_WORDS[tens].replace(/y$/, 'ie')}th`
    }
    return `${TENS_WORDS[tens]}-${ORDINAL_UNDER_20[units]}`
  }
  return `${numberToEnglishWords(String(value))}th`
}

/**
 * Reads a year the way dates are spoken in English.
 * 1900 -> "nineteen hundred", 1901 -> "nineteen oh one",
 * 1999 -> "nineteen ninety-nine", 2000 -> "two thousand",
 * 2005 -> "two thousand five", 2025 -> "twenty twenty-five".
 */
export const yearToWords = (year: number): string => {
  if (!Number.isInteger(year) || year < 0) {
    return String(year)
  }
  if (year < 1000) {
    return numberToEnglishWords(String(year))
  }
  if (year % 1000 === 0) {
    return `${numberToEnglishWords(String(year / 1000))} thousand`
  }
  if (year % 100 === 0) {
    return `${numberToEnglishWords(String(year / 100))} hundred`
  }
  if (year >= 2000 && year <= 2009) {
    return `two thousand ${numberToEnglishWords(String(year % 10))}`
  }

  const century = Math.floor(year / 100)
  const remainder = year % 100
  const centuryWords = numberToEnglishWords(String(century))

  if (remainder < 10) {
    return `${centuryWords} oh ${DIGIT_WORDS[remainder]}`
  }
  return `${centuryWords} ${underThousandToWords(remainder)}`
}

/** Display label for a date, e.g. "September 8, 2025" (locale independent). */
export const formatDateLabel = (date: Date): string =>
  `${MONTH_NAMES[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`

/** Spoken form of a date, e.g. "September eighth, twenty twenty-five". */
export const dateToSpeakText = (date: Date): string =>
  `${MONTH_NAMES[date.getMonth()]} ${ordinalWord(date.getDate())}, ${yearToWords(date.getFullYear())}`
