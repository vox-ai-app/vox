import { execAbortable, writeTempScript, cleanupTemp } from '@vox-ai-app/tools/exec'
import { ensureAppleMailConfigured } from '../../shared/index.js'

const ACCOUNT_CACHE_TTL = 60_000
let _accountCache = null

export const uuidFromUrl = (url) => {
  const m = url && url.match(/\/\/([0-9A-F-]{36})\//i)
  return m ? m[1].toUpperCase() : null
}

export const getAccountMap = async (signal) => {
  if (_accountCache && Date.now() - _accountCache.ts < ACCOUNT_CACHE_TTL) {
    return _accountCache.map
  }
  await ensureAppleMailConfigured(signal)
  const script = `tell application "Mail"
  set output to ""
  repeat with a in every account
    set output to output & (id of a) & tab & (name of a) & tab & (email addresses of a) & linefeed
  end repeat
  return output
end tell`
  const scriptFile = await writeTempScript(script, 'scpt')
  try {
    const { stdout } = await execAbortable(`osascript "${scriptFile}"`, { timeout: 15_000 }, signal)
    const map = {}
    String(stdout)
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .forEach((line) => {
        const parts = line.split('\t')
        if (parts.length >= 2) {
          const uuid = parts[0].trim().toUpperCase()
          const name = parts[1].trim()
          const email = (parts[2] || '').trim().toLowerCase()
          map[uuid] = { name, email }
        }
      })
    _accountCache = { map, ts: Date.now() }
    return map
  } finally {
    await cleanupTemp(scriptFile)
  }
}

export const findAccount = (accountMap, query) => {
  const q = query.toLowerCase()
  return Object.entries(accountMap).find(
    ([, { name, email }]) => name.toLowerCase().includes(q) || email.includes(q)
  )
}
