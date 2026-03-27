export function getGreeting() {
  const h = new Date().getHours()
  if (h < 5) return 'Good night'
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  if (h < 21) return 'Good evening'
  return 'Good night'
}

export function normalizeTasks(raw) {
  return (raw ?? []).map((t) => ({
    taskId: String(t.id || t.taskId || t.task_id || ''),
    status: String(t.status || 'unknown'),
    spawnInstructions: t.spawn_instructions || t.spawnInstructions || '',
    currentPlan: t.current_plan || t.currentPlan || '',
    completedCount: t.completed_count ?? t.completedCount ?? 0
  }))
}

export function normalizeMessages(rows) {
  return rows
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && m.content)
    .map((m) => ({
      id: m.id || m._id || crypto.randomUUID(),
      role: m.role,
      content:
        typeof m.content === 'string'
          ? m.content
          : Array.isArray(m.content)
            ? m.content
                .filter((c) => c.type === 'text')
                .map((c) => c.text)
                .join('')
            : '',
      streaming: false
    }))
    .filter((m) => m.content.trim().length > 0)
}

export function getTaskStatusColor(status) {
  if (status === 'completed') return '#78c88c'
  if (status === 'failed') return '#f06464'
  if (status === 'running' || status === 'spawned') return '#ec89b8'
  return '#8a8680'
}
