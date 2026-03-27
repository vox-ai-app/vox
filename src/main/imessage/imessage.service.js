import { shell } from 'electron'
import { logger } from '../logger'
import { emitAll } from '../ipc/shared'
import { sendMessageAndWait } from '../chat/chat.session'
import { createIMessageService } from '@vox-ai-app/integrations/imessage'

const service = createIMessageService({
  onMessage: async (text) => {
    try {
      return await sendMessageAndWait({ content: text })
    } catch (error) {
      logger.error('[imessage] Failed to send local chat message:', error?.message)
      return null
    }
  },
  onTranscript: (text) => {
    emitAll('chat:event', { type: 'transcript', data: { content: text } })
  },
  onOpenSettings: () => {
    shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles')
  },
  logger
})

export const getPassphrase = () => service.getPassphrase()
export const startWatching = (passphrase) => service.start(passphrase)
export const stopWatching = () => service.stop()
export const listConversations = () => service.listConversations()
export const listContacts = () => service.listContacts()
