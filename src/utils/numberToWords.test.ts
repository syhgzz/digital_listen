import { describe, expect, it } from 'vitest'
import { integerToEnglishWords, ordinalToEnglishWords, yearToEnglishWords } from './numberToWords'

describe('integerToEnglishWords', () => {
  it.each([
    ['0', 'zero'],
    ['000', 'zero'],
    ['19', 'nineteen'],
    ['20', 'twenty'],
    ['21', 'twenty-one'],
    ['105', 'one hundred five'],
    ['1000', 'one thousand'],
    ['1000000', 'one million'],
    [
      '1234567890',
      'one billion, two hundred thirty-four million, five hundred sixty-seven thousand, eight hundred ninety',
    ],
    [
      '999999999999',
      'nine hundred ninety-nine billion, nine hundred ninety-nine million, nine hundred ninety-nine thousand, nine hundred ninety-nine',
    ],
  ])('converts %s', (digits, expected) => {
    expect(integerToEnglishWords(digits)).toBe(expected)
  })
})

describe('ordinalToEnglishWords', () => {
  it.each([
    [1, 'first'],
    [2, 'second'],
    [3, 'third'],
    [4, 'fourth'],
    [11, 'eleventh'],
    [12, 'twelfth'],
    [13, 'thirteenth'],
    [20, 'twentieth'],
    [21, 'twenty-first'],
    [31, 'thirty-first'],
  ])('converts day %s', (day, expected) => {
    expect(ordinalToEnglishWords(day)).toBe(expected)
  })
})

describe('yearToEnglishWords', () => {
  it('uses a full cardinal year', () => {
    expect(yearToEnglishWords(2026)).toBe('two thousand twenty-six')
  })
})
