import { describe, expect, it } from 'vitest'
import {
  resolveShortcutAction,
  shouldBlurBeforeShortcut,
  shouldHandleShortcut,
  type ShortcutTargetDescriptor,
} from './shortcutTarget'

const button: ShortcutTargetDescriptor = { tagName: 'BUTTON' }
const textInput: ShortcutTargetDescriptor = { tagName: 'INPUT', inputType: 'text' }
const numberInput: ShortcutTargetDescriptor = { tagName: 'INPUT', inputType: 'number' }
const dateInput: ShortcutTargetDescriptor = { tagName: 'INPUT', inputType: 'date' }
const checkbox: ShortcutTargetDescriptor = { tagName: 'INPUT', inputType: 'checkbox' }
const range: ShortcutTargetDescriptor = { tagName: 'INPUT', inputType: 'range' }
const select: ShortcutTargetDescriptor = { tagName: 'SELECT' }
const textarea: ShortcutTargetDescriptor = { tagName: 'TEXTAREA' }
const editable: ShortcutTargetDescriptor = { tagName: 'DIV', isContentEditable: true }
const textbox: ShortcutTargetDescriptor = { tagName: 'DIV', role: 'textbox' }
const plain: ShortcutTargetDescriptor = { tagName: 'BODY' }

describe('resolveShortcutAction', () => {
  it('maps the three shortcuts', () => {
    expect(resolveShortcutAction({ code: 'Space', key: ' ' })).toBe('repeat')
    expect(resolveShortcutAction({ code: 'ArrowRight', key: 'ArrowRight' })).toBe('next')
    expect(resolveShortcutAction({ code: 'KeyR', key: 'r' })).toBe('restart')
    expect(resolveShortcutAction({ code: 'KeyR', key: 'R' })).toBe('restart')
    expect(resolveShortcutAction({ code: 'KeyA', key: 'a' })).toBeNull()
  })
})

describe('shouldHandleShortcut', () => {
  it('keeps shortcuts alive while a button owns the focus ring', () => {
    expect(shouldHandleShortcut(button, 'repeat')).toBe(true)
    expect(shouldHandleShortcut(button, 'next')).toBe(true)
    expect(shouldHandleShortcut(button, 'restart')).toBe(true)
    expect(shouldHandleShortcut(plain, 'repeat')).toBe(true)
  })

  it('never steals keys from text entry', () => {
    for (const target of [textInput, numberInput, dateInput, textarea, editable, textbox]) {
      expect(shouldHandleShortcut(target, 'repeat')).toBe(false)
      expect(shouldHandleShortcut(target, 'next')).toBe(false)
      expect(shouldHandleShortcut(target, 'restart')).toBe(false)
    }
  })

  it('ignores only the keys a control uses natively', () => {
    expect(shouldHandleShortcut(select, 'repeat')).toBe(false)
    expect(shouldHandleShortcut(select, 'next')).toBe(false)
    expect(shouldHandleShortcut(select, 'restart')).toBe(true)

    expect(shouldHandleShortcut(checkbox, 'repeat')).toBe(false)
    expect(shouldHandleShortcut(checkbox, 'next')).toBe(true)

    expect(shouldHandleShortcut(range, 'next')).toBe(false)
    expect(shouldHandleShortcut(range, 'restart')).toBe(true)
  })
})

describe('shouldBlurBeforeShortcut', () => {
  it('blurs controls whose activation is bound to Space', () => {
    expect(shouldBlurBeforeShortcut(button)).toBe(true)
    expect(shouldBlurBeforeShortcut({ tagName: 'A' })).toBe(true)
    expect(shouldBlurBeforeShortcut({ tagName: 'DIV', role: 'button' })).toBe(true)
    expect(shouldBlurBeforeShortcut(plain)).toBe(false)
  })
})
