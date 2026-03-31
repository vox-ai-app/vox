import { createHash } from 'crypto'

export function createRepetitionDetector() {
  const recentActions = []
  const MAX_HISTORY = 10

  function hashArgs(args) {
    const serialized = JSON.stringify(args || {})
    return createHash('sha256').update(serialized).digest('hex').slice(0, 16)
  }

  function normalize(action) {
    return `${action.tool}:${action.argsHash}`
  }

  return {
    record(toolName, args, result) {
      const failed =
        typeof result === 'string'
          ? /error|failed|exception/i.test(result)
          : !!(result?.error || (result?.exitCode && result.exitCode !== 0))
      const action = {
        tool: toolName,
        args,
        argsHash: hashArgs(args),
        failed,
        timestamp: Date.now()
      }
      recentActions.push(action)
      if (recentActions.length > MAX_HISTORY) recentActions.shift()
    },

    detectRepetition() {
      if (recentActions.length < 3) return null

      const last3 = recentActions.slice(-3)
      const normalized = last3.map(normalize)

      if (normalized[0] === normalized[1] && normalized[1] === normalized[2]) {
        const allFailed = last3.every((a) => a.failed)
        if (allFailed) {
          return {
            type: 'same_failing_action',
            tool: last3[0].tool,
            message: `You have called ${last3[0].tool} with the same arguments 3 times and it failed each time. STOP. This approach is not working. Try something completely different.`
          }
        }
        return {
          type: 'same_action_repeated',
          tool: last3[0].tool,
          message: `You have called ${last3[0].tool} with identical arguments 3 times. This may indicate you're stuck in a loop. Review your approach.`
        }
      }

      const failedCount = recentActions.filter((a) => a.failed).length
      if (failedCount >= 5 && recentActions.length >= 6) {
        const failedTools = new Set(recentActions.filter((a) => a.failed).map((a) => a.tool))
        return {
          type: 'high_failure_rate',
          message: `${failedCount} of your last ${recentActions.length} actions failed (tools: ${[...failedTools].join(', ')}). Step back and reconsider your fundamental approach.`
        }
      }

      return null
    },

    clear() {
      recentActions.length = 0
    }
  }
}
