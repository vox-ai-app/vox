import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockExec = () => ({
  execAbortable: vi.fn().mockResolvedValue({ stdout: '' }),
  esc: (s) => String(s).replace(/"/g, '\\"'),
  EXEC_TIMEOUT: 120000,
  writeTempScript: vi.fn().mockResolvedValue('/tmp/t.scpt'),
  cleanupTemp: vi.fn()
})

describe('reminders — definitions', () => {
  let REMINDERS_TOOL_DEFINITIONS

  beforeEach(async () => {
    vi.resetModules()
    ;({ REMINDERS_TOOL_DEFINITIONS } = await import('../src/reminders/def.js'))
  })

  it('should export 3 tool definitions', () => {
    expect(REMINDERS_TOOL_DEFINITIONS).toHaveLength(3)
  })

  it('should define list, create, complete reminders', () => {
    const names = REMINDERS_TOOL_DEFINITIONS.map((d) => d.name)
    expect(names).toEqual(['list_reminders', 'create_reminder', 'complete_reminder'])
  })

  it('create_reminder should require title', () => {
    const def = REMINDERS_TOOL_DEFINITIONS.find((d) => d.name === 'create_reminder')
    expect(def.parameters.required).toContain('title')
  })
})

describe('reminders — tools wiring', () => {
  let REMINDERS_TOOLS

  beforeEach(async () => {
    vi.resetModules()
    vi.doMock('@vox-ai-app/tools/exec', mockExec)
    ;({ REMINDERS_TOOLS } = await import('../src/reminders/tools.js'))
  })

  it('should export 3 tools', () => {
    expect(REMINDERS_TOOLS).toHaveLength(3)
  })

  it('each tool should have definition + execute', () => {
    for (const tool of REMINDERS_TOOLS) {
      expect(typeof tool.definition.name).toBe('string')
      expect(typeof tool.execute).toBe('function')
    }
  })
})

describe('reminders/mac — listRemindersMac', () => {
  let listRemindersMac, mockExecAbortable

  beforeEach(async () => {
    vi.resetModules()
    mockExecAbortable = vi.fn().mockResolvedValue({ stdout: '' })
    vi.doMock('@vox-ai-app/tools/exec', () => ({
      ...mockExec(),
      execAbortable: mockExecAbortable
    }))
    ;({ listRemindersMac } = await import('../src/reminders/mac/index.js'))
  })

  it('should return empty reminders array when no output', async () => {
    const result = await listRemindersMac({})
    expect(result).toEqual({
      count: 0,
      total: 0,
      limit: 25,
      offset: 0,
      has_more: false,
      reminders: []
    })
  })

  it('should parse tab-separated output into reminder objects', async () => {
    mockExecAbortable.mockResolvedValue({
      stdout: 'rem1\tBuy milk\t4/12/2025 9:00\t0\tfalse\t\tGroceries\n'
    })
    const result = await listRemindersMac({})
    expect(result.count).toBe(1)
    expect(result.total).toBe(1)
    expect(result.reminders[0]).toEqual({
      id: 'rem1',
      title: 'Buy milk',
      due_date: '4/12/2025 9:00',
      priority: 0,
      completed: false,
      notes: '',
      list: 'Groceries'
    })
  })

  it('should paginate results with limit and offset', async () => {
    const lines = Array.from(
      { length: 30 },
      (_, i) => `rem${i}\tItem ${i}\t\t0\tfalse\t\tList\n`
    ).join('')
    mockExecAbortable.mockResolvedValue({ stdout: lines })
    const result = await listRemindersMac({ limit: 10, offset: 5 })
    expect(result.total).toBe(30)
    expect(result.count).toBe(10)
    expect(result.offset).toBe(5)
    expect(result.limit).toBe(10)
    expect(result.has_more).toBe(true)
    expect(result.reminders[0].id).toBe('rem5')
  })

  it('should cap limit at 200', async () => {
    const result = await listRemindersMac({ limit: 999 })
    expect(result.limit).toBe(200)
  })
})

describe('reminders/mac — createReminderMac', () => {
  let createReminderMac

  beforeEach(async () => {
    vi.resetModules()
    vi.doMock('@vox-ai-app/tools/exec', () => ({
      ...mockExec(),
      execAbortable: vi.fn().mockResolvedValue({ stdout: 'new-rem-id\n' })
    }))
    ;({ createReminderMac } = await import('../src/reminders/mac/index.js'))
  })

  it('should throw if title is missing', async () => {
    await expect(createReminderMac({})).rejects.toThrow('"title" is required')
  })

  it('should return created status with reminder_id', async () => {
    const result = await createReminderMac({ title: 'Buy milk' })
    expect(result.status).toBe('created')
    expect(result.reminder_id).toBe('new-rem-id')
    expect(result.title).toBe('Buy milk')
  })
})

describe('reminders/mac — completeReminderMac', () => {
  let completeReminderMac

  beforeEach(async () => {
    vi.resetModules()
    vi.doMock('@vox-ai-app/tools/exec', () => ({
      ...mockExec(),
      execAbortable: vi.fn().mockResolvedValue({ stdout: 'completed\n' })
    }))
    ;({ completeReminderMac } = await import('../src/reminders/mac/index.js'))
  })

  it('should throw if reminder_id is missing', async () => {
    await expect(completeReminderMac({})).rejects.toThrow('"reminder_id" is required')
  })

  it('should return completed status', async () => {
    const result = await completeReminderMac({ reminder_id: 'rem1' })
    expect(result.status).toBe('completed')
  })
})
