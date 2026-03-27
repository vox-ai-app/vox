import Database from 'better-sqlite3'
import {
  execAbortable,
  esc,
  EXEC_TIMEOUT,
  writeTempScript,
  cleanupTemp
} from '@vox-ai-app/tools/exec'
import { ensureAppleMailConfigured } from '../../shared/index.js'
import { openMailPermissionSettings, checkMailAccess, throwFdaError } from './permission.js'
import { getAccountMap, findAccount } from './accounts.js'
import { ensureFresh } from './sync.js'
import { escapeLike, rowToEmail, parseBodyOutput } from './transform.js'

export { openMailPermissionSettings }

const DB = `${process.env.HOME}/Library/Mail/V10/MailData/Envelope Index`

const sqlite = (sql, params = []) => {
  const db = new Database(DB, { readonly: true, fileMustExist: true })
  try {
    return db.prepare(sql).all(...params)
  } finally {
    db.close()
  }
}

export const readEmailsMac = async (
  { folder = 'inbox', limit = 20, offset = 0, unreadOnly = false, search = '', account = '' },
  { signal } = {}
) => {
  if (!checkMailAccess()) throwFdaError()
  const [accountMap] = await Promise.all([getAccountMap(signal), ensureFresh(sqlite, signal)])
  const conditions = ['AND m.deleted = 0']
  const params = []
  if (folder.toLowerCase() === 'inbox') {
    conditions.push(`AND (
      (mb.url LIKE '%/INBOX' OR mb.url LIKE '%/Inbox')
      OR
      (mb.url LIKE '%5BGmail%5D/All%20Mail' AND EXISTS (
        SELECT 1 FROM labels l
        JOIN mailboxes lmb ON l.mailbox_id = lmb.ROWID
        WHERE l.message_id = m.ROWID
        AND (lmb.url LIKE '%/INBOX' OR lmb.url LIKE '%/Inbox')
      ))
    )`)
  } else {
    conditions.push(`AND mb.url LIKE ? ESCAPE '\\'`)
    params.push(`%/${escapeLike(folder)}`)
  }
  if (unreadOnly) conditions.push('AND m.read = 0')
  if (search) {
    const s = escapeLike(search)
    conditions.push(
      `AND (s.subject LIKE ? ESCAPE '\\' OR a.address LIKE ? ESCAPE '\\' OR a.comment LIKE ? ESCAPE '\\')`
    )
    params.push(`%${s}%`, `%${s}%`, `%${s}%`)
  }
  if (account) {
    const entry = findAccount(accountMap, account)
    if (!entry) throw new Error(`No mail account matching "${account}" found.`)
    conditions.push(`AND mb.url LIKE ?`)
    params.push(`%${entry[0]}%`)
  }
  const sql = `
    SELECT m.ROWID, s.subject, a.address, COALESCE(a.comment, '') as comment, m.date_received, m.read, m.flagged, mb.url
    FROM messages m
    JOIN subjects s ON m.subject = s.ROWID
    JOIN addresses a ON m.sender = a.ROWID
    JOIN mailboxes mb ON m.mailbox = mb.ROWID
    WHERE 1=1
    ${conditions.join('\n    ')}
    ORDER BY m.date_received DESC
    LIMIT ? OFFSET ?`
  params.push(Number(limit), Number(offset))
  const rows = sqlite(sql, params)
  return rows.map((row) => rowToEmail(row, accountMap)).filter((r) => r.sender && r.subject)
}

export const getEmailBodyMac = async (
  { sender = '', subject = '', messageId = '' } = {},
  { signal } = {}
) => {
  if (!checkMailAccess()) throwFdaError()
  await ensureAppleMailConfigured(signal)
  const script = messageId
    ? `tell application "Mail"
  set targetId to ${Number(messageId)}
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
        set m to first message of mb whose id is targetId
        set attNames to ""
        repeat with att in mail attachments of m
          set attNames to attNames & name of att & ","
        end repeat
        return (id of m as string) & "\\n---BODY:" & content of m & "\\n---ATTACHMENTS:" & (count of mail attachments of m) & ":" & attNames
      end try
    end if
  end repeat
  repeat with acct in every account
    repeat with mb in every mailbox of acct
      try
        set m to first message of mb whose id is targetId
        set attNames to ""
        repeat with att in mail attachments of m
          set attNames to attNames & name of att & ","
        end repeat
        return (id of m as string) & "\\n---BODY:" & content of m & "\\n---ATTACHMENTS:" & (count of mail attachments of m) & ":" & attNames
      end try
    end repeat
  end repeat
  return "NOT_FOUND"
end tell`
    : `tell application "Mail"
  set sQ to "${esc(sender)}"
  set subQ to "${esc(subject)}"
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
        set n to 0
        repeat with m in (messages of mb)
          set ok to true
          if sQ is not "" and sender of m does not contain sQ then set ok to false
          if ok and subQ is not "" and subject of m does not contain subQ then set ok to false
          if ok then
            set attNames to ""
            repeat with att in mail attachments of m
              set attNames to attNames & name of att & ","
            end repeat
            return (id of m as string) & "\\n---BODY:" & content of m & "\\n---ATTACHMENTS:" & (count of mail attachments of m) & ":" & attNames
          end if
          set n to n + 1
          if n >= 50 then exit repeat
        end repeat
      end try
    end if
  end repeat
  return "NOT_FOUND"
end tell`
  const scriptFile = await writeTempScript(script, 'scpt')
  try {
    const { stdout } = await execAbortable(
      `osascript "${scriptFile}"`,
      { timeout: EXEC_TIMEOUT },
      signal
    )
    return parseBodyOutput(stdout.trim())
  } finally {
    await cleanupTemp(scriptFile)
  }
}
