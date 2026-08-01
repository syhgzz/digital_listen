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

export const integerToEnglishWords = (digits: string): string => {
  const normalized = digits.replace(/^0+(?=\d)/, '')
  if (!/^\d+$/.test(normalized)) {
    return digits
  }

  const value = Number(normalized)
  if (!Number.isSafeInteger(value)) {
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

  return parts.join(', ')
}

const ORDINALS: Record<number, string> = {
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
}

export const ordinalToEnglishWords = (day: number): string => {
  if (!Number.isInteger(day) || day < 1 || day > 31) {
    throw new RangeError('Date day must be an integer from 1 to 31.')
  }
  if (ORDINALS[day]) {
    return ORDINALS[day]
  }
  if (day % 10 === 0) {
    return TENS[day / 10].replace(/y$/, 'ieth')
  }

  const tens = Math.floor(day / 10)
  return `${TENS[tens]}-${ORDINALS[day % 10]}`
}

export const yearToEnglishWords = (year: number): string => {
  if (!Number.isInteger(year) || year < 0) {
    throw new RangeError('Year must be a non-negative integer.')
  }
  return integerToEnglishWords(String(year)).replaceAll(', ', ' ')
}
