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
