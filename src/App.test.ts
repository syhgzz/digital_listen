import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App.vue'

const speechMocks = vi.hoisted(() => ({
  speak: vi.fn(async () => undefined),
  stop: vi.fn(),
  preparing: undefined as unknown as import('vue').Ref<boolean>,
  supported: undefined as unknown as import('vue').Ref<boolean>,
}))

class MemoryStorage implements Storage {
  private values = new Map<string, string>()

  get length() {
    return this.values.size
  }

  clear() {
    this.values.clear()
  }

  getItem(key: string) {
    return this.values.get(key) ?? null
  }

  key(index: number) {
    return [...this.values.keys()][index] ?? null
  }

  removeItem(key: string) {
    this.values.delete(key)
  }

  setItem(key: string, value: string) {
    this.values.set(key, value)
  }
}

const localStorage = new MemoryStorage()

vi.mock('./composables/useTts', async () => {
  const { ref } = await import('vue')
  speechMocks.preparing = ref(false)
  speechMocks.supported = ref(true)
  return {
    useTts: () => ({
      selectedRatePreset: ref('normal'),
      speaking: ref(false),
      ttsError: ref(''),
      supported: speechMocks.supported,
      preparing: speechMocks.preparing,
      downloadProgress: ref(null),
      speak: speechMocks.speak,
      stop: speechMocks.stop,
    }),
  }
})

const findButton = (wrapper: ReturnType<typeof mount>, text: string) => {
  const button = wrapper.findAll('button').find((item) => item.text().includes(text))
  if (!button) {
    throw new Error(`Button not found: ${text}`)
  }
  return button
}

const dispatchShortcut = (element: Element, code: string) => {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, code })
  element.dispatchEvent(event)
  return event
}

describe('App', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: localStorage,
    })
    localStorage.clear()
    speechMocks.speak.mockClear()
    speechMocks.stop.mockClear()
    speechMocks.preparing.value = false
    speechMocks.supported.value = true
  })

  it('waits for an explicit start action before speaking', async () => {
    const wrapper = mount(App, { attachTo: document.body })

    expect(speechMocks.speak).not.toHaveBeenCalled()
    expect(findButton(wrapper, '开始训练').exists()).toBe(true)

    await findButton(wrapper, '开始训练').trigger('click')
    expect(speechMocks.speak).toHaveBeenCalledOnce()
    wrapper.unmount()
  })

  it.each([
    ['重复发音', 'Space'],
    ['下一个', 'ArrowRight'],
    ['重新开始', 'KeyR'],
  ])('handles %s shortcut while a button has focus', async (buttonText, code) => {
    const wrapper = mount(App, { attachTo: document.body })
    await findButton(wrapper, '开始训练').trigger('click')
    speechMocks.speak.mockClear()

    const button = findButton(wrapper, buttonText)
    ;(button.element as HTMLButtonElement).focus()
    const event = dispatchShortcut(button.element, code)

    expect(event.defaultPrevented).toBe(true)
    expect(speechMocks.speak).toHaveBeenCalledOnce()
    wrapper.unmount()
  })

  it('does not run global shortcuts while editing a setting', async () => {
    const wrapper = mount(App, { attachTo: document.body })
    await findButton(wrapper, '开始训练').trigger('click')
    speechMocks.speak.mockClear()

    const input = wrapper.get('input[type="number"]')
    ;(input.element as HTMLInputElement).focus()
    const event = dispatchShortcut(input.element, 'Space')

    expect(event.defaultPrevented).toBe(false)
    expect(speechMocks.speak).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('ignores playback shortcuts while speech is preparing', async () => {
    const wrapper = mount(App, { attachTo: document.body })
    await findButton(wrapper, '开始训练').trigger('click')
    speechMocks.speak.mockClear()
    speechMocks.preparing.value = true

    const next = findButton(wrapper, '下一个')
    ;(next.element as HTMLButtonElement).focus()
    dispatchShortcut(next.element, 'ArrowRight')

    expect(speechMocks.speak).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('ignores shifted shortcuts', async () => {
    const wrapper = mount(App, { attachTo: document.body })
    await findButton(wrapper, '开始训练').trigger('click')
    speechMocks.speak.mockClear()

    const restart = findButton(wrapper, '重新开始')
    ;(restart.element as HTMLButtonElement).focus()
    const event = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      code: 'KeyR',
      shiftKey: true,
    })
    restart.element.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(false)
    expect(speechMocks.speak).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('prevents shifted Space from activating a focused action button', async () => {
    const wrapper = mount(App, { attachTo: document.body })
    await findButton(wrapper, '开始训练').trigger('click')
    speechMocks.speak.mockClear()

    const repeat = findButton(wrapper, '重复发音')
    ;(repeat.element as HTMLButtonElement).focus()
    const event = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      code: 'Space',
      shiftKey: true,
    })
    repeat.element.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(true)
    expect(speechMocks.speak).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('uses the second layout grouping', () => {
    const wrapper = mount(App)

    wrapper.get('.workbench')
    expect(wrapper.get('.practice-settings').find('input[type="number"]').exists()).toBe(true)
    expect(wrapper.get('.speech-settings').findAll('select')).toHaveLength(1)
    expect(wrapper.get('.answer-panel').find('input[type="checkbox"]').exists()).toBe(true)
    wrapper.unmount()
  })

  it('removes the requested explanatory and engine text', () => {
    const text = mount(App).text()

    expect(text).not.toContain('基于 Vue 的数字听写练习工具')
    expect(text).not.toContain('当前模块：')
    expect(text).not.toContain('引擎：')
  })
})
