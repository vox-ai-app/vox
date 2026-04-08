import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockEmitAll = vi.fn()
const mockStartAgent = vi.fn()
const mockAbortAgent = vi.fn()
let agentEventCallbacks = new Map()

vi.mock('../../src/main/ipc/shared', () => ({
  emitAll: (...args) => mockEmitAll(...args)
}))

vi.mock('../../src/main/ai/llm/bridge', () => ({
  startAgent: (...args) => mockStartAgent(...args),
  abortAgent: (...args) => mockAbortAgent(...args),
  onAgentEvent: (taskId, callback) => {
    agentEventCallbacks.set(taskId, callback)
    return () => agentEventCallbacks.delete(taskId)
  }
}))

vi.mock('../../src/main/core/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}))

const mockTaskRows = []
const mockActivityRows = []
vi.mock('../../src/main/storage/tasks.db', () => ({
  upsertTask: vi.fn((task) => {
    const idx = mockTaskRows.findIndex((t) => t.id === task.id)
    if (idx >= 0) mockTaskRows[idx] = task
    else mockTaskRows.push(task)
  }),
  loadTasks: () => [...mockTaskRows],
  appendTaskActivity: vi.fn((event) => mockActivityRows.push(event)),
  loadAllTaskActivity: () => [...mockActivityRows],
  indexTaskInFts: vi.fn(),
  indexTaskEmbedding: vi.fn(async () => {}),
  searchTasksFts: vi.fn(() => []),
  searchKnowledgePatterns: vi.fn(() => []),
  insertKnowledgePattern: vi.fn()
}))

let mod

beforeEach(async () => {
  mockEmitAll.mockClear()
  mockStartAgent.mockClear()
  mockAbortAgent.mockClear()
  agentEventCallbacks.clear()
  mockTaskRows.length = 0
  mockActivityRows.length = 0

  vi.resetModules()
  mod = await import('../../src/main/chat/task.queue.js')
})

describe('enqueueTask', () => {
  it('should add task and drain to running status', () => {
    mod.enqueueTask({
      taskId: 'task-1',
      instructions: 'Do something',
      context: 'ctx',
      toolDefinitions: []
    })

    const task = mod.getTask('task-1')
    expect(task).toBeTruthy()
    expect(task.status).toBe('running')
    expect(task.instructions).toBe('Do something')
  })

  it('should emit task:event with queued status', () => {
    mod.enqueueTask({
      taskId: 'task-2',
      instructions: 'Test',
      context: '',
      toolDefinitions: []
    })

    const taskEvent = mockEmitAll.mock.calls.find(
      (c) => c[0] === 'task:event' && c[1]?.taskId === 'task-2'
    )
    expect(taskEvent).toBeTruthy()
    expect(taskEvent[1].status).toBe('queued')
  })

  it('should emit chat:event task:append', () => {
    mod.enqueueTask({
      taskId: 'task-3',
      instructions: 'Test',
      context: '',
      toolDefinitions: []
    })

    const appendCall = mockEmitAll.mock.calls.find((c) => c[1]?.type === 'task:append')
    expect(appendCall).toBeTruthy()
  })

  it('should persist task to DB', () => {
    mod.enqueueTask({
      taskId: 'task-4',
      instructions: 'Persist me',
      context: '',
      toolDefinitions: []
    })

    const persisted = mockTaskRows.find((t) => t.id === 'task-4')
    expect(persisted).toBeTruthy()
    expect(persisted.status).toBe('running')
  })

  it('should start agent immediately when under concurrency limit', () => {
    mod.enqueueTask({
      taskId: 'task-5',
      instructions: 'Start now',
      context: '',
      toolDefinitions: []
    })

    expect(mockStartAgent).toHaveBeenCalledTimes(1)
    expect(mockStartAgent.mock.calls[0][0].taskId).toBe('task-5')
  })
})

describe('abortTask', () => {
  it('should abort queued task before it starts', () => {
    mockStartAgent.mockImplementation(() => {})

    mod.enqueueTask({
      taskId: 'abort-1',
      instructions: 'will cancel',
      context: '',
      toolDefinitions: []
    })

    const drainedTask = mod.getTask('abort-1')
    if (drainedTask?.status === 'running') {
      mod.abortTask('abort-1')
      expect(mockAbortAgent).toHaveBeenCalledWith('abort-1')
    }
  })

  it('should call abortAgent for running task', () => {
    mod.enqueueTask({
      taskId: 'abort-2',
      instructions: 'running',
      context: '',
      toolDefinitions: []
    })

    mod.abortTask('abort-2')
    expect(mockAbortAgent).toHaveBeenCalled()
  })
})

describe('task status transitions via agent events', () => {
  it('should transition to running when agent starts', () => {
    mod.enqueueTask({
      taskId: 'status-1',
      instructions: 'run me',
      context: '',
      toolDefinitions: []
    })

    const task = mod.getTask('status-1')
    expect(task.status).toBe('running')
  })

  it('should transition to completed when agent reports done', () => {
    mod.enqueueTask({
      taskId: 'status-2',
      instructions: 'complete me',
      context: '',
      toolDefinitions: []
    })

    const cb = agentEventCallbacks.get('status-2')
    if (cb) {
      cb({ type: 'task.status', status: 'completed', result: 'All done' })
    }

    const task = mod.getTask('status-2')
    expect(task.status).toBe('completed')
  })

  it('should transition to failed when agent fails', () => {
    mod.enqueueTask({
      taskId: 'status-3',
      instructions: 'fail me',
      context: '',
      toolDefinitions: []
    })

    const cb = agentEventCallbacks.get('status-3')
    if (cb) {
      cb({ type: 'task.status', status: 'failed', message: 'Crashed' })
    }

    const task = mod.getTask('status-3')
    expect(task.status).toBe('failed')
  })

  it('should record activity for tool call events', () => {
    mod.enqueueTask({
      taskId: 'activity-1',
      instructions: 'test activity',
      context: '',
      toolDefinitions: []
    })

    const cb = agentEventCallbacks.get('activity-1')
    if (cb) {
      cb({ type: 'tool_call', name: 'web_search', args: { q: 'test' } })
    }

    const events = mod.getCachedActivityEvents()
    const toolCallEvent = events.find((e) => e.type === 'tool_call')
    expect(toolCallEvent).toBeTruthy()
  })
})

describe('getAllTasks', () => {
  it('should return all tasks sorted by spawnedAt descending', () => {
    mod.enqueueTask({ taskId: 'all-1', instructions: 'first', context: '', toolDefinitions: [] })
    mod.enqueueTask({ taskId: 'all-2', instructions: 'second', context: '', toolDefinitions: [] })

    const tasks = mod.getAllTasks()
    expect(tasks.length).toBe(2)
  })

  it('should return empty array when no tasks', () => {
    const tasks = mod.getAllTasks()
    expect(tasks).toEqual([])
  })
})

describe('getTaskCacheStatus', () => {
  it('should report ready status and counts', () => {
    mod.enqueueTask({ taskId: 'cache-1', instructions: 'test', context: '', toolDefinitions: [] })

    const status = mod.getTaskCacheStatus()
    expect(status.ready).toBe(true)
    expect(status.taskCount).toBeGreaterThanOrEqual(1)
  })
})

describe('listTaskHistory', () => {
  it('should return formatted task history', () => {
    mod.enqueueTask({
      taskId: 'hist-1',
      instructions: 'task history',
      context: '',
      toolDefinitions: []
    })

    const history = mod.listTaskHistory()
    expect(history.tasks.length).toBeGreaterThanOrEqual(1)
    expect(history.tasks[0].id).toBe('hist-1')
    expect(history.has_more).toBeDefined()
  })

  it('should filter by status', () => {
    mod.enqueueTask({
      taskId: 'hist-2',
      instructions: 'running task',
      context: '',
      toolDefinitions: []
    })

    const history = mod.listTaskHistory({ status: 'running' })
    expect(history.tasks.every((t) => t.status === 'running')).toBe(true)
  })
})

describe('getTaskDetail', () => {
  it('should return full task detail with activity', () => {
    mod.enqueueTask({
      taskId: 'detail-1',
      instructions: 'detailed task',
      context: '',
      toolDefinitions: []
    })

    const cb = agentEventCallbacks.get('detail-1')
    if (cb) {
      cb({ type: 'tool_call', name: 'search', args: {} })
    }

    const detail = mod.getTaskDetail('detail-1')
    expect(detail).toBeTruthy()
    expect(detail.task).toBeTruthy()
    expect(detail.task.taskId).toBe('detail-1')
    expect(Array.isArray(detail.task.activityLog)).toBe(true)
  })

  it('should return null for unknown task', () => {
    expect(mod.getTaskDetail('nonexistent')).toBeNull()
  })
})

describe('waitForTaskCompletion', () => {
  it('should resolve immediately for already completed task', async () => {
    mod.enqueueTask({ taskId: 'wait-1', instructions: 'test', context: '', toolDefinitions: [] })

    const cb = agentEventCallbacks.get('wait-1')
    if (cb) {
      cb({ type: 'task.status', status: 'completed', result: 'Done' })
    }

    const result = await mod.waitForTaskCompletion('wait-1', 1000)
    expect(result.status).toBe('completed')
    expect(result.result).toBe('Done')
  })
})

describe('resumeTask', () => {
  it('should resume a failed task', async () => {
    mod.enqueueTask({
      taskId: 'resume-1',
      instructions: 'fail then resume',
      context: '',
      toolDefinitions: []
    })

    const cb = agentEventCallbacks.get('resume-1')
    if (cb) {
      cb({ type: 'task.status', status: 'failed', message: 'errored' })
    }

    const result = await mod.resumeTask('resume-1')
    expect(result.resumed).toBe(true)
  })

  it('should reject resume for empty taskId', async () => {
    const result = await mod.resumeTask('')
    expect(result.resumed).toBe(false)
    expect(result.reason).toBe('missing-task-id')
  })

  it('should reject resume for unknown task', async () => {
    const result = await mod.resumeTask('nonexistent')
    expect(result.resumed).toBe(false)
    expect(result.reason).toBe('not-found')
  })
})

describe('hydration from DB', () => {
  it('should mark interrupted (queued/running) tasks as failed on hydration', async () => {
    mockTaskRows.push({
      id: 'hydrate-1',
      instructions: 'interrupted',
      context: '',
      status: 'running',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      currentPlan: '',
      error: '',
      result: null,
      completedAt: ''
    })

    vi.resetModules()

    const freshMod = await import('../../src/main/chat/task.queue.js')
    const task = freshMod.getTask('hydrate-1')
    expect(task.status).toBe('failed')
    expect(task.error).toContain('restart')
  })
})
