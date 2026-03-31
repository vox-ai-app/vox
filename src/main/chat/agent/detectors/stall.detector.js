import { stallNudge, assumptionCheckPrompt } from '../prompts/index.js'

export function createStallDetector() {
  let stalledFor = 0
  let lastCompletedCount = 0
  let lastPlan = ''
  let assumptionCheckSent = false

  return {
    check(journal, planningComplete) {
      const currentPlan = journal.currentPlan || ''
      const planUnchanged = currentPlan === lastPlan
      const completedUnchanged = journal.completed.length === lastCompletedCount

      lastCompletedCount = journal.completed.length
      lastPlan = currentPlan

      if (!planningComplete) return { stalled: false, stalledFor: 0, nudge: null }

      if (!currentPlan && !journal.completed.length) {
        return { stalled: false, stalledFor: 0, nudge: null }
      }

      if (planUnchanged && completedUnchanged) {
        stalledFor++
        let nudge = null
        if (stalledFor >= 2) nudge = stallNudge(stalledFor)
        if (stalledFor === 5 && !assumptionCheckSent && journal.blockers.length > 0) {
          nudge = assumptionCheckPrompt(journal.blockers)
          assumptionCheckSent = true
        }
        return { stalled: true, stalledFor, nudge }
      }

      stalledFor = 0
      assumptionCheckSent = false
      return { stalled: false, stalledFor: 0, nudge: null }
    },

    reset() {
      stalledFor = 0
      lastCompletedCount = 0
      lastPlan = ''
      assumptionCheckSent = false
    }
  }
}
