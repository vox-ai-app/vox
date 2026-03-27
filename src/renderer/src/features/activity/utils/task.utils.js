import { CheckCircle, CircleAlert, Clock, Loader } from 'lucide-react'

export { parseToolArgs } from '../../chat/utils/chat.text'

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

export const TERMINAL_STATUSES = new Set(['completed', 'failed', 'aborted', 'incomplete'])
export const RUNNING_STATUSES = new Set(['running', 'spawned'])

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

export function mergeSteps(dbSteps) {
  return (dbSteps || []).map((s) => ({
    step_id: s.step_id,
    instruction: s.instruction || '',
    status: s.status || 'completed'
  }))
}

export function computeEffectiveStatus(rawStatus, dbTask) {
  const result = dbTask?.result || ''
  const isTerminalDb = TERMINAL_STATUSES.has(dbTask?.status)
  if ((rawStatus === 'running' || rawStatus === 'spawned') && (result || isTerminalDb)) {
    return dbTask?.status || 'completed'
  }
  return rawStatus
}

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

export const STEP_STATUS_ICON = {
  completed: CheckCircle,
  failed: CircleAlert,
  aborted: CircleAlert,
  running: Loader,
  pending: Clock,
  skipped: Clock
}
