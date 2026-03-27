export function planningPrompt(journal) {
  return `Current journal:
${JSON.stringify(journal)}

PLANNING PHASE: Before taking any actions, analyze the task and form a plan.

Call update_journal with:
- understanding: what this task requires
- thoughts: your reasoning about how to approach it
- currentPlan: your step-by-step plan

Do NOT call any other tools yet. Only update_journal.`
}

export function journalPrompt(journal) {
  return `Current journal:\n${JSON.stringify(journal)}`
}

export function stallNudge(stalledFor) {
  if (stalledFor === 2) {
    return `You have not made progress in the last 2 iterations.

REQUIRED — Call update_journal with:
- blockers: list SPECIFICALLY what is preventing progress (not just "it's hard")
- thoughts: reasoning about why your current approach is failing
- currentPlan: a COMPLETELY DIFFERENT approach

If the task cannot be completed, set done=true and explain clearly in doneReason.`
  }

  if (stalledFor === 4) {
    return `Still no progress after 4 iterations.

STOP and reconsider your fundamental assumptions:
- What if your understanding of the task is wrong?
- What if the file/API/system you're targeting doesn't work how you assumed?
- What if you're solving the wrong problem?

Use rollbackTo to return to an earlier checkpoint and try a fundamentally different approach.
Add thoughts explaining what assumption you're now questioning.`
  }

  if (stalledFor === 6) {
    return `6 iterations with no progress. You must either:
1. Identify the SPECIFIC blocker and a NEW approach (not variations of what you tried)
2. Set done=true and explain clearly why the task cannot be completed

Do not continue with the same approach.`
  }

  return 'No progress detected. Try something fundamentally different or mark done with explanation.'
}

export function assumptionCheckPrompt(blockers) {
  const blockerList = blockers.length ? blockers.join('\n- ') : 'None recorded'
  return `Your blockers: ${blockerList}

Before trying another approach, question your assumptions:
1. Is your understanding of the task correct?
2. Are you targeting the right files/APIs/systems?
3. Is there a simpler way to achieve the goal?
4. Could the problem be something you haven't considered?

Add your assumption analysis to thoughts, then either:
- Update currentPlan with a new approach based on revised assumptions
- Or set done=true if you realize the task is impossible`
}

export function postActionPrompt(toolName, resultSummary) {
  return `Action completed: ${toolName}
Result summary: ${resultSummary}

Before your next action:
1. Did this produce the expected outcome?
2. Does this move you closer to the goal?
3. Do you need to verify/validate this result further?

Update your journal with discoveries and your next planned action.`
}
