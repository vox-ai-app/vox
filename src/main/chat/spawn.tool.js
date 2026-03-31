export const definition = {
  name: 'spawn_task',
  description:
    'Delegate a task to a background worker agent. Use for any work that involves multiple steps, tool usage, or takes time (creating files, research, etc.). The worker runs independently — you will NOT be notified when it finishes. To check progress, use get_task.',
  parameters: {
    type: 'object',
    properties: {
      instructions: {
        type: 'string',
        description:
          'Detailed natural-language instructions for the worker. Be specific about what to do and what tools to use.'
      },
      context: {
        type: 'string',
        description: 'Relevant conversation context the worker needs to complete the task.'
      }
    },
    required: ['instructions']
  }
}
