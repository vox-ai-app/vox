import { MAX_DETAIL_LENGTH } from './chat.constants'
import { clipText, parseToolArgs, summarizeValue } from './chat.text'
import {
  createEmptyTaskState,
  getTaskIdFromEventData,
  pushTaskHistory,
  upsertTaskState
} from './chat.tasks'
import { TERMINAL_STATUSES } from '../../activity/utils/task.utils'

export const applySpawnResultEvent = (data, timestamp, setTasks, dequeuePendingSpawn) => {
  setTasks((current) => {
    const taskId = String(data?.result?.taskId || '').trim()
    if (!taskId) return current

    const existing =
      current.find((task) => String(task?.taskId || '') === taskId) ||
      createEmptyTaskState(taskId, timestamp)
    const pendingSpawn = dequeuePendingSpawn ? dequeuePendingSpawn() : null
    const spawnInstructions = clipText(
      pendingSpawn?.instructions || existing.spawnInstructions || '',
      MAX_DETAIL_LENGTH
    )
    const spawnContext = clipText(
      pendingSpawn?.context || existing.spawnContext || '',
      MAX_DETAIL_LENGTH
    )
    const spawnArgsPreview = clipText(
      pendingSpawn?.argsPreview || existing.spawnArgsPreview || '',
      MAX_DETAIL_LENGTH
    )
    const spawnRequestedAt = pendingSpawn?.requestedAt || existing.spawnRequestedAt || timestamp
    const history = pushTaskHistory(existing.history, {
      at: timestamp,
      type: 'spawned',
      detail: clipText(data?.result?.message || 'Worker started', 140)
    })

    return upsertTaskState(
      current,
      taskId,
      {
        status: String(data?.result?.status || 'spawned'),
        message: clipText(data?.result?.message, MAX_DETAIL_LENGTH),
        spawnRequestedAt,
        spawnedAt: existing.spawnedAt || timestamp,
        spawnInstructions,
        spawnContext,
        spawnArgsPreview,
        history
      },
      timestamp
    )
  })
}

export const applyToolEvent = (type, data, timestamp, setTasks) => {
  const taskId = getTaskIdFromEventData(data)
  if (!taskId) return

  setTasks((current) => {
    const existing =
      current.find((task) => String(task?.taskId || '') === taskId) ||
      createEmptyTaskState(taskId, timestamp)

    const toolName = String(data?.name || data?.tool || '').trim()
    const isToolCall = type === 'tool_call'
    const payloadValue = isToolCall ? parseToolArgs(data?.args) : data?.result
    const payloadPreview = clipText(summarizeValue(payloadValue), MAX_DETAIL_LENGTH)

    const history = pushTaskHistory(existing.history, {
      at: timestamp,
      type,
      detail: clipText(
        `${toolName || 'tool'} ${isToolCall ? 'call' : 'result'}${payloadPreview ? ` · ${payloadPreview}` : ''}`,
        160
      )
    })

    const normalizedStatus = String(existing.status || '')
      .trim()
      .toLowerCase()
    const nextStatus = TERMINAL_STATUSES.has(normalizedStatus) ? existing.status : 'running'

    return upsertTaskState(
      current,
      taskId,
      {
        status: nextStatus,
        lastToolName: toolName || existing.lastToolName || '',
        lastToolPreview: isToolCall ? payloadPreview : existing.lastToolPreview || '',
        startedAt: existing.startedAt || timestamp,
        history
      },
      timestamp
    )
  })
}
