import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockStreamChat } = vi.hoisted(() => ({
  mockStreamChat: vi.fn()
}))

vi.mock('crypto', () => ({
  randomUUID: () => {
    const hex = () => Math.floor(Math.random() * 16).toString(16)
    return [8, 4, 4, 4, 12].map((n) => Array.from({ length: n }, hex).join('')).join('-')
  },
  createHash: (_algo) => ({
    update: (_data) => ({ digest: (_enc) => 'abcdef1234567890abcdef1234567890' })
  })
}))

vi.mock('electron-log', () => ({
  default: {
    initialize: vi.fn(),
    transports: {
      file: { level: 'info', format: '' },
      console: { level: 'warn' }
    }
  }
}))

vi.mock('@electron-toolkit/utils', () => ({
  is: { dev: false }
}))

vi.mock('../../../../src/main/ai/config.js', () => ({
  CONTEXT_SIZE: 4096,
  CONTEXT_KEEP_RECENT_CHARS: 8000
}))

vi.mock('../../../../src/main/storage/tasks.db.js', () => ({
  searchTasksFts: vi.fn(() => []),
  searchKnowledgePatterns: vi.fn(() => []),
  insertKnowledgePattern: vi.fn(),
  indexTaskEmbedding: vi.fn(async () => {})
}))

