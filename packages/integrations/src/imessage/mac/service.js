import {
  canReadDb,
  getMaxRowId,
  queryNewMessages,
  listConversations as listConversationsFromDb,
  listContacts as listContactsFromDb
} from './data.js'
import { sendReply } from './reply.js'

const POLL_INTERVAL_MS = 3_000
const REPLY_TIMEOUT_MS = 90_000
const FDA_ERROR_MESSAGE =
  'Vox needs Full Disk Access to read Messages. Opening System Settings → Privacy & Security → Full Disk Access — please enable it for Vox and try again.'

export const createIMessageService = ({
  onMessage,
  onTranscript,
  onOpenSettings,
  logger,
  pollIntervalMs = POLL_INTERVAL_MS
} = {}) => {
  const _log = logger ?? console

  let _pollTimer = null
  let _passphrase = null
  let _lastSeenRowId = 0

  const openSettings = () => {
    onOpenSettings?.()
  }

  const handleIncomingMessage = async (row) => {
    if (!_passphrase) return
    const raw = String(row.text || '')
    const newline = raw.indexOf('\n')
    if (newline === -1) return
    const firstLine = raw.slice(0, newline).trim()
    if (firstLine !== _passphrase) return
    const text = raw.slice(newline + 1).trim()
    if (!text) return

    const sender = row.reply_handle
    _log.info('[imessage] Passphrase match, reply_handle:', sender, 'text:', text.slice(0, 60))
    if (!sender) return

    onTranscript?.(text, sender)

    let aiText = null
    try {
      aiText = await Promise.race([
        onMessage(text, sender),
        new Promise((resolve) => setTimeout(() => resolve(null), REPLY_TIMEOUT_MS))
      ])
    } catch (err) {
      _log.error('[imessage] onMessage error:', err?.message)
      return
    }

    if (!aiText) {
      _log.warn('[imessage] No AI response received')
      return
    }

    try {
      await sendReply(sender, aiText)
    } catch (err) {
      _log.error('[imessage] Reply failed:', err?.message)
    }
  }

  const poll = async () => {
    if (!_passphrase || !canReadDb()) return
    try {
      const rows = queryNewMessages(_lastSeenRowId)
      for (const row of rows) {
        if (row.ROWID > _lastSeenRowId) _lastSeenRowId = row.ROWID
        await handleIncomingMessage(row)
      }
    } catch (err) {
      _log.error('[imessage] Poll error:', err?.message)
    }
  }

  const start = (passphrase) => {
    if (!canReadDb()) {
      openSettings()
      throw Object.assign(new Error(FDA_ERROR_MESSAGE), { code: 'IMESSAGE_FDA_REQUIRED' })
    }
    if (!passphrase?.trim()) throw new Error('Passphrase cannot be empty.')

    stop()
    _passphrase = passphrase.trim()
    _lastSeenRowId = getMaxRowId()
    _pollTimer = setInterval(poll, pollIntervalMs)
    _log.info('[imessage] Watching all messages with passphrase')
    return { passphrase: _passphrase }
  }

  const stop = () => {
    if (_pollTimer) {
      clearInterval(_pollTimer)
      _pollTimer = null
    }
    _passphrase = null
    _lastSeenRowId = 0
  }

  const getPassphrase = () => _passphrase

  const listConversations = () => {
    if (!canReadDb()) {
      openSettings()
      throw Object.assign(new Error(FDA_ERROR_MESSAGE), { code: 'IMESSAGE_FDA_REQUIRED' })
    }
    return listConversationsFromDb()
  }

  const listContacts = () => {
    return listContactsFromDb((err) => {
      _log.warn('[imessage] Skipping AddressBook DB:', err?.message)
    })
  }

  return { start, stop, getPassphrase, listConversations, listContacts, openSettings }
}
