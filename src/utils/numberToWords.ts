const ONES: readonly string[] = [
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

const TENS: readonly string[] = [
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

const SCALE_WORDS: readonly string[] = [
  '',
  'thousand',
  'million',
  'billion',
  'trillion',
]

const DIGIT_WORD: Record<string, string> = {
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

const underHundredToWords = (value: number): string => {
  if (value < 20) {
    return ONES[value]
  }

  const ten = Math.floor(value / 10)
  const rest = value % 10
  if (rest === 0) {
    return TENS[ten]
  }
  return `${TENS[ten]}-${ONES[rest]}`
}

const threeDigitGroupToWords = (group: number): string => {
  const parts: string[] = []
  const hundreds = Math.floor(group / 100)
  if (hundreds > 0) {
    parts.push(`${ONES[hundreds]} hundred`)
  }

  const rest = group % 100
  if (rest > 0) {
    parts.push(underHundredToWords(rest))
  }

  return parts.join(' ')
}

export const integerToWords = (value: string): string => {
  const trimmed = value.replace(/^0+/, '')
  if (trimmed === '') {
    return 'zero'
  }

  const groups: number[] = []
  let remaining = trimmed
  while (remaining.length > 0) {
    const slice = remaining.length > 3 ? remaining.slice(-3) : remaining
    groups.unshift(Number.parseInt(slice, 10))
    remaining = remaining.length > 3 ? remaining.slice(0, -3) : ''
  }

  if (groups.length > SCALE_WORDS.length) {
    return '数字超出可朗读范围。'
  }

  const segments: string[] = []
  for (let index = 0; index < groups.length; index += 1) {
    const group = groups[index]
    if (group === 0) {
      continue
    }

    const scale = groups.length - 1 - index
    const words = threeDigitGroupToWords(group)
    const scaleWord = SCALE_WORDS[scale]
    segments.push(scaleWord ? `${words} ${scaleWord}` : words)
  }

  return segments.length > 0 ? segments.join(' ') : 'zero'
}

export const numberToSpoken = (value: string): string => {
  const dotIndex = value.indexOf('.')
  if (dotIndex === -1) {
    return integerToWords(value)
  }

  const integerPart = value.slice(0, dotIndex)
  const fractionPart = value.slice(dotIndex + 1)

  const integerWords = integerPart === '' ? 'zero' : integerToWords(integerPart)
  const fractionWords = fractionPart
    .split('')
    .map((char) => DIGIT_WORD[char] ?? char)
    .join(' ')

  return `${integerWords} point ${fractionWords}`
}
