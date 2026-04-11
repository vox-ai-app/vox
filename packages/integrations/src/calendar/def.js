export const CALENDAR_TOOL_DEFINITIONS = [
  {
    name: 'list_events',
    description:
      "List calendar events from the user's Calendar.app on macOS within a date range. Returns events with title, start/end time, location, calendar name, and notes. Supports pagination via limit/offset.",
    parameters: {
      type: 'object',
      properties: {
        start_date: {
          type: 'string',
          description:
            'Start of date range in ISO 8601 format (e.g. "2025-04-11"). Defaults to today.'
        },
        end_date: {
          type: 'string',
          description:
            'End of date range in ISO 8601 format (e.g. "2025-04-18"). Defaults to 7 days from start.'
        },
        calendar: {
          type: 'string',
          description: 'Optional calendar name to filter by (partial match, case-insensitive).'
        },
        limit: {
          type: 'number',
          description: 'Max number of events to return (1–200). Default 25.'
        },
        offset: {
          type: 'number',
          description: 'Number of events to skip for pagination. Default 0.'
        }
      },
      required: []
    }
  },
  {
    name: 'create_event',
    description:
      'Create a new calendar event in Calendar.app on macOS. Returns confirmation with the created event details.',
    parameters: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'Event title / summary.'
        },
        start_date: {
          type: 'string',
          description: 'Event start date and time in ISO 8601 format (e.g. "2025-04-11T14:00:00").'
        },
        end_date: {
          type: 'string',
          description: 'Event end date and time in ISO 8601 format. Defaults to 1 hour after start.'
        },
        location: {
          type: 'string',
          description: 'Optional event location.'
        },
        notes: {
          type: 'string',
          description: 'Optional event notes / description.'
        },
        calendar: {
          type: 'string',
          description:
            'Optional calendar name to add the event to (partial match). Defaults to the default calendar.'
        }
      },
      required: ['title', 'start_date']
    }
  },
  {
    name: 'update_event',
    description:
      'Update an existing calendar event by its unique ID. Only the provided fields will be changed.',
    parameters: {
      type: 'object',
      properties: {
        event_id: {
          type: 'string',
          description: 'The unique event ID returned by list_events.'
        },
        title: {
          type: 'string',
          description: 'New event title.'
        },
        start_date: {
          type: 'string',
          description: 'New start date/time in ISO 8601 format.'
        },
        end_date: {
          type: 'string',
          description: 'New end date/time in ISO 8601 format.'
        },
        location: {
          type: 'string',
          description: 'New event location.'
        },
        notes: {
          type: 'string',
          description: 'New event notes.'
        }
      },
      required: ['event_id']
    }
  },
  {
    name: 'delete_event',
    description: 'Delete a calendar event by its unique ID.',
    parameters: {
      type: 'object',
      properties: {
        event_id: {
          type: 'string',
          description: 'The unique event ID returned by list_events.'
        }
      },
      required: ['event_id']
    }
  }
]
