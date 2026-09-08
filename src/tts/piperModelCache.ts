/**
 * Persistent (OPFS) cache for downloaded voice models.
 *
 * The Hugging Face mirror serves the model through a signed redirect whose
 * response headers are not reliable for browser HTTP caching, so a 60MB model
 * would otherwise be re-downloaded on every page load. Caching it in the
 * origin private file system makes every subsequent visit instant.
 */

export const MODEL_CACHE_DIR = 'tts-model'

export interface CacheableVoice {
  id: string
  sizeBytes: number
}

const cacheFileName = (voice: CacheableVoice): string =>
  `${voice.id}-${voice.sizeBytes > 0 ? voice.sizeBytes : 'unknown'}.onnx`

export const isModelCacheSupported = (): boolean =>
  typeof navigator !== 'undefined' && typeof navigator.storage?.getDirectory === 'function'

const getCacheDirectory = async (
  create: boolean,
): Promise<FileSystemDirectoryHandle | null> => {
  if (!isModelCacheSupported()) {
    return null
  }
  try {
    const root = await navigator.storage.getDirectory()
    return await root.getDirectoryHandle(MODEL_CACHE_DIR, { create })
  } catch {
    return null
  }
}

export const readCachedModel = async (voice: CacheableVoice): Promise<ArrayBuffer | null> => {
  const directory = await getCacheDirectory(false)
  if (!directory) {
    return null
  }

  const fileName = cacheFileName(voice)
  try {
    const handle = await directory.getFileHandle(fileName)
    const file = await handle.getFile()
    if (voice.sizeBytes > 0 && file.size !== voice.sizeBytes) {
      await directory.removeEntry(fileName).catch(() => undefined)
      return null
    }
    return await file.arrayBuffer()
  } catch {
    return null
  }
}

export const writeCachedModel = async (
  voice: CacheableVoice,
  buffer: ArrayBuffer,
): Promise<boolean> => {
  const directory = await getCacheDirectory(true)
  if (!directory) {
    return false
  }
  try {
    const handle = await directory.getFileHandle(cacheFileName(voice), { create: true })
    const writable = await handle.createWritable()
    await writable.write(buffer)
    await writable.close()
    return true
  } catch (error) {
    console.warn('写入语音模型缓存失败，本次仍可正常播放。', error)
    return false
  }
}

export const clearCachedModels = async (): Promise<void> => {
  const directory = await getCacheDirectory(false)
  if (!directory) {
    return
  }
  try {
    for await (const name of directory.keys()) {
      await directory.removeEntry(name).catch(() => undefined)
    }
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
