import { storeDelete, storeGet, storeSet } from '../storage/store'
export { TEMPERATURE, MAX_TOKENS } from '../../shared/inferenceDefaults'

export const SETTINGS_KEYS = {
  KEEP_AWAKE: 'vox.settings.keepAwake',
  IMESSAGE_PASSPHRASE: 'vox.settings.imessagePassphrase',
  TEMPERATURE: 'vox.settings.temperature',
  MAX_TOKENS: 'vox.settings.maxTokens'
}

const LEGACY_KEYS = {
  [SETTINGS_KEYS.KEEP_AWAKE]: ['keepAwake']
}

export function getSetting(key) {
  const value = storeGet(key)
  if (value !== undefined) return value

  const legacyKeys = LEGACY_KEYS[key] || []
  for (const legacyKey of legacyKeys) {
    const legacyValue = storeGet(legacyKey)
    if (legacyValue !== undefined) {
      storeSet(key, legacyValue)
      storeDelete(legacyKey)
      return legacyValue
    }
  }

  return undefined
}

export function setSetting(key, value) {
  storeSet(key, value)
  return value
}

export function deleteSetting(key) {
  return storeDelete(key)
}
