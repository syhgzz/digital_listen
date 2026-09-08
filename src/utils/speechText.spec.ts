import { describe, expect, it } from 'vitest'
import {
  dateToSpeakText,
  digitsToWords,
  formatDateLabel,
  numberToEnglishWords,
  numberToSpeakText,
  ordinalWord,
  yearToWords,
} from './speechText'

describe('numberToEnglishWords', () => {
  it('reads the requirement example as a single number', () => {
    expect(numberToEnglishWords('1234567890')).toBe(
      'one billion two hundred thirty-four million five hundred sixty-seven thousand eight hundred ninety',
    )
  })

  it('handles small values', () => {
    expect(numberToEnglishWords('0')).toBe('zero')
    expect(numberToEnglishWords('7')).toBe('seven')
    expect(numberToEnglishWords('10')).toBe('ten')
    expect(numberToEnglishWords('11')).toBe('eleven')
    expect(numberToEnglishWords('20')).toBe('twenty')
    expect(numberToEnglishWords('21')).toBe('twenty-one')
    expect(numberToEnglishWords('99')).toBe('ninety-nine')
    expect(numberToEnglishWords('100')).toBe('one hundred')
    expect(numberToEnglishWords('101')).toBe('one hundred one')
    expect(numberToEnglishWords('110')).toBe('one hundred ten')
  })

  it('handles scales', () => {
    expect(numberToEnglishWords('1000')).toBe('one thousand')
    expect(numberToEnglishWords('1000000')).toBe('one million')
    expect(numberToEnglishWords('1000000000')).toBe('one billion')
    expect(numberToEnglishWords('1000000001')).toBe('one billion one')
    expect(numberToEnglishWords('1000000000000')).toBe('one trillion')
  })

  it('ignores leading zeros and rejects non digits', () => {
    expect(numberToEnglishWords('007')).toBe('seven')
    expect(() => numberToEnglishWords('12a')).toThrow()
  })
})

describe('numberToSpeakText', () => {
  it('reads the integer part as a whole and the fraction digit by digit', () => {
    expect(numberToSpeakText('1234.56')).toBe(
      'one thousand two hundred thirty-four point five six',
    )
    expect(numberToSpeakText('0.05')).toBe('zero point zero five')
    expect(numberToSpeakText('42')).toBe('forty-two')
  })
})

describe('digitsToWords', () => {
  it('spells every digit for the phone module', () => {
    expect(digitsToWords('5551234')).toBe('five five five one two three four')
    expect(digitsToWords('0')).toBe('zero')
  })
})

describe('ordinalWord', () => {
  it('covers the days of a month', () => {
    expect(ordinalWord(1)).toBe('first')
    expect(ordinalWord(2)).toBe('second')
    expect(ordinalWord(3)).toBe('third')
    expect(ordinalWord(8)).toBe('eighth')
    expect(ordinalWord(11)).toBe('eleventh')
    expect(ordinalWord(12)).toBe('twelfth')
    expect(ordinalWord(20)).toBe('twentieth')
    expect(ordinalWord(21)).toBe('twenty-first')
    expect(ordinalWord(30)).toBe('thirtieth')
    expect(ordinalWord(31)).toBe('thirty-first')
  })
})

describe('yearToWords', () => {
  it('uses the natural spoken form of years', () => {
    expect(yearToWords(1900)).toBe('nineteen hundred')
    expect(yearToWords(1901)).toBe('nineteen oh one')
    expect(yearToWords(1999)).toBe('nineteen ninety-nine')
    expect(yearToWords(2000)).toBe('two thousand')
    expect(yearToWords(2005)).toBe('two thousand five')
    expect(yearToWords(2010)).toBe('twenty ten')
    expect(yearToWords(2025)).toBe('twenty twenty-five')
  })
})

describe('dateToSpeakText', () => {
  it('produces an English date with no locale dependency', () => {
    const date = new Date(2025, 8, 8)
    expect(dateToSpeakText(date)).toBe('September eighth, twenty twenty-five')
    expect(formatDateLabel(date)).toBe('September 8, 2025')
  })
})
