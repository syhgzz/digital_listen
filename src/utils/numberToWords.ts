const BELOW_TWENTY = [
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

const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety']

const SCALES: Array<[number, string]> = [
  [1_000_000_000, 'billion'],
  [1_000_000, 'million'],
  [1_000, 'thousand'],
]

const chunkToWords = (value: number): string => {
  const parts: string[] = []
  const hundreds = Math.floor(value / 100)
  const rest = value % 100

  if (hundreds > 0) {
    parts.push(`${BELOW_TWENTY[hundreds]} hundred`)
  }

  if (rest >= 20) {
    const tens = Math.floor(rest / 10)
    const ones = rest % 10
    parts.push(ones > 0 ? `${TENS[tens]}-${BELOW_TWENTY[ones]}` : TENS[tens])
  } else if (rest > 0) {
    parts.push(BELOW_TWENTY[rest])
  }

  return parts.join(' ')
}

/**
 * Convert an integer digit string (e.g. "1234567890") into English words
 * ("one billion two hundred thirty-four million ...").
 * Supports up to 999,999,999,999.
 */
export const integerToEnglishWords = (digits: string): string => {
  const value = Number(digits.replace(/^0+(?=\d)/, ''))
  if (!Number.isFinite(value) || value < 0) {
    return digits
  }
  if (value === 0) {
    return 'zero'
  }

  const parts: string[] = []
  let remainder = value

  for (const [scaleValue, scaleName] of SCALES) {
    const chunk = Math.floor(remainder / scaleValue)
    if (chunk > 0) {
      parts.push(`${chunkToWords(chunk)} ${scaleName}`)
      remainder %= scaleValue
    }
  }
  if (remainder > 0) {
    parts.push(chunkToWords(remainder))
  }

  return parts.join(' ')
}

const belowHundredToWords = (value: number): string => {
  if (value >= 20) {
    const tens = Math.floor(value / 10)
    const ones = value % 10
    return ones > 0 ? `${TENS[tens]}-${BELOW_TWENTY[ones]}` : TENS[tens]
  }
  return BELOW_TWENTY[value]
}

/**
 * Convert a 4-digit year into the English year-reading convention:
 * 2026 -> "twenty twenty-six", 2008 -> "two thousand eight",
 * 1999 -> "nineteen ninety-nine", 1900 -> "nineteen hundred",
 * 1905 -> "nineteen oh five".
 */
export const yearToEnglishWords = (year: number): string => {
  if (year === 2000) {
    return 'two thousand'
  }
  if (year > 2000 && year < 2010) {
    return `two thousand ${BELOW_TWENTY[year - 2000]}`
  }
  if (year >= 2010 && year < 2100) {
    return `twenty ${belowHundredToWords(year - 2000)}`
  }

  const firstTwo = Math.floor(year / 100)
  const lastTwo = year % 100
  if (lastTwo === 0) {
    return `${belowHundredToWords(firstTwo)} hundred`
  }
  if (lastTwo < 10) {
    return `${belowHundredToWords(firstTwo)} oh ${BELOW_TWENTY[lastTwo]}`
  }
  return `${belowHundredToWords(firstTwo)} ${belowHundredToWords(lastTwo)}`
}
