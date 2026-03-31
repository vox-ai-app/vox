import { emitAll } from '../ipc/shared'
import { startAgent, abortAgent, onAgentEvent } from '../ai/llm.bridge'
import { logger } from '../logger'
import {
  appendTaskActivity,
  loadAllTaskActivity,
  loadTasks,
  upsertTask,
  indexTaskInFts
} from '../storage/tasks.db'

const MAX_CONCURRENT = 1
const MAX_ACTIVITY_PER_TASK = 500

const queue = []
const active = new Map()
const taskMeta = new Map()
const taskActivity = new Map()
let hydrated = false
let _draining = false

let _toolDefinitionProvider = null

export function setToolDefinitionProvider(fn) {
  _toolDefinitionProvider = fn
}

function buildTaskObject(taskId) {
  const meta = taskMeta.get(taskId)
  if (!meta) return null
  const ts = new Date(meta.createdAt).toISOString()
  return {
    taskId,
    status: meta.status,
    completedCount: 0,
    currentPlan: meta.currentPlan || '',
    message: meta.message || '',
    resultPreview: meta.result ? String(meta.result).slice(0, 200) : '',
    spawnRequestedAt: ts,
    spawnedAt: ts,
    startedAt: ts,
    completedAt: meta.completedAt || '',
    failedAt: meta.failedAt || '',
    spawnInstructions: meta.instructions,
    instructions: meta.instructions,
    spawnContext: meta.context || '',
    spawnArgsPreview: '',
    history: [],
    updatedAt: meta.updatedAt || ts
  }
}

function persistTaskMeta(meta) {
  upsertTask({
    taskId: meta.taskId,
    instructions: meta.instructions,
    context: meta.context,
    status: meta.status,
    createdAt: meta.createdAt,
    updatedAt: meta.updatedAt,
    currentPlan: meta.currentPlan,
    message: meta.message,
    result: meta.result,
    completedAt: meta.completedAt,
    failedAt: meta.failedAt
  })
}

function hydrateTaskState() {
  if (hydrated) return
  hydrated = true

  for (const storedTask of loadTasks()) {
    const isInterrupted = storedTask.status === 'queued' || storedTask.status === 'running'
    const normalized = {
      taskId: storedTask.taskId,
      instructions: storedTask.instructions || '',
      context: storedTask.context || '',
      toolDefinitions: [],
      status: isInterrupted ? 'failed' : storedTask.status,
      createdAt: storedTask.createdAt || new Date().toISOString(),
      updatedAt: storedTask.updatedAt || storedTask.createdAt || new Date().toISOString(),
      currentPlan: storedTask.currentPlan || '',
      message: isInterrupted
        ? 'Interrupted by app restart — resume to continue.'
        : storedTask.message || '',
      result: storedTask.result || null,
      completedAt: isInterrupted ? '' : storedTask.completedAt || '',
      failedAt: isInterrupted ? new Date().toISOString() : storedTask.failedAt || ''
    }

    taskMeta.set(normalized.taskId, normalized)

    if (isInterrupted) {
      normalized.updatedAt = new Date().toISOString()
      persistTaskMeta(normalized)
    }
  }

  for (const event of loadAllTaskActivity()) {
    const events = taskActivity.get(event.taskId) || []
    events.push(event)
    taskActivity.set(event.taskId, events)
  }
}

function buildTaskStatusResponse(task) {
  if (!task) return null

  return {
    id: task.taskId,
    taskId: task.taskId,
    status: task.status,
    instructions: task.instructions || task.spawnInstructions || '',
    result: task.resultPreview || '',
    created_at: task.spawnedAt || new Date().toISOString(),
    completed_at: task.completedAt || task.failedAt || '',
    error: task.message || '',
    abort_reason: task.message || '',
    steps: [],
    current_plan: task.currentPlan || ''
  }
}

function buildHistoryTask(task) {
  return {
    id: task.taskId,
    status: task.status,
    instructions: task.instructions || task.spawnInstructions || '',
    created_at: task.spawnedAt || new Date().toISOString(),
    completed_at: task.completedAt || task.failedAt || '',
    current_plan: task.currentPlan || ''
  }
}

function emitTaskCacheSnapshot(type, page, includeActivity = false) {
  const data = {
    tasks: page.tasks,
    hasMore: page.hasMore
  }

  if (includeActivity) {
    data.activity = getCachedActivityEvents()
  }

  emitAll('chat:event', { type, data })
}

