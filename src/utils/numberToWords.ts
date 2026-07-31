const ZERO_TO_NINETEEN = [
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

const SCALES = ['', 'thousand', 'million', 'billion', 'trillion']

const threeDigitsToWords = (value: number): string => {
  if (value === 0) {
    return ''
  }

  const parts: string[] = []
  const hundreds = Math.floor(value / 100)
  const remainder = value % 100

  if (hundreds > 0) {
    parts.push(`${ZERO_TO_NINETEEN[hundreds]} hundred`)
  }
  if (remainder > 0) {
    if (remainder < 20) {
      parts.push(ZERO_TO_NINETEEN[remainder])
    } else {
      const tens = Math.floor(remainder / 10)
      const ones = remainder % 10
      parts.push(ones > 0 ? `${TENS[tens]}-${ZERO_TO_NINETEEN[ones]}` : TENS[tens])
    }
  }

  return parts.join(' ')
}

export const numberToEnglishWords = (digits: string): string => {
  const normalized = digits.replace(/^0+(?=\d)/, '')
  if (normalized === '' || normalized === '0') {
    return 'zero'
  }

  const groups: number[] = []
  for (let index = normalized.length; index > 0; index -= 3) {
    groups.push(Number(normalized.slice(Math.max(0, index - 3), index)))
  }

  const words: string[] = []
  for (let groupIndex = groups.length - 1; groupIndex >= 0; groupIndex -= 1) {
    const groupWords = threeDigitsToWords(groups[groupIndex])
    if (groupWords === '') {
      continue
    }
    words.push(groupWords)
    if (groupIndex > 0) {
      words.push(SCALES[groupIndex])
    }
  }

  return words.join(' ')
}