vi.mock('../../../../src/main/core/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}))

beforeEach(() => {
  mockStreamChat.mockReset()
  mockStreamChat.mockImplementation(async function* () {
    yield { type: 'text', content: '' }
  })
})

describe('createJournal', async () => {
  const { createJournal } =
    await import('../../../../src/main/chat/agent/journal/journal.schema.js')

  it('should create journal with all required fields', () => {
    const j = createJournal()
    expect(j.understanding).toBe('')
    expect(j.thoughts).toEqual([])
    expect(j.discoveries).toEqual([])
    expect(j.completed).toEqual([])
    expect(j.currentPlan).toBe('')
    expect(j.blockers).toEqual([])
    expect(j.blockersEncountered).toEqual([])
    expect(j.done).toBe(false)
    expect(j.doneReason).toBe('')
  })

  it('should create independent instances', () => {
    const j1 = createJournal()
    const j2 = createJournal()
    j1.thoughts.push('thought1')
    expect(j2.thoughts).toHaveLength(0)
  })
})

describe('createJournalTool', async () => {
  const { createJournal } =
    await import('../../../../src/main/chat/agent/journal/journal.schema.js')
  const { createJournalTool } =
    await import('../../../../src/main/chat/agent/journal/journal.tool.js')

  let journal
  let onUpdate
  let tool

  beforeEach(() => {
    journal = createJournal()
    onUpdate = vi.fn()
    tool = createJournalTool(journal, onUpdate)
  })

  it('should have update_journal definition', () => {
    expect(tool.definition.name).toBe('update_journal')
    expect(tool.definition.parameters.properties.understanding).toBeDefined()
    expect(tool.definition.parameters.properties.done).toBeDefined()
  })

  it('should update scalar fields', async () => {
    const execute = tool.execute()
    await execute({ understanding: 'I get it', currentPlan: 'Step 1' })
    expect(journal.understanding).toBe('I get it')
    expect(journal.currentPlan).toBe('Step 1')
  })

  it('should append to array fields', async () => {
    const execute = tool.execute()
    await execute({ thoughts: ['thought A'] })
    await execute({ thoughts: ['thought B'] })
    expect(journal.thoughts).toEqual(['thought A', 'thought B'])
  })

  it('should set done and doneReason', async () => {
    const execute = tool.execute()
    await execute({ done: true, doneReason: 'Task completed successfully' })
    expect(journal.done).toBe(true)
    expect(journal.doneReason).toBe('Task completed successfully')
  })

  it('should handle blockers and clearBlockers', async () => {
    const execute = tool.execute()
    await execute({ blockers: ['Cannot access API'] })
    expect(journal.blockers).toEqual(['Cannot access API'])
    expect(journal.blockersEncountered).toEqual(['Cannot access API'])

    await execute({ clearBlockers: true })
    expect(journal.blockers).toEqual([])
    expect(journal.blockersEncountered).toEqual(['Cannot access API'])
  })

  it('should fire onUpdate callback', async () => {
    const execute = tool.execute()
    await execute({ understanding: 'test' })
    expect(onUpdate).toHaveBeenCalledWith(journal)
  })

  it('should support rollback to checkpoint 1 (state after first update)', async () => {
    const execute = tool.execute()
    await execute({ thoughts: ['a'], completed: ['step 1'] })
    await execute({ thoughts: ['b'], completed: ['step 2'] })
    await execute({ rollbackTo: 1 })
    expect(journal.thoughts).toEqual(['a'])
    expect(journal.completed).toEqual(['step 1'])
    expect(journal.blockers).toEqual([])
  })

  it('should cap arrays at 100 entries', async () => {
    const execute = tool.execute()
    const bigArray = Array.from({ length: 120 }, (_, i) => `item ${i}`)
    await execute({ thoughts: bigArray })
    expect(journal.thoughts.length).toBeLessThanOrEqual(100)
  })
})

describe('createStallDetector', async () => {
  vi.mock('../../../../src/main/chat/agent/prompts/index.js', () => ({
    stallNudge: (count) => `Stalled for ${count} iterations`,
    assumptionCheckPrompt: (blockers) => `Check assumptions about: ${blockers.join(', ')}`
  }))

  const { createStallDetector } =
    await import('../../../../src/main/chat/agent/detectors/stall.detector.js')

  let detector

  beforeEach(() => {
    detector = createStallDetector()
  })

  it('should not report stall when plan and completed change', () => {
    const journal = {
      currentPlan: 'plan A',
      completed: ['step 1'],
      understanding: 'test',
      blockers: []
    }
    const result = detector.check(journal, true)
    expect(result.stalled).toBe(false)
    expect(result.stalledFor).toBe(0)
  })

  it('should detect stall after unchanged iterations', () => {
    const journal = { currentPlan: 'plan A', completed: [], understanding: 'test', blockers: [] }
    detector.check(journal, true)
    detector.check(journal, true)
    const result = detector.check(journal, true)
    expect(result.stalledFor).toBeGreaterThanOrEqual(2)
    expect(result.nudge).toBeTruthy()
  })

  it('should reset stall count when progress is made', () => {
    const journal = { currentPlan: 'plan A', completed: [], understanding: 'test', blockers: [] }
    detector.check(journal, true)
    detector.check(journal, true)

    journal.completed = ['done step 1']
    const result = detector.check(journal, true)
    expect(result.stalledFor).toBe(0)
    expect(result.stalled).toBe(false)
  })

  it('should detect planning phase stall', () => {
    const journal = { currentPlan: '', completed: [], understanding: '', blockers: [] }
    detector.check(journal, false)
    detector.check(journal, false)
    const result = detector.check(journal, false)
    expect(result.stalledFor).toBeGreaterThanOrEqual(3)
    expect(result.nudge).toContain('planning phase')
  })

  it('should reset via reset method', () => {
    const journal = { currentPlan: 'x', completed: [], understanding: 'y', blockers: [] }
    detector.check(journal, true)
    detector.check(journal, true)
    detector.reset()
    const result = detector.check(journal, true)
    expect(result.stalledFor).toBe(0)
  })
})

describe('createRepetitionDetector', async () => {
  const { createRepetitionDetector } =
    await import('../../../../src/main/chat/agent/detectors/repetition.detector.js')

  let detector

  beforeEach(() => {
    detector = createRepetitionDetector()
  })

  it('should not detect repetition with fewer than 3 actions', () => {
    detector.record('web_search', { q: 'test' }, 'result')
    detector.record('web_search', { q: 'test' }, 'result')
    expect(detector.detectRepetition()).toBeNull()
  })

  it('should detect same action repeated 3 times', () => {
    detector.record('web_search', { q: 'test' }, 'result')
    detector.record('web_search', { q: 'test' }, 'result')
    detector.record('web_search', { q: 'test' }, 'result')
    const result = detector.detectRepetition()
    expect(result).not.toBeNull()
    expect(result.type).toBe('same_action_repeated')
  })

  it('should detect same failing action repeated 3 times', () => {
    detector.record('web_search', { q: 'test' }, 'Error: connection failed')
    detector.record('web_search', { q: 'test' }, 'Error: connection failed')
    detector.record('web_search', { q: 'test' }, 'Error: connection failed')
    const result = detector.detectRepetition()
    expect(result).not.toBeNull()
    expect(result.type).toBe('same_failing_action')
  })

  it('should not detect repetition for different actions', () => {
    detector.record('web_search', { q: 'a' }, 'r1')
    detector.record('fetch_page', { url: 'b' }, 'r2')
    detector.record('execute_code', { code: 'c' }, 'r3')
    expect(detector.detectRepetition()).toBeNull()
  })

  it('should detect high failure rate', () => {
    for (let i = 0; i < 6; i++) {
      detector.record(`tool_${i}`, { x: i }, i < 5 ? 'Error: failed' : 'ok')
    }
    const result = detector.detectRepetition()
    expect(result).not.toBeNull()
    expect(result.type).toBe('high_failure_rate')
  })

  it('should clear history', () => {
    detector.record('a', {}, 'Error: x')
    detector.record('a', {}, 'Error: x')
    detector.record('a', {}, 'Error: x')
    detector.clear()
    expect(detector.detectRepetition()).toBeNull()
  })
})

describe('validateToolResult', async () => {
  const { validateToolResult, buildValidationPrompt } =
    await import('../../../../src/main/chat/agent/detectors/result.validator.js')

  it('should return empty array for normal result', () => {
    const warnings = validateToolResult('test', { output: 'some data' })
    expect(warnings.length).toBe(0)
  })

  it('should warn for null result', () => {
    const warnings = validateToolResult('test', null)
    expect(warnings.some((w) => w.includes('null'))).toBe(true)
  })

  it('should warn for error result', () => {
    const warnings = validateToolResult('test', { error: 'permission denied' })
    expect(warnings.some((w) => w.includes('error'))).toBe(true)
    expect(warnings.some((w) => w.includes('permission'))).toBe(true)
  })

  it('should warn for non-zero exit code', () => {
    const warnings = validateToolResult('test', { exitCode: 1 })
    expect(warnings.some((w) => w.includes('exit code'))).toBe(true)
  })

  it('should not warn for empty string output due to falsy || chain', () => {
    const warnings = validateToolResult('test', { output: '' })
    expect(warnings.length).toBe(0)
  })

  it('should warn for whitespace-only output', () => {
    const warnings = validateToolResult('test', { output: '   ' })
    expect(warnings.some((w) => /[Ee]mpty/.test(w))).toBe(true)
  })

  it('should warn for empty array result', () => {
    const warnings = validateToolResult('search', [])
    expect(warnings.some((w) => w.includes('empty array'))).toBe(true)
  })

  it('should detect connection refused in output', () => {
    const warnings = validateToolResult('test', { output: 'ECONNREFUSED on port 3000' })
    expect(warnings.some((w) => /service|running/i.test(w))).toBe(true)
  })

  it('should detect timeout in output', () => {
    const warnings = validateToolResult('test', { output: 'Request timed out' })
    expect(warnings.some((w) => /too long|network/i.test(w))).toBe(true)
  })

  it('should detect module not found', () => {
    const warnings = validateToolResult('test', { error: 'Cannot find module express' })
    expect(warnings.some((w) => /dependency|package/i.test(w))).toBe(true)
  })

  it('should build validation prompt from warnings', () => {
    const prompt = buildValidationPrompt('my_tool', ['Result is null', 'Check permissions'])
    expect(prompt).toContain('my_tool')
    expect(prompt).toContain('Result is null')
    expect(prompt).toContain('VALIDATION WARNING')
  })

  it('should return null prompt when no warnings', () => {
    expect(buildValidationPrompt('my_tool', [])).toBeNull()
  })
})

describe('result.store', async () => {
  vi.mock('fs', () => ({
    writeFileSync: vi.fn(),
    readFileSync: vi.fn(() => 'x'.repeat(25000)),
    mkdirSync: vi.fn()
  }))

  const { storeResult, readResult, createReadResultTool, STORE_THRESHOLD } =
    await import('../../../../src/main/chat/agent/result.store.js')

  it('should have STORE_THRESHOLD of 50000', () => {
    expect(STORE_THRESHOLD).toBe(50000)
  })

  it('should return a resultId when storing', () => {
    const id = storeResult('task-1', 'some content')
    expect(typeof id).toBe('string')
    expect(id.length).toBeGreaterThan(0)
  })

  it('should read result in chunks of 20000 chars', () => {
    const id = storeResult('task-1', 'some content')
    const result = readResult('task-1', id, 0)
    expect(result.chunk.length).toBeLessThanOrEqual(20000)
    expect(result.offset).toBe(0)
    expect(result.total).toBe(25000)
    expect(result.remaining).toBe(5000)
  })

  it('should reject invalid result IDs', () => {
    expect(() => readResult('task-1', '../../../etc/passwd', 0)).toThrow('Invalid result ID')
  })

  it('should create read_result tool definition', () => {
    const tool = createReadResultTool('task-1')
    expect(tool.definition.name).toBe('read_result')
    expect(tool.definition.parameters.properties.resultId).toBeDefined()
    expect(tool.definition.parameters.properties.offset).toBeDefined()
  })
})

describe('task.builders', async () => {
  const {
    normalizeLimit,
    buildTaskObject,
    buildTaskStatusResponse,
    buildHistoryTask,
    buildActivityEvent
  } = await import('../../../../src/main/chat/task.builders.js')

  it('normalizeLimit should handle valid numbers', () => {
    expect(normalizeLimit(25)).toBe(25)
    expect(normalizeLimit('10')).toBe(10)
  })

  it('normalizeLimit should fallback for invalid input', () => {
    expect(normalizeLimit(null)).toBe(50)
    expect(normalizeLimit(NaN)).toBe(50)
    expect(normalizeLimit(-5)).toBe(50)
    expect(normalizeLimit(0)).toBe(50)
    expect(normalizeLimit('abc')).toBe(50)
  })

  it('normalizeLimit should accept custom fallback', () => {
    expect(normalizeLimit(null, 20)).toBe(20)
  })

  it('buildTaskObject should return null for unknown task', () => {
    const meta = new Map()
    expect(buildTaskObject(meta, 'unknown')).toBeNull()
  })

  it('buildTaskObject should format task correctly', () => {
    const meta = new Map()
    meta.set('t1', {
      taskId: 't1',
      instructions: 'Do X',
      context: 'ctx',
      status: 'running',
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:01:00.000Z',
      currentPlan: 'Step 1',
      message: '',
      result: 'partial',
      completedAt: '',
      failedAt: ''
    })

    const task = buildTaskObject(meta, 't1')
    expect(task.taskId).toBe('t1')
    expect(task.status).toBe('running')
    expect(task.currentPlan).toBe('Step 1')
    expect(task.instructions).toBe('Do X')
    expect(task.resultPreview).toBe('partial')
  })

  it('buildTaskObject should truncate long results to 200 chars', () => {
    const meta = new Map()
    meta.set('t2', {
      taskId: 't2',
      instructions: 'test',
      context: '',
      status: 'completed',
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
      currentPlan: '',
      message: '',
      result: 'x'.repeat(500),
      completedAt: '2025-01-01T00:05:00.000Z',
      failedAt: ''
    })

    const task = buildTaskObject(meta, 't2')
    expect(task.resultPreview.length).toBe(200)
  })

  it('buildTaskStatusResponse should format response', () => {
    const task = {
      taskId: 't1',
      status: 'completed',
      instructions: 'Do X',
      spawnInstructions: 'Do X',
      resultPreview: 'Done',
      spawnedAt: '2025-01-01T00:00:00.000Z',
      completedAt: '2025-01-01T00:05:00.000Z',
      failedAt: '',
      message: '',
      currentPlan: ''
    }
    const resp = buildTaskStatusResponse(task)
    expect(resp.id).toBe('t1')
    expect(resp.status).toBe('completed')
    expect(resp.result).toBe('Done')
  })

  it('buildTaskStatusResponse should return null for null task', () => {
    expect(buildTaskStatusResponse(null)).toBeNull()
  })

  it('buildHistoryTask should format task for history', () => {
    const task = {
      taskId: 't1',
      status: 'completed',
      instructions: 'Do X',
      spawnedAt: '2025-01-01T00:00:00.000Z',
      completedAt: '2025-01-01T00:05:00.000Z',
      failedAt: '',
      currentPlan: ''
    }
    const hist = buildHistoryTask(task)
    expect(hist.id).toBe('t1')
    expect(hist.status).toBe('completed')
    expect(hist.instructions).toBe('Do X')
  })

  it('buildActivityEvent should create event with unique id', () => {
    const event = buildActivityEvent('t1', { type: 'tool_call', name: 'search' })
    expect(event.id).toMatch(/^activity-/)
    expect(event.taskId).toBe('t1')
    expect(event.type).toBe('tool_call')
    expect(event.name).toBe('search')
    expect(event.createdAt).toBeTruthy()
  })

  it('buildActivityEvent should include result for tool_result', () => {
    const event = buildActivityEvent('t1', { type: 'tool_result', result: 'found it' })
    expect(event.result).toBe('found it')
  })

  it('buildActivityEvent should not include result for non-tool_result', () => {
    const event = buildActivityEvent('t1', { type: 'tool_call', name: 'x' })
    expect(event.result).toBeNull()
  })
})

describe('runAgentLoop', () => {
  let runAgentLoop

  beforeEach(async () => {
    vi.resetModules()
    const clientModule = await import('../../../../src/main/ai/llm/client.js')
    vi.spyOn(clientModule, 'streamChat').mockImplementation((...args) => mockStreamChat(...args))
    ;({ runAgentLoop } = await import('../../../../src/main/chat/agent/agent.runner.js'))
  })

  function _makeToolEmit(toolCalls, followupText) {
    let callCount = 0
    return async function* () {
      callCount++
      if (callCount === 1) {
        for (const tc of toolCalls) {
          yield { type: 'tool_call', id: tc.id, name: tc.name, args: tc.args }
        }
      } else {
        yield { type: 'text', content: followupText || '' }
      }
    }
  }

  it('should assign correct tool_call_id when same tool called multiple times', async () => {
    const capturedMessages = []
    let callCount = 0

    mockStreamChat.mockImplementation(async function* () {
      callCount++
      if (callCount === 1) {
        yield { type: 'tool_call', id: 'call_x1', name: 'web_search', args: { q: 'first' } }
        yield { type: 'tool_call', id: 'call_x2', name: 'web_search', args: { q: 'second' } }
      } else if (callCount === 2) {
        yield {
          type: 'tool_call',
          id: 'call_j1',
          name: 'update_journal',
          args: { done: true, doneReason: 'Searches completed' }
        }
      } else {
        yield { type: 'text', content: '' }
      }
    })

    const toolExecutions = []
    const executeToolFn = async (name, args) => {
      toolExecutions.push({ name, args })
      return JSON.stringify({ results: [`result for ${args.q}`] })
    }

    const toolDefs = [
      { name: 'web_search', parameters: { type: 'object', properties: { q: { type: 'string' } } } }
    ]

    const emitted = []
    const _result = await runAgentLoop({
      taskId: 'test-dup-ids',
      systemPrompt: 'You are a test agent',
      instructions: 'Search for two things',
      context: '',
      toolDefinitions: toolDefs,
      executeToolFn,
      signal: null,
      emit: (e) => {
        emitted.push(e)
        if (e.type === 'tool_result') {
          capturedMessages.push(e)
        }
      },
      summarize: null
    })

    expect(toolExecutions).toHaveLength(2)
    expect(toolExecutions[0].args.q).toBe('first')
    expect(toolExecutions[1].args.q).toBe('second')

    const toolResultEvents = emitted.filter(
      (e) => e.type === 'tool_result' && e.name !== 'update_journal'
    )
    expect(toolResultEvents).toHaveLength(2)
  })

  it('should emit tool_call and tool_result events for each tool', async () => {
    let callCount = 0

    mockStreamChat.mockImplementation(async function* () {
      callCount++
      if (callCount === 1) {
        yield { type: 'tool_call', id: 'call_s', name: 'search', args: { q: 'test' } }
      } else if (callCount === 2) {
        yield {
          type: 'tool_call',
          id: 'call_j',
          name: 'update_journal',
          args: { done: true, doneReason: 'Done' }
        }
      } else {
        yield { type: 'text', content: '' }
      }
    })

    const emitted = []
    await runAgentLoop({
      taskId: 'test-events',
      systemPrompt: 'sys',
      instructions: 'test',
      context: '',
      toolDefinitions: [{ name: 'search', parameters: { type: 'object', properties: {} } }],
      executeToolFn: async () => JSON.stringify({ ok: true }),
      signal: null,
      emit: (e) => emitted.push(e),
      summarize: null
    })

    const toolCalls = emitted.filter((e) => e.type === 'tool_call')
    const toolResults = emitted.filter((e) => e.type === 'tool_result')
    expect(toolCalls.length).toBeGreaterThanOrEqual(1)
    expect(toolResults.length).toBeGreaterThanOrEqual(1)
    expect(toolCalls[0].name).toBe('search')
  })

  it('should stop after max no-progress iterations', async () => {
    mockStreamChat.mockImplementation(async function* () {
      yield { type: 'text', content: 'thinking...' }
    })

    const emitted = []
    const _result = await runAgentLoop({
      taskId: 'test-stall',
      systemPrompt: 'sys',
      instructions: 'test',
      context: '',
      toolDefinitions: [],
      executeToolFn: async () => 'ok',
      signal: null,
      emit: (e) => emitted.push(e),
      summarize: null
    })

    const noProgressMsg = emitted.find(
      (e) => e.type === 'thought' && e.content.includes('No progress')
    )
    expect(noProgressMsg).toBeTruthy()
  })

  it('should respect abort signal', async () => {
    const controller = new AbortController()
    controller.abort()

    mockStreamChat.mockImplementation(async function* () {
      yield { type: 'text', content: 'should not see this' }
    })

    await expect(
      runAgentLoop({
        taskId: 'test-abort',
        systemPrompt: 'sys',
        instructions: 'test',
        context: '',
        toolDefinitions: [],
        executeToolFn: async () => 'ok',
        signal: controller.signal,
        emit: vi.fn(),
        summarize: null
      })
    ).rejects.toThrow('cancelled')
  })
})
