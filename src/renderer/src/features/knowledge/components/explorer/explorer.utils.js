export const getNodeKey = (rootPath, nodePath) => `${rootPath}::${nodePath || rootPath}`

export const getPathLabel = (path) => {
  const value = String(path || '')
  if (!value) {
    return 'Indexed Files'
  }

  if (value === '/' || value === '\\') {
    return value
  }

  const normalized = value.replace(/[\\/]+$/, '')
  const segments = normalized.split(/[\\/]/).filter(Boolean)
  return segments.length ? segments[segments.length - 1] : value
}

export const compareExplorerNodes = (left, right) => {
  if (left.type !== right.type) {
    return left.type === 'directory' ? -1 : 1
  }

  return String(left.name || '').localeCompare(String(right.name || ''), undefined, {
    sensitivity: 'base'
  })
}

export const formatBytes = (value) => {
  const size = Number(value)
  if (!Number.isFinite(size) || size <= 0) {
    return '0 B'
  }

  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let unitIndex = 0
  let normalizedSize = size

  while (normalizedSize >= 1024 && unitIndex < units.length - 1) {
    normalizedSize /= 1024
    unitIndex += 1
  }

  const digits = normalizedSize >= 10 || unitIndex === 0 ? 0 : 1
  return `${normalizedSize.toFixed(digits)} ${units[unitIndex]}`
}

export const formatIndexedTime = (value) => {
  if (!value) {
    return 'Not indexed'
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return 'Unknown'
  }

  return date.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

const STATUS_LABELS = {
  indexed: 'Indexed',
  pending: 'Pending',
  indexing: 'Indexing',
  failed: 'Failed',
  ignored: 'Ignored',
  out_of_scope: 'Ignored',
  not_indexed: 'Not indexed'
}

export const getStatusLabel = (status) => STATUS_LABELS[status] || STATUS_LABELS.not_indexed

export const EMPTY_NODE_STATE = {
  loading: false,
  loaded: false,
  error: '',
  children: []
}
