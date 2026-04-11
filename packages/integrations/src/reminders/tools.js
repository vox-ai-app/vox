import { REMINDERS_TOOL_DEFINITIONS } from './def.js'
import * as mac from './mac/index.js'
import { resolveExecutors, makePlatformTools } from '../shared/platform.js'

const executors = resolveExecutors(
  {
    darwin: {
      list_reminders: mac.listRemindersMac,
      create_reminder: mac.createReminderMac,
      complete_reminder: mac.completeReminderMac
    }
  },
  'Reminders'
)

export const REMINDERS_TOOLS = makePlatformTools(REMINDERS_TOOL_DEFINITIONS, executors)
