import { shell } from 'electron'
import { execAbortable } from '@vox-ai-app/tools/exec'
const AUTOMATION_PERMISSION_MESSAGE =
  'Vox needs permission to control Mail. Please grant it in System Settings → Privacy & Security → Automation → Vox → Mail.'
const APPLE_MAIL_SETUP_MESSAGE =
  'macOS mail actions in Vox require Apple Mail with at least one configured account. If you use Gmail or Outlook elsewhere, add the account in Apple Mail first. If Mail is already set up, check macOS Automation permissions for Vox and try again.'
const isAutomationDeniedError = (err) => {
  const msg = String(err?.message || err?.stderr || '').toLowerCase()
  return (
    msg.includes('not allowed to send apple events') ||
    msg.includes('apple event handler failed') ||
    msg.includes('-1743') ||
    msg.includes('access not allowed')
  )
}
export const openMailAutomationSettings = () => {
  shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Automation')
}
export const getAppleMailAccounts = async (signal) => {
  try {
    const { stdout } = await execAbortable(
      'osascript -e \'tell application "Mail" to return name of every account\'',
      {
        timeout: 15_000
      },
      signal
    )
    return String(stdout)
      .trim()
      .split(',')
      .map((name) => name.trim())
      .filter(Boolean)
  } catch (err) {
    if (isAutomationDeniedError(err)) {
      openMailAutomationSettings()
      throw Object.assign(new Error(AUTOMATION_PERMISSION_MESSAGE), {
        code: 'MAIL_AUTOMATION_REQUIRED'
      })
    }
    throw new Error(APPLE_MAIL_SETUP_MESSAGE)
  }
}
export const ensureAppleMailConfigured = async (signal) => {
  const accounts = await getAppleMailAccounts(signal)
  if (!accounts.length) throw new Error(APPLE_MAIL_SETUP_MESSAGE)
  return accounts
}
export { APPLE_MAIL_SETUP_MESSAGE }
