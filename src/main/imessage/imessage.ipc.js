import { createHandler, registerHandler } from '../ipc/shared'
import { deleteSetting, getSetting, setSetting, SETTINGS_KEYS } from '../config/settings'
import {
  getPassphrase,
  listContacts,
  listConversations,
  startWatching,
  stopWatching
} from './imessage.service'

export function registerImessageIpc() {
  registerHandler(
    'imessage:get-status',
    createHandler(() => {
      const activePassphrase = getPassphrase()
      const savedPassphrase = getSetting(SETTINGS_KEYS.IMESSAGE_PASSPHRASE)
      return {
        active: Boolean(activePassphrase),
        saved: Boolean(savedPassphrase),
        passphrase: activePassphrase || savedPassphrase || null
      }
    })
  )

  registerHandler(
    'imessage:start',
    createHandler((_e, { passphrase }) => {
      const result = startWatching(passphrase)
      setSetting(SETTINGS_KEYS.IMESSAGE_PASSPHRASE, result.passphrase)
      return { active: true, saved: true, passphrase: result.passphrase }
    })
  )

  registerHandler(
    'imessage:stop',
    createHandler(() => {
      stopWatching()
      deleteSetting(SETTINGS_KEYS.IMESSAGE_PASSPHRASE)
      return { active: false, saved: false, passphrase: null }
    })
  )

  registerHandler(
    'imessage:list-conversations',
    createHandler(() => listConversations())
  )

  registerHandler(
    'imessage:list-contacts',
    createHandler(() => listContacts())
  )
}
