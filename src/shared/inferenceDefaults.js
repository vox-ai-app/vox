// src/shared/inferenceDefaults.js
export const TEMPERATURE = {
  key: 'vox.settings.temperature', // ← must match SETTINGS_KEYS.TEMPERATURE
  default: 0.7,
  min: 0.0,
  max: 2.0
}

export const MAX_TOKENS = {
  key: 'vox.settings.maxTokens', // ← must match SETTINGS_KEYS.MAX_TOKENS
  default: 4096,
  min: 256,
  max: 32768
}
