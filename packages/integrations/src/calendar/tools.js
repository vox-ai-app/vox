import { CALENDAR_TOOL_DEFINITIONS } from './def.js'
import * as mac from './mac/index.js'
import { resolveExecutors, makePlatformTools } from '../shared/platform.js'

const executors = resolveExecutors(
  {
    darwin: {
      list_events: mac.listEventsMac,
      create_event: mac.createEventMac,
      update_event: mac.updateEventMac,
      delete_event: mac.deleteEventMac
    }
  },
  'Calendar'
)

export const CALENDAR_TOOLS = makePlatformTools(CALENDAR_TOOL_DEFINITIONS, executors)
