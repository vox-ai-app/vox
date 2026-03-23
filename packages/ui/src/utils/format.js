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

export const toolLabel = (name) => {
  const n = String(name || '').toLowerCase()
  if (n === 'read_local_file' || n === 'read_file') return 'Read file'
  if (n === 'write_local_file' || n === 'write_file') return 'Write file'
  if (n === 'list_local_files' || n === 'list_directory' || n === 'list_files') return 'List files'
  if (n === 'execute_code' || n.includes('execute') || n === 'run_code') return 'Run code'
  if (n === 'search_context' || n === 'query_memory' || n.includes('context'))
    return 'Search memory'
  if (n.includes('web_search') || n.includes('search_web')) return 'Search web'
  if (n.includes('search')) return 'Search'
  if (n === 'spawn_task' || n.includes('spawn')) return 'Launch agent'
  if (n === 'update_journal' || n.includes('journal')) return 'Update notes'
  if (n.includes('fetch') || n === 'http_request') return 'Fetch URL'
  if (n.includes('index')) return 'Index content'
  return name || 'Use tool'
}

export function relativeTime(iso) {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  const s = Math.round(diff / 1000)
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

export function elapsedLabel(startIso, endIso) {
  if (!startIso) return null
  const startMs = new Date(startIso).getTime()
  const endMs = endIso ? new Date(endIso).getTime() : Date.now()
  const s = Math.round((endMs - startMs) / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  const r = s % 60
  return r > 0 ? `${m}m ${r}s` : `${m}m`
}

export function formatBytes(bytes) {
  if (bytes == null || isNaN(bytes)) return '—'
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = bytes / Math.pow(1024, i)
  return `${i === 0 ? value : value.toFixed(1)} ${units[i]}`
}

export function formatIndexedTime(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  })
}

export function getStatusLabel(status) {
  const map = {
    indexed: 'Indexed',
    pending: 'Pending',
    indexing: 'Indexing',
    failed: 'Failed',
    skipped: 'Skipped',
    not_indexed: 'Not indexed'
  }
  return map[status] || status || '—'
}

export const PHASE = Object.freeze({
  IDLE: 'idle',
  SENDING: 'sending',
  STREAMING: 'streaming',
  ABORTING: 'aborting'
})

export const TERMINAL_STATUSES = new Set(['completed', 'failed', 'aborted', 'incomplete'])
export const RUNNING_STATUSES = new Set(['running', 'spawned'])

export const TASK_STATUS_COLOR = {
  running: 'pink',
  completed: 'green',
  failed: 'red',
  aborted: 'muted',
  incomplete: 'red',
  spawned: 'pink',
  pending: 'muted'
}

export const TASK_STATUS_LABEL = {
  running: 'Running',
  completed: 'Done',
  failed: 'Failed',
  aborted: 'Stopped',
  incomplete: 'Needs work',
  spawned: 'Starting',
  pending: 'Pending'
}

export const PRIMARY_ARG_KEYS = [
  'query',
  'path',
  'filePath',
  'command',
  'url',
  'text',
  'content',
  'message',
  'code',
  'input',
  'instruction',
  'topic',
  'value',
  'name'
]

export function getToolSub(toolName, argsObj) {
  const n = String(toolName || '').toLowerCase()
  if (n === 'execute_code' || n.includes('execute') || n === 'run_code') {
    const cmds = argsObj?.commands
    if (Array.isArray(cmds) && cmds.length > 0) {
      const first = String(cmds[0]).trim()
      const preview = first.length > 80 ? `${first.slice(0, 80)}\u2026` : first
      return cmds.length > 1 ? `${preview}  +${cmds.length - 1} more` : preview
    }
  }
  return null
}

export function getOutcomeBadge(toolName, rawResult) {
  if (!rawResult) return null
  const n = String(toolName || '').toLowerCase()
  if (n === 'execute_code' || n.includes('execute') || n === 'run_code') {
    const r = typeof rawResult === 'string' ? null : rawResult
    if (!r) return null
    if (r.timedOut) return { label: 'timed out', type: 'timeout' }
    if (r.exitCode !== undefined && r.exitCode !== 0) return { label: 'failed', type: 'error' }
    if (r.exitCode === 0) return { label: 'ok', type: 'success' }
  }
  return null
}
