import { randomUUID } from 'crypto'
import { emitAll } from '../ipc/shared'

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

export function createSpawnTool({ toolDefinitions, enqueueTask }) {
  return {
    definition,
    execute: () => async (args) => {
      const taskId = randomUUID()

      emitAll('task:event', {
        taskId,
        type: 'task.status',
        status: 'spawned',
        instructions: args.instructions
      })

      enqueueTask({
        taskId,
        instructions: args.instructions,
        context: args.context || '',
        toolDefinitions
      })

      return {
        taskId,
        status: 'spawned',
        message: 'Worker agent started in background. Use get_task to check progress.'
      }
    }
  }
}
