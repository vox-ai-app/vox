import { execAsync, execAbortable, writeTempScript, cleanupTemp } from '@vox-ai-app/tools/exec'

const SYNC_RETRY_DELAY = 2_000
const SYNC_MAX_RETRIES = 3
const FRESH_CACHE_TTL = 10_000
let _freshCache = null

const getLatestIds = async (signal) => {
  const script = `tell application "Mail"
  set output to ""
  repeat with acct in every account
    set mb to missing value
    try
      set mb to mailbox "INBOX" of acct
    end try
    if mb is missing value then
      try
        set mb to mailbox "Inbox" of acct
      end try
    end if
    if mb is not missing value then
      try
        set m to message 1 of mb
        set output to output & (id of acct) & tab & (id of m) & linefeed
      end try
    end if
  end repeat
  return output
end tell`
  const scriptFile = await writeTempScript(script, 'scpt')
  try {
    const { stdout } = await execAbortable(`osascript "${scriptFile}"`, { timeout: 15_000 }, signal)
    return String(stdout)
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .map((line) => {
        const [, msgId] = line.split('\t')
        return msgId ? Number(msgId) : null
      })
      .filter(Boolean)
  } finally {
    await cleanupTemp(scriptFile)
  }
}

const triggerSync = () => {
  const script = `tell application "Mail"
  repeat with acct in every account
    try
      synchronize acct
    end try
  end repeat
end tell`
  writeTempScript(script, 'scpt')
    .then((f) => execAsync(`osascript "${f}"`).finally(() => cleanupTemp(f)))
    .catch(() => {})
}

export const checkIdsInDb = (sqlite, ids) => {
  if (!ids.length) return true
  const placeholders = ids.map(() => '?').join(',')
  const row = sqlite(`SELECT COUNT(*) as count FROM messages WHERE ROWID IN (${placeholders})`, ids)
  return row[0]?.count === ids.length
}

export const ensureFresh = async (sqlite, signal) => {
  if (_freshCache && Date.now() - _freshCache.ts < FRESH_CACHE_TTL) return
  let ids
  try {
    ids = await getLatestIds(signal)
  } catch {
    _freshCache = { ts: Date.now() }
    return
  }
  try {
    if (checkIdsInDb(sqlite, ids)) {
      _freshCache = { ts: Date.now() }
      return
    }
  } catch {
    _freshCache = { ts: Date.now() }
    return
  }
  for (let i = 0; i < SYNC_MAX_RETRIES; i++) {
    triggerSync()
    await new Promise((r) => setTimeout(r, SYNC_RETRY_DELAY))
    try {
      if (checkIdsInDb(sqlite, ids)) {
        _freshCache = { ts: Date.now() }
        return
      }
    } catch {
      break
    }
  }
  _freshCache = { ts: Date.now() }
}
