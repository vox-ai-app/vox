import { MAX_DETAIL_LENGTH, MAX_INSPECT_PAYLOAD_LENGTH } from './chat.constants'

export const normalizeText = (value) =>
  String(value || '')
    .replace(/\s+/g, ' ')
    .trim()

export const clipText = (value, maxLength = MAX_DETAIL_LENGTH) => {
  const normalized = normalizeText(value)
  if (!normalized) return ''
  if (normalized.length <= maxLength) return normalized
  return `${normalized.slice(0, maxLength)}...`
}

export const summarizeValue = (value, maxLength = MAX_DETAIL_LENGTH) => {
  if (value == null) return ''
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return clipText(String(value), maxLength)
  }
  try {
    return clipText(JSON.stringify(value), maxLength)
  } catch {
    return ''
  }
}

export const stringifyInspectValue = (value, maxLength = MAX_INSPECT_PAYLOAD_LENGTH) => {
  if (value == null) return ''
  let serialized = ''
  if (typeof value === 'string') {
    serialized = value
  } else {
    try {
      serialized = JSON.stringify(value, null, 2)
    } catch {
      serialized = String(value)
    }
  }
  const normalized = serialized.trim()
  if (!normalized) return ''
  if (normalized.length <= maxLength) return normalized
  return `${normalized.slice(0, maxLength)}\n...truncated`
}

export const parseToolArgs = (rawArgs) => {
  if (rawArgs && typeof rawArgs === 'object') return rawArgs
  if (typeof rawArgs === 'string') {
    try {
      const parsed = JSON.parse(rawArgs)
      return parsed && typeof parsed === 'object' ? parsed : {}
    } catch {
      return {}
    }
  }
  return {}
}

export const shortTaskId = (taskId) => {
  const normalized = String(taskId || '').trim()
  if (!normalized) return 'unknown'
  return normalized.slice(0, 8)
}
