import { execAbortable, EXEC_TIMEOUT, shellEsc } from '@vox-ai-app/tools/exec'

export const listShortcuts = async (signal) => {
  const { stdout } = await execAbortable('shortcuts list', { timeout: EXEC_TIMEOUT }, signal)
  return String(stdout || '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
}

export const runShortcut = async (name, input, signal) => {
  const base = `shortcuts run '${shellEsc(name)}'`
  if (input === undefined || input === null) {
    const { stdout } = await execAbortable(base, { timeout: EXEC_TIMEOUT }, signal)
    return stdout.trim()
  }
  const payload = typeof input === 'string' ? input : JSON.stringify(input)
  const { stdout } = await execAbortable(
    `echo '${shellEsc(payload)}' | ${base}`,
    { timeout: EXEC_TIMEOUT },
    signal
  )
  return stdout.trim()
}

export const getShortcut = async (name, signal) => {
  const all = await listShortcuts(signal)
  const match = all.find((s) => s.toLowerCase() === name.toLowerCase())
  return match ? { name: match } : null
}
