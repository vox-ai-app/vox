const definition = {
  name: 'update_journal',
  description:
    'Update your working memory. Scalars (understanding, currentPlan, done, doneReason) overwrite. Arrays (discoveries, completed, blockers, thoughts) append. Set done=true only when the goal is fully achieved.',
  parameters: {
    type: 'object',
    properties: {
      understanding: {
        type: 'string',
        description: 'Your current understanding of the task and its scope.'
      },
      thoughts: {
        type: 'array',
        items: { type: 'string' },
        description: 'Your reasoning before taking an action. Why you chose this approach.'
      },
      discoveries: {
        type: 'array',
        items: { type: 'string' },
        description: 'New facts observed. One sentence each. Facts only.'
      },
      completed: {
        type: 'array',
        items: { type: 'string' },
        description: 'Actions just completed. One sentence each.'
      },
      currentPlan: { type: 'string', description: 'What you plan to do next (1-2 sentences).' },
      blockers: {
        type: 'array',
        items: { type: 'string' },
        description: 'What is preventing progress. Be specific about what failed and why.'
      },
      clearBlockers: {
        type: 'boolean',
        description: 'Set to true to clear all blockers when you found a way forward.'
      },
      rollbackTo: {
        type: 'number',
        description: 'Rollback to this checkpoint index. Use when you went down a wrong path.'
      },
      done: { type: 'boolean', description: 'Set to true when the task goal is fully achieved.' },
      doneReason: {
        type: 'string',
        description: 'Required when done=true. Summary of what was accomplished.'
      }
    }
  }
}

const MAX_CHECKPOINTS = 10

export function createJournalTool(journal, onUpdate) {
  const checkpoints = []

  function saveCheckpoint() {
    checkpoints.push({
      thoughts: [...journal.thoughts],
      discoveries: [...journal.discoveries],
      completed: [...journal.completed]
    })
    if (checkpoints.length > MAX_CHECKPOINTS) checkpoints.shift()
  }

  function rollback(index) {
    const checkpoint = checkpoints[index]
    if (!checkpoint) return false
    journal.thoughts = [...checkpoint.thoughts]
    journal.discoveries = [...checkpoint.discoveries]
    journal.completed = [...checkpoint.completed]
    journal.blockers = []
    journal.currentPlan = ''
    return true
  }

  return {
    definition,
    execute: () => async (args) => {
      if (typeof args.rollbackTo === 'number' && args.rollbackTo >= 0) {
        if (rollback(args.rollbackTo)) {
          onUpdate?.(journal)
          return { ok: true, rolledBackTo: args.rollbackTo, journal }
        }
      }

      saveCheckpoint()

      if (args.understanding !== undefined) journal.understanding = args.understanding
      if (args.currentPlan !== undefined) journal.currentPlan = args.currentPlan
      if (args.done !== undefined) journal.done = args.done
      if (args.doneReason !== undefined) journal.doneReason = args.doneReason

      if (Array.isArray(args.thoughts)) journal.thoughts.push(...args.thoughts)
      if (Array.isArray(args.discoveries)) journal.discoveries.push(...args.discoveries)
      if (Array.isArray(args.completed)) journal.completed.push(...args.completed)
      if (Array.isArray(args.blockers)) {
        journal.blockers.push(...args.blockers)
        journal.blockersEncountered.push(...args.blockers)
      }
      if (args.clearBlockers) journal.blockers = []

      onUpdate?.(journal)
      return { ok: true, checkpointIndex: checkpoints.length - 1, journal }
    }
  }
}
