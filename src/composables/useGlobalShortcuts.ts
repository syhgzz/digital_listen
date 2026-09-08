import { onMounted, onUnmounted } from 'vue'
import {
  describeShortcutTarget,
  resolveShortcutAction,
  shouldBlurBeforeShortcut,
  shouldHandleShortcut,
} from '../utils/shortcutTarget'

export interface ShortcutHandlers {
  onRepeat: () => void
  onNext: () => void
  onRestart: () => void
}

/**
 * Global shortcuts: Space repeats, ArrowRight advances, R restarts.
 *
 * They keep working while a button owns the focus ring (the button is blurred
 * before the action runs, so its own Space activation cannot fire twice), but
 * never steal keys from text fields or from controls whose native behaviour
 * uses the same key.
 */
export const useGlobalShortcuts = (handlers: ShortcutHandlers) => {
  const handleKeydown = (event: KeyboardEvent) => {
    if (event.defaultPrevented || event.repeat) {
      return
    }
    if (event.altKey || event.ctrlKey || event.metaKey) {
      return
    }

    const action = resolveShortcutAction(event)
    if (!action) {
      return
    }

    const descriptor = describeShortcutTarget(event.target)
    if (descriptor && !shouldHandleShortcut(descriptor, action)) {
      return
    }

    event.preventDefault()
    if (descriptor && shouldBlurBeforeShortcut(descriptor) && event.target instanceof HTMLElement) {
      event.target.blur()
    }

    if (action === 'repeat') {
      handlers.onRepeat()
    } else if (action === 'next') {
      handlers.onNext()
    } else {
      handlers.onRestart()
    }
  }

  onMounted(() => window.addEventListener('keydown', handleKeydown))
  onUnmounted(() => window.removeEventListener('keydown', handleKeydown))
}
