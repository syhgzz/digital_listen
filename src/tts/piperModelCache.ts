/**
 * Persistent cache for downloaded voice models.
 *
 * The Hugging Face mirror serves the model through a signed redirect whose
 * response headers are not reliable for browser HTTP caching, so a 60MB model
 * would otherwise be re-downloaded on every page load.
 *
 * Two backends are needed because the origin private file system (OPFS) only
 * exists in a secure context: an app served over plain HTTP has
 * `navigator.storage === undefined`, and without the IndexedDB fallback every
 * visit would download the model again. OPFS is preferred when available; the
 * IndexedDB store keeps HTTP deployments cached as well.
 */

export const MODEL_CACHE_DIR = 'tts-model'
export const MODEL_CACHE_DB = 'tts-model-cache'
export const MODEL_CACHE_STORE = 'models'

export interface CacheableVoice {
  id: string
  sizeBytes: number
}

/** Cache key: the size is part of the name so a re-provisioned model invalidates the entry. */
export const cacheFileName = (voice: CacheableVoice): string =>
  `${voice.id}-${voice.sizeBytes > 0 ? voice.sizeBytes : 'unknown'}.onnx`

/** A store able to keep one Blob per voice file name. */
export interface ModelCacheBackend {
  readonly name: 'opfs' | 'indexeddb'
  isAvailable(): boolean
  read(fileName: string): Promise<Blob | null>
  write(fileName: string, blob: Blob): Promise<void>
  remove(fileName: string): Promise<void>
  clear(): Promise<void>
}

const isOpfsSupported = (): boolean =>
  typeof navigator !== 'undefined' && typeof navigator.storage?.getDirectory === 'function'

const getOpfsDirectory = async (
  create: boolean,
): Promise<FileSystemDirectoryHandle | null> => {
  if (!isOpfsSupported()) {
    return null
  }
  try {
    const root = await navigator.storage.getDirectory()
    return await root.getDirectoryHandle(MODEL_CACHE_DIR, { create })
  } catch {
    return null
  }
}

/** Preferred backend: purpose-built for large files, and it exists over HTTPS. */
export const opfsBackend: ModelCacheBackend = {
  name: 'opfs',
  isAvailable: isOpfsSupported,
  async read(fileName) {
    const directory = await getOpfsDirectory(false)
    if (!directory) {
      return null
    }
    try {
      const handle = await directory.getFileHandle(fileName)
      return await handle.getFile()
    } catch {
      return null
    }
  },
  async write(fileName, blob) {
    const directory = await getOpfsDirectory(true)
    if (!directory) {
      throw new Error('浏览器未提供 OPFS 存储。')
    }
    const handle = await directory.getFileHandle(fileName, { create: true })
    const writable = await handle.createWritable()
    await writable.write(blob)
    await writable.close()
  },
  async remove(fileName) {
    const directory = await getOpfsDirectory(false)
    await directory?.removeEntry(fileName).catch(() => undefined)
  },
  async clear() {
    const directory = await getOpfsDirectory(false)
    if (!directory) {
      return
    }
    for await (const name of directory.keys()) {
      await directory.removeEntry(name).catch(() => undefined)
    }
  },
}

const isIndexedDbSupported = (): boolean => typeof indexedDB !== 'undefined' && indexedDB !== null

const openDatabase = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const request = indexedDB.open(MODEL_CACHE_DB, 1)
    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(MODEL_CACHE_STORE)) {
        database.createObjectStore(MODEL_CACHE_STORE)
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('无法打开语音模型缓存数据库。'))
    request.onblocked = () => reject(new Error('语音模型缓存数据库被其他标签页占用。'))
  })

const runStoreRequest = async <T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> => {
  const database = await openDatabase()
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = database.transaction(MODEL_CACHE_STORE, mode)
      const request = run(transaction.objectStore(MODEL_CACHE_STORE))
      transaction.oncomplete = () => resolve(request.result)
      transaction.onabort = () =>
        reject(transaction.error ?? new Error('语音模型缓存事务已中止。'))
      transaction.onerror = () => reject(transaction.error ?? new Error('语音模型缓存事务失败。'))
    })
  } finally {
    database.close()
  }
}

/** Fallback backend for insecure origins, where OPFS does not exist. */
export const indexedDbBackend: ModelCacheBackend = {
  name: 'indexeddb',
  isAvailable: isIndexedDbSupported,
  async read(fileName) {
    const value = await runStoreRequest<unknown>('readonly', (store) => store.get(fileName))
    return value instanceof Blob ? value : null
  },
  async write(fileName, blob) {
    await runStoreRequest('readwrite', (store) => store.put(blob, fileName))
  },
  async remove(fileName) {
    await runStoreRequest('readwrite', (store) => store.delete(fileName))
  },
  async clear() {
    await runStoreRequest('readwrite', (store) => store.clear())
  },
}

const BACKENDS: readonly ModelCacheBackend[] = [opfsBackend, indexedDbBackend]

/** First backend this origin can actually use; `null` when storage is unavailable. */
export const pickBackend = (
  backends: readonly ModelCacheBackend[] = BACKENDS,
): ModelCacheBackend | null => backends.find((backend) => backend.isAvailable()) ?? null

export const isModelCacheSupported = (): boolean => pickBackend() !== null

export const readCachedModel = async (voice: CacheableVoice): Promise<ArrayBuffer | null> => {
  const backend = pickBackend()
  if (!backend) {
    return null
  }

  const fileName = cacheFileName(voice)
  try {
    const blob = await backend.read(fileName)
    if (!blob) {
      return null
    }
    if (voice.sizeBytes > 0 && blob.size !== voice.sizeBytes) {
      // A truncated or stale entry would otherwise be re-read on every load.
      await backend.remove(fileName)
      return null
    }
    return await blob.arrayBuffer()
  } catch (error) {
    console.warn('读取语音模型缓存失败，本次改为重新下载。', error)
    return null
  }
}

export const writeCachedModel = async (
  voice: CacheableVoice,
  buffer: ArrayBuffer,
): Promise<boolean> => {
  const backend = pickBackend()
  if (!backend) {
    return false
  }
  try {
    await backend.write(cacheFileName(voice), new Blob([buffer]))
    return true
  } catch (error) {
    console.warn('写入语音模型缓存失败，本次仍可正常播放。', error)
    return false
  }
}

export const clearCachedModels = async (): Promise<void> => {
  const backend = pickBackend()
  if (!backend) {
    return
  }
  try {
    await backend.clear()
  } catch (error) {
    console.warn('清理语音模型缓存失败。', error)
  }
}

/** Best-effort request to keep the cache from being evicted; failures are fine. */
export const requestPersistentStorage = async (): Promise<void> => {
  try {
    await navigator.storage?.persist?.()
  } catch {
    // Ignore: persistence is a hint, not a requirement.
  }
}
