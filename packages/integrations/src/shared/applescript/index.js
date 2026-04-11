import {
  execAbortable,
  esc,
  EXEC_TIMEOUT,
  writeTempScript,
  cleanupTemp
} from '@vox-ai-app/tools/exec'

export { esc }

export const toAppleDate = (iso) => {
  const d = new Date(iso)
  const m = d.getMonth() + 1
  const day = d.getDate()
  const y = d.getFullYear()
  const h = d.getHours()
  const min = d.getMinutes()
  return `date "${m}/${day}/${y} ${h}:${String(min).padStart(2, '0')}:00"`
}

const isAutomationDeniedError = (err) => {
  const msg = String(err?.message || err?.stderr || '').toLowerCase()
  return (
    msg.includes('not allowed to send apple events') ||
    msg.includes('apple event handler failed') ||
    msg.includes('-1743') ||
    msg.includes('access not allowed')
  )
}

export const runAppleScript = async (lines, signal, { timeout = EXEC_TIMEOUT } = {}) => {
  const script = Array.isArray(lines) ? lines.join('\n') : lines
  const scriptFile = await writeTempScript(script, 'scpt')
  try {
    const { stdout } = await execAbortable(`osascript "${scriptFile}"`, { timeout }, signal)
    const out = stdout.trim()
    if (out.startsWith('ERROR:')) throw new Error(out.slice(6))
    return out
  } catch (err) {
    if (isAutomationDeniedError(err)) {
      const wrapped = new Error(
        'Vox needs permission to send Apple Events. Please grant it in System Settings → Privacy & Security → Automation.'
      )
      wrapped.code = 'AUTOMATION_DENIED'
      wrapped.original = err
      throw wrapped
    }
    throw err
  } finally {
    await cleanupTemp(scriptFile)
  }
}
