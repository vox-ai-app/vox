import { SCREEN_TOOLS } from './screen/tools.js'
import { MAIL_TOOLS } from './mail/tools.js'
import { IMESSAGE_TOOLS } from './imessage/tools.js'
import { CONTACTS_TOOLS } from './contacts/tools.js'
import { SHORTCUTS_TOOLS } from './shortcuts/tools.js'
import { MUSIC_TOOLS } from './music/tools.js'
import { CALENDAR_TOOLS } from './calendar/tools.js'
import { REMINDERS_TOOLS } from './reminders/tools.js'

export const ALL_INTEGRATION_TOOLS = [
  ...SCREEN_TOOLS,
  ...MAIL_TOOLS,
  ...IMESSAGE_TOOLS,
  ...CONTACTS_TOOLS,
  ...SHORTCUTS_TOOLS,
  ...MUSIC_TOOLS,
  ...CALENDAR_TOOLS,
  ...REMINDERS_TOOLS
]
export {
  SCREEN_TOOLS,
  MAIL_TOOLS,
  IMESSAGE_TOOLS,
  CONTACTS_TOOLS,
  SHORTCUTS_TOOLS,
  MUSIC_TOOLS,
  CALENDAR_TOOLS,
  REMINDERS_TOOLS
}
