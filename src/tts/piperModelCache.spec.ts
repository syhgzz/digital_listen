import { describe, expect, it } from 'vitest'
import { cacheFileName, pickBackend, type ModelCacheBackend } from './piperModelCache'

const fakeBackend = (name: 'opfs' | 'indexeddb', available: boolean): ModelCacheBackend => ({
  name,
  isAvailable: () => available,
  read: async () => null,
  write: async () => undefined,
  remove: async () => undefined,
  clear: async () => undefined,
})

describe('cacheFileName', () => {
  it('carries the model size so a re-provisioned model is not reused', () => {
    expect(cacheFileName({ id: 'en_US-lessac-medium', sizeBytes: 63201294 })).toBe(
      'en_US-lessac-medium-63201294.onnx',
    )
  })

  it('falls back to unknown when the manifest has no size', () => {
    expect(cacheFileName({ id: 'en_US-lessac-medium', sizeBytes: 0 })).toBe(
      'en_US-lessac-medium-unknown.onnx',
    )
  })
})

describe('pickBackend', () => {
  it('prefers OPFS when both backends are available', () => {
    const backend = pickBackend([fakeBackend('opfs', true), fakeBackend('indexeddb', true)])
    expect(backend?.name).toBe('opfs')
  })

  it('falls back to IndexedDB on an insecure origin, where OPFS does not exist', () => {
    const backend = pickBackend([fakeBackend('opfs', false), fakeBackend('indexeddb', true)])
    expect(backend?.name).toBe('indexeddb')
  })

  it('returns null when no backend can be used', () => {
    expect(pickBackend([fakeBackend('opfs', false), fakeBackend('indexeddb', false)])).toBeNull()
  })
})
