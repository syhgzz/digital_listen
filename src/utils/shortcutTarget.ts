/**
 * Pure helpers deciding whether a global keyboard shortcut applies to the
 * currently focused element.
 *
 * The rule the app needs: shortcuts must keep working while a button (or any
 * other non-text control) owns the focus ring, but must never steal keys from
 * text fields or from controls whose native behaviour uses the same key.
 */

export type ShortcutAction = 'repeat' | 'next' | 'restart'

export interface ShortcutTargetDescriptor {
  tagName: string
  inputType?: string
  isContentEditable?: boolean
  role?: string
}

const TEXT_INPUT_TYPES = new Set([
  '',
  'text',
  'search',
  'url',
  'tel',
  'email',
  'password',
  'number',
  'date',
  'datetime-local',
  'month',
  'week',
  'time',
  'color',
  'file',
])

/** Elements that consume every printable key and therefore block all shortcuts. */
export const isTextEntryTarget = (target: ShortcutTargetDescriptor): boolean => {
  const tagName = target.tagName.toUpperCase()

  if (target.isContentEditable || target.role?.toLowerCase() === 'textbox') {
    return true
  }
  if (tagName === 'TEXTAREA') {
    return true
  }
  if (tagName === 'INPUT') {
    return TEXT_INPUT_TYPES.has((target.inputType ?? '').toLowerCase())
  }

  return false
}

/**
 * Controls whose native behaviour overlaps a shortcut key. Only the conflicting
 * key is ignored, every other shortcut still works while they keep focus.
 */
export const isNativeKeyConsumer = (
  target: ShortcutTargetDescriptor,
  action: ShortcutAction,
): boolean => {
  const tagName = target.tagName.toUpperCase()
  const inputType = (target.inputType ?? '').toLowerCase()

  if (tagName === 'SELECT') {
    return action === 'repeat' || action === 'next'
  }
  if (tagName === 'INPUT') {
    if (inputType === 'checkbox' || inputType === 'radio') {
      return action === 'repeat'
    }
    if (inputType === 'range') {
      return action === 'next'
    }
  }

  return false
}

export const shouldHandleShortcut = (
  target: ShortcutTargetDescriptor,
  action: ShortcutAction,
): boolean => !isTextEntryTarget(target) && !isNativeKeyConsumer(target, action)

/**
 * Focusable controls whose own activation is bound to Space/Enter. They must be
 * blurred before the shortcut runs, otherwise the browser fires an extra click
 * on keyup.
 */
export const shouldBlurBeforeShortcut = (target: ShortcutTargetDescriptor): boolean => {
  const tagName = target.tagName.toUpperCase()
  const role = target.role?.toLowerCase() ?? ''

  return (
    tagName === 'BUTTON' ||
    tagName === 'A' ||
    tagName === 'SUMMARY' ||
    role === 'button' ||
    role === 'link' ||
    role === 'tab'
  )
}

export interface ShortcutKeyEvent {
  code: string
  key: string
}

export const resolveShortcutAction = (event: ShortcutKeyEvent): ShortcutAction | null => {
  if (event.code === 'Space' || event.key === ' ') {
    return 'repeat'
  }
  if (event.code === 'ArrowRight' || event.key === 'ArrowRight') {
    return 'next'
  }
  if (event.code === 'KeyR' || event.key.toLowerCase() === 'r') {
    return 'restart'
  }
  return null
}

export const describeShortcutTarget = (target: EventTarget | null): ShortcutTargetDescriptor | null => {
  if (!(target instanceof HTMLElement)) {
    return null
  }

  return {
    tagName: target.tagName,
    inputType: target instanceof HTMLInputElement ? target.type : undefined,
    isContentEditable: target.isContentEditable,
    role: target.getAttribute('role') ?? undefined,
  }
}
