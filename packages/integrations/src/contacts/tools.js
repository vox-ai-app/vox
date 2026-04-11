import { CONTACTS_TOOL_DEFINITIONS } from './def.js'
import { searchContactsMac } from './mac/index.js'
import { resolveExecutors, makePlatformTools } from '../shared/platform.js'

const searchContacts = (payload, opts) => {
  const query = String(payload?.query ?? payload?.name ?? payload?.q ?? '').trim()
  if (!query) throw new Error('"query" is required.')
  const limit = Math.min(Math.max(1, Number(payload?.limit) || 25), 200)
  const offset = Math.max(0, Number(payload?.offset) || 0)
  return searchContactsMac(query, opts).then((contacts) => {
    const total = contacts.length
    const page = contacts.slice(offset, offset + limit)
    return {
      query,
      count: page.length,
      total,
      limit,
      offset,
      has_more: offset + limit < total,
      contacts: page
    }
  })
}

const executors = resolveExecutors(
  {
    darwin: { search_contacts: searchContacts }
  },
  'Contacts'
)

export const CONTACTS_TOOLS = makePlatformTools(CONTACTS_TOOL_DEFINITIONS, executors)