function normalizeLimit(limit, fallback = 50) {
  const parsed = Number.parseInt(limit, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function buildActivityEvent(taskId, event) {
  return {
    id: `activity-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    taskId,
    type: event.type,
    name: event.name,
    rawResult: event.type === 'tool_result' ? event.result || null : null,
    timestamp: new Date().toISOString(),
    data: { taskId, ...event }
  }
}

function recordActivity(taskId, event) {
  const nextEvent = buildActivityEvent(taskId, event)
  const events = taskActivity.get(taskId) || []
  if (events.length >= MAX_ACTIVITY_PER_TASK) {
    events.splice(0, events.length - MAX_ACTIVITY_PER_TASK + 1)
  }
  events.push(nextEvent)
  taskActivity.set(taskId, events)
  appendTaskActivity(nextEvent)
  emitAll('chat:event', { type: 'task:activity', data: { activity: nextEvent } })
}

function getPagedTasks({ offsetId = null, offset_id = null, limit = 50, status = null } = {}) {
  hydrateTaskState()

  const normalizedLimit = normalizeLimit(limit)
  const tasks = getAllTasks()
  const filtered = status
    ? tasks.filter(
        (task) => String(task.status || '').toLowerCase() === String(status).toLowerCase()
      )
    : tasks

  let startIndex = 0
  const resolvedOffsetId = offsetId || offset_id || null
  if (resolvedOffsetId) {
    const idx = filtered.findIndex((task) => task.taskId === resolvedOffsetId)
    startIndex = idx >= 0 ? idx + 1 : filtered.length
  }

  const pageTasks = filtered.slice(startIndex, startIndex + normalizedLimit)
  const hasMore = startIndex + normalizedLimit < filtered.length

  return {
    tasks: pageTasks,
    hasMore,
    nextOffsetId: hasMore ? pageTasks[pageTasks.length - 1]?.taskId || null : null
  }
}

export function enqueueTask(task) {
  hydrateTaskState()

  const { taskId, instructions, context, toolDefinitions } = task
  const now = new Date().toISOString()

  taskMeta.set(taskId, {
    taskId,
    instructions,
    context: context || '',
    toolDefinitions: toolDefinitions || [],
    status: 'queued',
    createdAt: now,
    updatedAt: now,
    currentPlan: '',
    message: '',
    result: null,
    completedAt: '',
    failedAt: ''
  })
  taskActivity.set(taskId, [])
  persistTaskMeta(taskMeta.get(taskId))

  queue.push(task)
  emitAll('task:event', { taskId, type: 'task.status', status: 'queued', instructions })
  emitChatTaskEvent('task:append', taskId)

  drain()
}

export function abortTask(taskId) {
  hydrateTaskState()
  const idx = queue.findIndex((t) => t.taskId === taskId)
  if (idx >= 0) {
    queue.splice(idx, 1)
    setStatus(taskId, 'aborted', { message: 'Cancelled before starting' })
    return
  }
  if (active.has(taskId)) {
    abortAgent(taskId)
  }
}

export async function resumeTask(taskId) {
  hydrateTaskState()

  const id = String(taskId || '').trim()
  if (!id) return { resumed: false, reason: 'missing-task-id' }

  if (active.has(id) || queue.some((task) => task.taskId === id)) {
    return { resumed: false, reason: 'already-active' }
  }

  const meta = taskMeta.get(id)
  if (!meta) {
    return { resumed: false, reason: 'not-found' }
  }

  if (!['failed', 'aborted', 'incomplete'].includes(meta.status)) {
    return { resumed: false, reason: 'invalid-status' }
  }

  meta.status = 'queued'
  meta.updatedAt = new Date().toISOString()
  meta.message = ''
  meta.result = null
  meta.completedAt = ''
  meta.failedAt = ''
  meta.toolDefinitions = _toolDefinitionProvider?.() || []
  persistTaskMeta(meta)

  queue.push({
    taskId: meta.taskId,
    instructions: meta.instructions,
    context: meta.context,
    toolDefinitions: meta.toolDefinitions
  })

  emitAll('task:event', {
    taskId: meta.taskId,
    type: 'task.status',
    status: 'queued',
    instructions: meta.instructions
  })
  emitChatTaskEvent('task:updated', meta.taskId)
  drain()
  return { resumed: true, taskId: meta.taskId }
}

export function getTask(taskId) {
  hydrateTaskState()
  return buildTaskObject(taskId)
}

export function getAllTasks() {
  hydrateTaskState()
  return [...taskMeta.keys()]
    .map(buildTaskObject)
    .filter(Boolean)
    .sort((a, b) => (b.spawnedAt > a.spawnedAt ? 1 : -1))
}

export function getCachedTasks() {
  return getAllTasks()
}

export function getCachedActivityEvents() {
  hydrateTaskState()
  const result = []
  for (const events of taskActivity.values()) {
    result.push(...events)
  }

  return result.sort((a, b) => (a.timestamp < b.timestamp ? -1 : 1))
}

export function getTaskCacheStatus() {
  hydrateTaskState()
  return {
    ready: hydrated,
    taskCount: taskMeta.size,
    activityCount: getCachedActivityEvents().length
  }
}

export function listTaskHistory(params = {}) {
  const page = getPagedTasks(params)
  return {
    tasks: page.tasks.map(buildHistoryTask),
    has_more: page.hasMore,
    next_offset_id: page.nextOffsetId
  }
}

export function loadTaskCachePage(params = {}) {
  const page = getPagedTasks(params)
  emitTaskCacheSnapshot(
    params.offset_id ? 'tasks:appended' : 'tasks:replace-all',
    page,
    !params.offset_id
  )
  return {
    tasks: page.tasks,
    hasMore: page.hasMore,
    nextOffsetId: page.nextOffsetId
  }
}

export function refreshTaskCache() {
  const page = getPagedTasks({})
  emitTaskCacheSnapshot('tasks:replace-all', page, true)
  return page
}

function drain() {
  if (_draining) return
  _draining = true
  try {
    while (queue.length > 0 && active.size < MAX_CONCURRENT) {
      const task = queue.shift()
      runTask(task)
    }
  } finally {
    _draining = false
  }
}

function runTask({ taskId, instructions, context, toolDefinitions }) {
  logger.info('[task.queue] Starting agent task', taskId)
  setStatus(taskId, 'running')

  const cleanup = onAgentEvent(taskId, (event) => {
    if (event.type === 'task.status') {
      const { status, result, message } = event
      const extra = {}
      if (message !== undefined) extra.message = message
      if (result !== undefined) extra.result = result
      if (['completed', 'failed', 'aborted', 'incomplete'].includes(status)) {
        const meta = taskMeta.get(taskId)
        if (meta) {
          if (status === 'completed' || status === 'incomplete')
            meta.completedAt = new Date().toISOString()
          if (status === 'failed' || status === 'aborted') meta.failedAt = new Date().toISOString()
        }
        setStatus(taskId, status, extra)
        if (status === 'completed' || status === 'incomplete') {
          const m = taskMeta.get(taskId)
          if (m) {
            try {
              indexTaskInFts(taskId, m.instructions, extra.result || m.result || '')
            } catch (err) {
              logger.warn('[task.queue] FTS indexing failed:', err.message)
            }
          }
        }
        const entry = active.get(taskId)
        if (entry?.cleanup) entry.cleanup()
        active.delete(taskId)
        drain()
      }
    } else if (event.type === 'journal_update') {
      const meta = taskMeta.get(taskId)
      if (meta) {
        if (event.journal?.currentPlan) meta.currentPlan = event.journal.currentPlan
        meta.updatedAt = new Date().toISOString()
        persistTaskMeta(meta)
        emitChatTaskEvent('task:updated', taskId)
      }
      recordActivity(taskId, event)
    } else if (
      event.type === 'tool_call' ||
      event.type === 'tool_result' ||
      event.type === 'text' ||
      event.type === 'thought'
    ) {
      recordActivity(taskId, event)
    }
  })

  active.set(taskId, { instructions, cleanup })
  startAgent({ taskId, instructions, context, toolDefinitions })
}

function setStatus(taskId, status, extra = {}) {
  const meta = taskMeta.get(taskId)
  if (meta) {
    Object.assign(meta, { status, ...extra, updatedAt: new Date().toISOString() })
    persistTaskMeta(meta)
  }
  emitAll('task:event', { taskId, type: 'task.status', status, ...extra })
  emitChatTaskEvent('task:updated', taskId)
}

function emitChatTaskEvent(eventType, taskId) {
  const task = buildTaskObject(taskId)
  if (!task) return
  emitAll('chat:event', { type: eventType, data: { task } })
}

export function getTaskDetail(taskId) {
  hydrateTaskState()
  const task = buildTaskObject(taskId)
  if (!task) return null

  const activity = taskActivity.get(taskId) || []
  return {
    task: {
      ...buildTaskStatusResponse(task),
      result: taskMeta.get(taskId)?.result || '',
      steps: [],
      activityLog: activity.map((event) => ({
        id: event.id,
        taskId: event.taskId,
        type: event.type,
        name: event.name || event.data?.name || '',
        rawResult: event.rawResult,
        at: event.timestamp,
        timestamp: event.timestamp,
        data: event.data
      }))
    }
  }
}
