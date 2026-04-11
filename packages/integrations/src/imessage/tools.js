import { IMESSAGE_TOOL_DEFINITIONS } from './def.js'
import { listConversations, listContacts } from './mac/data.js'
import { sendReply } from './mac/reply.js'
import { resolveExecutors, makePlatformTools } from '../shared/platform.js'

const listImessageConversations = async (_payload, _opts) => {
  const conversations = listConversations()
  return { conversations }
}

const listImessageContacts = async (_payload, _opts) => {
  const contacts = listContacts()
  return { contacts }
}

const sendImessage = async (payload, _opts) => {
  const handle = payload?.handle
  const text = payload?.text
  if (!handle) throw new Error('"handle" is required.')
  if (!text) throw new Error('"text" is required.')
  await sendReply(handle, String(text))
  return { ok: true, handle }
}

const executors = resolveExecutors(
  {
    darwin: {
      list_imessage_conversations: listImessageConversations,
      list_imessage_contacts: listImessageContacts,
      send_imessage: sendImessage
    }
  },
  'iMessage'
)

export const IMESSAGE_TOOLS = makePlatformTools(IMESSAGE_TOOL_DEFINITIONS, executors)
