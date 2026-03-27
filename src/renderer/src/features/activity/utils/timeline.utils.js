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

export const getToolSub = (toolName, argsObj) => {
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

export const getOutcomeBadge = (toolName, rawResult) => {
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
