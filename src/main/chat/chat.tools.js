import { getDeclarations } from '@vox-ai-app/tools/registry'
import { storeGet } from '../storage/store'
import { definition as spawnDef } from './spawn.tool'
import { getMcpToolDefinitions } from '../mcp/mcp.service'

const SAVE_USER_INFO_DEF = {
  name: 'save_user_info',
  description:
    'Persist a piece of information about the user for future reference. Use this when the user tells you something about themselves that would be useful to remember (name, location, job, preferences, etc.).',
  parameters: {
    type: 'object',
    properties: {
      info_key: {
        type: 'string',
        description:
          'Short identifier for what this information is (e.g. "name", "location", "preferred_language", "occupation")'
      },
      info_value: {
        type: 'string',
        description: 'The value to store'
      }
    },
    required: ['info_key', 'info_value']
  }
}

const SCHEDULE_TASK_DEF = {
  name: 'schedule_task',
  description:
    'Schedule a recurring or one-time agentic task. The task runs the full agent with tool access at the specified times. Only runs while Vox is open. Common cron patterns: daily at 10am = "0 10 * * *", every weekday at 9am = "0 9 * * 1-5", every 30 min = "*/30 * * * *", first of month at noon = "0 12 1 * *".',
  parameters: {
    type: 'object',
    properties: {
      instructions: {
        type: 'string',
        description: 'The prompt/instructions the agent will execute each time the schedule fires.'
      },
      cron_expression: {
        type: 'string',
        description:
          'Standard 5-field cron expression (minute hour day-of-month month day-of-week).'
      },
      timezone: {
        type: 'string',
        description: 'IANA timezone (e.g. "America/New_York"). Defaults to the system timezone.'
      },
      once: {
        type: 'boolean',
        description: 'If true, the schedule auto-removes after firing once. Default false.'
      }
    },
    required: ['instructions', 'cron_expression']
  }
}

const LIST_SCHEDULES_DEF = {
  name: 'list_schedules',
  description: 'List all scheduled tasks with their next run time, cron expression, and status.',
  parameters: {
    type: 'object',
    properties: {}
  }
}

const REMOVE_SCHEDULE_DEF = {
  name: 'remove_schedule',
  description:
    'Cancel and remove a scheduled task by its ID. Use list_schedules first to find the ID.',
  parameters: {
    type: 'object',
    properties: {
      schedule_id: {
        type: 'string',
        description: 'The schedule ID to remove.'
      }
    },
    required: ['schedule_id']
  }
}

const FIND_TOOLS_DEF = {
  name: 'find_tools',
  description:
    'Search for available custom tools by name or capability. Returns matching tools with name, description, source_type, and parameter schema. Call this before run_tool to discover custom tools.',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Name or natural language description of the capability you need.'
      }
    },
    required: ['query']
  }
}

const RUN_TOOL_DEF = {
  name: 'run_tool',
  description:
    'Execute a custom tool by exact name. Call find_tools first to discover the tool and get its parameter schema, then call run_tool with the correct args.',
  parameters: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'Exact tool name as returned by find_tools.'
      },
      args: {
        type: 'object',
        description: 'Arguments matching the tool parameter schema.'
      }
    },
    required: ['name']
  }
}

let _toolDefinitions = null

function buildToolDefinitions() {
  const defs = [...getDeclarations()]

  defs.push(spawnDef)
  defs.push(SAVE_USER_INFO_DEF)
  defs.push({
    name: 'get_task',
    description: 'Get the full details and result of a specific background task by its ID.',
    parameters: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: 'The task ID to look up' }
      },
      required: ['taskId']
    }
  })
  defs.push({
    name: 'search_tasks',
    description:
      'Search past background tasks by keyword query or filter by status. Use query for semantic/keyword search, status to filter.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Keyword search over task instructions and results' },
        status: {
          type: 'string',
          enum: ['completed', 'failed', 'aborted', 'running', 'queued', 'incomplete'],
          description: 'Filter by task status'
        }
      }
    }
  })

  defs.push(SCHEDULE_TASK_DEF)
  defs.push(LIST_SCHEDULES_DEF)
  defs.push(REMOVE_SCHEDULE_DEF)

  let hasMcpTools = false
  try {
    hasMcpTools = getMcpToolDefinitions().length > 0
  } catch {
    /* MCP not ready */
  }

  const hasCustomTools = (() => {
    try {
      const ct = storeGet('customTools') || []
      return ct.some((t) => t.is_enabled !== false && t.name)
    } catch {
      return false
    }
  })()

  if (hasCustomTools || hasMcpTools) {
    defs.push(FIND_TOOLS_DEF)
    defs.push(RUN_TOOL_DEF)
  }

  _toolDefinitions = defs
  return defs
}

export function getToolDefinitions() {
  return _toolDefinitions || buildToolDefinitions()
}

export function invalidateToolDefinitions() {
  _toolDefinitions = null
}
