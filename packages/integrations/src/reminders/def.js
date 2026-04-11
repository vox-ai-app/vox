export const REMINDERS_TOOL_DEFINITIONS = [
  {
    name: 'list_reminders',
    description:
      "List reminders from the user's Reminders.app on macOS. Returns reminders with title, due date, priority, completion status, and list name. Supports pagination via limit/offset.",
    parameters: {
      type: 'object',
      properties: {
        list: {
          type: 'string',
          description:
            'Optional reminder list name to filter by (partial match, case-insensitive). If omitted, returns reminders from all lists.'
        },
        include_completed: {
          type: 'boolean',
          description: 'If true, include completed reminders. Default false (only incomplete).'
        },
        limit: {
          type: 'number',
          description: 'Max number of reminders to return (1–200). Default 25.'
        },
        offset: {
          type: 'number',
          description: 'Number of reminders to skip for pagination. Default 0.'
        }
      },
      required: []
    }
  },
  {
    name: 'create_reminder',
    description:
      'Create a new reminder in Reminders.app on macOS. Returns confirmation with the created reminder details.',
    parameters: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'Reminder title / name.'
        },
        due_date: {
          type: 'string',
          description: 'Optional due date in ISO 8601 format (e.g. "2025-04-11T14:00:00").'
        },
        priority: {
          type: 'number',
          description: 'Optional priority: 0 (none), 1 (high), 5 (medium), 9 (low).'
        },
        list: {
          type: 'string',
          description:
            'Optional reminder list name to add to (partial match). Defaults to the default list.'
        },
        notes: {
          type: 'string',
          description: 'Optional notes / body text for the reminder.'
        }
      },
      required: ['title']
    }
  },
  {
    name: 'complete_reminder',
    description: 'Mark a reminder as completed by its unique ID.',
    parameters: {
      type: 'object',
      properties: {
        reminder_id: {
          type: 'string',
          description: 'The unique reminder ID returned by list_reminders.'
        }
      },
      required: ['reminder_id']
    }
  }
]
