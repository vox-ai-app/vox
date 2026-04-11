import { storeDelete, storeGet, storeSet } from '../storage/store'

export const SETTINGS_KEYS = {
  KEEP_AWAKE: 'vox.settings.keepAwake',
  IMESSAGE_PASSPHRASE: 'vox.settings.imessagePassphrase',
  TEMPERATURE: 'vox.settings.temperature',
  MAX_TOKENS: 'vox.settings.maxTokens',
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

export const TEMPERATURE = {
  key: SETTINGS_KEYS.TEMPERATURE,
  default: 0.7,
  min: 0.0,
  max: 2.0,
};

export const MAX_TOKENS = {
  key: SETTINGS_KEYS.MAX_TOKENS,
  default: 4096,
  min: 256,
  max: 32768,
};