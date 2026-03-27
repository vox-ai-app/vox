import { MAX_TASK_ITEMS, MAX_TASK_HISTORY_ITEMS } from './chat.constants'
import { applySpawnResultEvent, applyToolEvent } from './chat.spawn.handler'
import { applyProgressEvent, applyStatusEvent } from './chat.step.handler'

export const pushTaskHistory = (history, entry) => {
  const normalizedEntry = entry && typeof entry === 'object' ? entry : null
  if (!normalizedEntry) return Array.isArray(history) ? history : []
  const normalizedHistory = Array.isArray(history) ? history : []
  return [normalizedEntry, ...normalizedHistory].slice(0, MAX_TASK_HISTORY_ITEMS)
}

export const createEmptyTaskState = (taskId, timestamp) => ({
  taskId,
  status: 'spawned',
  completedCount: 0,
  currentPlan: '',
  message: '',
  resultPreview: '',
  spawnRequestedAt: '',
  spawnedAt: '',
  startedAt: '',
  completedAt: '',
  failedAt: '',
  spawnInstructions: '',
  spawnContext: '',
  spawnArgsPreview: '',
  history: [],
  updatedAt: timestamp || new Date().toISOString()
})

export const upsertTaskState = (currentTasks, taskId, patch, timestamp) => {
  const normalizedTaskId = String(taskId || '').trim()
  if (!normalizedTaskId) return currentTasks

  const currentIndex = currentTasks.findIndex((task) => task.taskId === normalizedTaskId)
  const ts = timestamp || new Date().toISOString()

  if (currentIndex >= 0) {
    const nextTask = { ...currentTasks[currentIndex], ...patch, updatedAt: ts }
    return currentTasks.map((task, index) => (index === currentIndex ? nextTask : task))
  }

  const nextTask = { ...createEmptyTaskState(normalizedTaskId, ts), ...patch, updatedAt: ts }
  return [nextTask, ...currentTasks].slice(0, MAX_TASK_ITEMS)
}

export const getTaskIdFromEventData = (data) =>
  String(data?.taskId || data?.result?.taskId || '').trim()

export const applyTaskEvent = (event, setTasks, options = {}) => {
  const type = String(event?.type || '')
  const data = event?.data || {}
  const timestamp = event?.timestamp || new Date().toISOString()
  const dequeuePendingSpawn =
    typeof options?.dequeuePendingSpawn === 'function' ? options.dequeuePendingSpawn : null

  if (type === 'tool_result' && data?.name === 'spawn_task' && data?.result?.taskId) {
    applySpawnResultEvent(data, timestamp, setTasks, dequeuePendingSpawn)
    return
  }

  if (type === 'tool_call' || type === 'tool_result') {
    applyToolEvent(type, data, timestamp, setTasks)
    return
  }

  if (type === 'task.progress') {
    applyProgressEvent(data, timestamp, setTasks)
    return
  }

  if (type === 'task.status') {
    applyStatusEvent(data, timestamp, setTasks)
  }
}
