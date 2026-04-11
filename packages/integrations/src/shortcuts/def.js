export const SHORTCUTS_TOOL_DEFINITIONS = [
  {
    name: 'list_shortcuts',
    description:
      "List Shortcuts available on the user's Mac. Returns an array of shortcut names that can be passed to run_shortcut. Supports pagination via limit/offset.",
    parameters: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Max number of shortcuts to return (1–200). Default 100.'
        },
        offset: {
          type: 'number',
          description: 'Number of shortcuts to skip for pagination. Default 0.'
        }
      },
      required: []
    }
  },
  {
    name: 'run_shortcut',
    description:
      'Run a macOS Shortcut by name. Optionally pass input data (text or JSON). Returns whatever output the shortcut produces. Use list_shortcuts first to discover available shortcuts.',
    parameters: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Exact name of the shortcut to run (case-sensitive).'
        },
        input: {
          type: 'string',
          description: 'Optional input text or JSON to pass to the shortcut via stdin.'
        }
      },
      required: ['name']
    }
  }
]
