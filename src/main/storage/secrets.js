import { safeStorage } from 'electron'
import { storeGet, storeSet } from './store.js'

const SECRETS_KEY = 'vox.tool.secrets'

function encryptValue(value) {
  if (!safeStorage.isEncryptionAvailable()) return value
  return safeStorage.encryptString(String(value)).toString('base64')
}

function decryptValue(encrypted) {
  if (!safeStorage.isEncryptionAvailable()) return encrypted
  try {
    return safeStorage.decryptString(Buffer.from(encrypted, 'base64'))
  } catch {
    return encrypted
  }
}

export function getToolSecrets(toolName) {
  const all = storeGet(SECRETS_KEY) || {}
  const toolSecrets = all[toolName] || {}
  const result = {}
  for (const [k, v] of Object.entries(toolSecrets)) {
    result[k] = decryptValue(v)
  }
  return result
}

export function setToolSecret(toolName, key, value) {
  const all = storeGet(SECRETS_KEY) || {}
  if (!all[toolName]) all[toolName] = {}
  all[toolName][key] = encryptValue(value)
  storeSet(SECRETS_KEY, all)
}

export function deleteToolSecret(toolName, key) {
  const all = storeGet(SECRETS_KEY) || {}
  if (all[toolName]) {
    delete all[toolName][key]
    storeSet(SECRETS_KEY, all)
  }
}

export function listToolSecretKeys(toolName) {
  const all = storeGet(SECRETS_KEY) || {}
  return Object.keys(all[toolName] || {})
}
