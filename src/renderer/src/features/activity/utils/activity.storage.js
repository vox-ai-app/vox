import { CHAT_STORAGE_KEY_PREFIX } from '../../chat/utils/chat.constants'

const TASK_HISTORY_STORAGE_KEY_PREFIX = 'vox.workspace.activity.history.v1'
const LEGACY_TASK_HISTORY_CACHE_KEY = `${CHAT_STORAGE_KEY_PREFIX}:task-history-v1`

const getLocalStorage = () => {
  if (typeof window === 'undefined') return null
  return window.localStorage || null
}

export const getTaskHistoryStorageKey = (userId) =>
  `${TASK_HISTORY_STORAGE_KEY_PREFIX}:${userId || 'anonymous'}`

export const readTaskHistoryCache = (storageKey) => {
  const storage = getLocalStorage()
  if (!storage) return []

  try {
    const raw = storage.getItem(storageKey)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export const writeTaskHistoryCache = (storageKey, items) => {
  const storage = getLocalStorage()
  if (!storage) return

  try {
    storage.setItem(storageKey, JSON.stringify(items))
  } catch {
    void 0
  }
}

export const clearLegacyTaskHistoryCache = () => {
  const storage = getLocalStorage()
  if (!storage) return

  try {
    storage.removeItem(LEGACY_TASK_HISTORY_CACHE_KEY)
  } catch {
    void 0
  }
}

export const clearTaskHistoryLocalStorage = () => {
  const storage = getLocalStorage()
  if (!storage) return

  const keysToRemove = []
  for (let i = 0; i < storage.length; i += 1) {
    const key = storage.key(i)
    if (key && key.startsWith(`${TASK_HISTORY_STORAGE_KEY_PREFIX}:`)) {
      keysToRemove.push(key)
    }
  }

  keysToRemove.push(LEGACY_TASK_HISTORY_CACHE_KEY)

  for (const key of new Set(keysToRemove)) {
    storage.removeItem(key)
  }
}
