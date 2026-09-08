import { describe, expect, it } from 'vitest'
import {
  createDatePracticeItems,
  createNumberPracticeItems,
  createPhonePracticeItems,
} from './practiceGenerators'

describe('createPhonePracticeItems', () => {
  it('creates digit-by-digit items of the requested length', () => {
    const items = createPhonePracticeItems(5, 10)
    expect(items).toHaveLength(5)
    for (const item of items) {
      expect(item.answerText).toMatch(/^\d{10}$/)
      expect(item.speakText.split(' ')).toHaveLength(10)
    }
  })
})

describe('createDatePracticeItems', () => {
  it('stays inside the requested range and speaks an English date', () => {
    const items = createDatePracticeItems(10, '2024-01-01', '2024-12-31')
    expect(items).toHaveLength(10)
    for (const item of items) {
      const iso = item.answerText.slice(0, 10)
      expect(iso >= '2024-01-01' && iso <= '2024-12-31').toBe(true)
      expect(item.speakText).toMatch(/^[A-Z][a-z]+ [a-z-]+, .+$/)
      expect(item.speakText).not.toMatch(/\d/)
    }
  })

  it('handles a single-day range', () => {
    const items = createDatePracticeItems(3, '2025-09-08', '2025-09-08')
    for (const item of items) {
      expect(item.speakText).toBe('September eighth, twenty twenty-five')
    }
  })
})

describe('createNumberPracticeItems', () => {
  it('reads the integer part as a whole number and the fraction digit by digit', () => {
    const items = createNumberPracticeItems(20, 6, 2)
    expect(items).toHaveLength(20)
    for (const item of items) {
      expect(item.answerText).toMatch(/^[1-9]\d{5}\.\d{2}$/)
      expect(item.speakText).toContain(' point ')
      const [, fraction] = item.speakText.split(' point ')
      expect(fraction.split(' ')).toHaveLength(2)
    }
  })

  it('supports a single integer digit without a fraction', () => {
    const items = createNumberPracticeItems(10, 1, 0)
    for (const item of items) {
      expect(item.answerText).toMatch(/^\d$/)
      expect(item.speakText).not.toContain('point')
      expect(item.speakText).not.toMatch(/\d/)
    }
  })
})
