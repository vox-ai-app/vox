import { MAX_DETAIL_LENGTH } from './chat.constants'
import { clipText, summarizeValue } from './chat.text'
import { createEmptyTaskState, pushTaskHistory, upsertTaskState } from './chat.tasks'

export const applyProgressEvent = (data, timestamp, setTasks) => {
  setTasks((current) => {
    const taskId = String(data?.taskId || '').trim()
    if (!taskId) return current

    const existing =
      current.find((task) => String(task?.taskId || '') === taskId) ||
      createEmptyTaskState(taskId, timestamp)

    const completedCount = Number(data?.completedCount ?? existing.completedCount)
    const currentPlan =
      data?.currentPlan !== undefined ? String(data.currentPlan) : existing.currentPlan

    const history = pushTaskHistory(existing.history, {
      at: timestamp,
      type: 'progress',
      detail: currentPlan || `${completedCount} action${completedCount === 1 ? '' : 's'} completed`
    })

    return upsertTaskState(
      current,
      taskId,
      {
        status: 'running',
        completedCount,
        currentPlan,
        startedAt: existing.startedAt || timestamp,
        history
      },
      timestamp
    )
  })
}

export const applyStatusEvent = (data, timestamp, setTasks) => {
  setTasks((current) => {
    const taskId = String(data?.taskId || '').trim()
    if (!taskId) return current

    const existing =
      current.find((task) => String(task?.taskId || '') === taskId) ||
      createEmptyTaskState(taskId, timestamp)
    const status = String(data?.status || 'updated')
    const normalizedStatus = status.trim().toLowerCase()
    const message = clipText(data?.message, MAX_DETAIL_LENGTH)
    const resultPreview = clipText(summarizeValue(data?.result), MAX_DETAIL_LENGTH)
    const history = pushTaskHistory(existing.history, {
      at: timestamp,
      type: normalizedStatus || 'status',
      detail: clipText(message || resultPreview || `Task ${normalizedStatus || 'updated'}`, 160)
    })

    const isTerminal =
      normalizedStatus === 'completed' ||
      normalizedStatus === 'failed' ||
      normalizedStatus === 'aborted'

    return upsertTaskState(
      current,
      taskId,
      {
        status,
        message,
        resultPreview,
        currentPlan: isTerminal ? '' : existing.currentPlan,
        completedAt:
          normalizedStatus === 'completed' || normalizedStatus === 'aborted'
            ? existing.completedAt || timestamp
            : existing.completedAt || '',
        failedAt:
          normalizedStatus === 'failed' ? existing.failedAt || timestamp : existing.failedAt || '',
        history
      },
      timestamp
    )
  })
}
