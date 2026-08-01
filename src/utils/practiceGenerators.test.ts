import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createDatePracticeItems,
  createNumberPracticeItems,
  createPhonePracticeItems,
} from './practiceGenerators'

describe('practice speech text', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('reads phone digits separately', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    expect(createPhonePracticeItems(1, 5)[0]?.speakText).toBe('zero zero zero zero zero')
  })

  it('reads number integers as cardinal words', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.2)
    expect(createNumberPracticeItems(1, 10, 0)[0]?.speakText).toBe(
      'two billion, two hundred twenty-two million, two hundred twenty-two thousand, two hundred twenty-two',
    )
  })

  it('reads fractional digits independently after point', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    expect(createNumberPracticeItems(1, 1, 3)[0]?.speakText).toBe('zero, point, zero zero zero')
  })

  it('uses ordinal dates and a full English year', () => {
    const item = createDatePracticeItems(1, '2026-07-31', '2026-07-31')[0]
    expect(item?.speakText).toBe('July thirty-first, two thousand twenty-six')
  })

  it('keeps calendar ranges correct across years below 100', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.999)
    const item = createDatePracticeItems(1, '0099-12-31', '0100-01-01')[0]
    expect(item?.answerText).toContain('0100-01-01')
  })
})
