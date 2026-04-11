import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockExec = () => ({
  execAbortable: vi.fn().mockResolvedValue({ stdout: '' }),
  esc: (s) => String(s).replace(/"/g, '\\"'),
  EXEC_TIMEOUT: 120000,
  writeTempScript: vi.fn().mockResolvedValue('/tmp/t.scpt'),
  cleanupTemp: vi.fn()
})

describe('calendar — definitions', () => {
  let CALENDAR_TOOL_DEFINITIONS

  beforeEach(async () => {
    vi.resetModules()
    ;({ CALENDAR_TOOL_DEFINITIONS } = await import('../src/calendar/def.js'))
  })

  it('should export 4 tool definitions', () => {
    expect(CALENDAR_TOOL_DEFINITIONS).toHaveLength(4)
  })

  it('should define list, create, update, delete events', () => {
    const names = CALENDAR_TOOL_DEFINITIONS.map((d) => d.name)
    expect(names).toEqual(['list_events', 'create_event', 'update_event', 'delete_event'])
  })

  it('create_event should require title + start_date', () => {
    const def = CALENDAR_TOOL_DEFINITIONS.find((d) => d.name === 'create_event')
    expect(def.parameters.required).toContain('title')
    expect(def.parameters.required).toContain('start_date')
  })
})

describe('calendar — tools wiring', () => {
  let CALENDAR_TOOLS

  beforeEach(async () => {
    vi.resetModules()
    vi.doMock('@vox-ai-app/tools/exec', mockExec)
    ;({ CALENDAR_TOOLS } = await import('../src/calendar/tools.js'))
  })

  it('should export 4 tools', () => {
    expect(CALENDAR_TOOLS).toHaveLength(4)
  })

  it('each tool should have definition + execute', () => {
    for (const tool of CALENDAR_TOOLS) {
      expect(typeof tool.definition.name).toBe('string')
      expect(typeof tool.execute).toBe('function')
    }
  })
})

describe('calendar/mac — listEventsMac', () => {
  let listEventsMac, mockExecAbortable

  beforeEach(async () => {
    vi.resetModules()
    mockExecAbortable = vi.fn().mockResolvedValue({ stdout: '' })
    vi.doMock('@vox-ai-app/tools/exec', () => ({
      ...mockExec(),
      execAbortable: mockExecAbortable
    }))
    ;({ listEventsMac } = await import('../src/calendar/mac/index.js'))
  })

  it('should return empty events array when no output', async () => {
    const result = await listEventsMac({})
    expect(result).toEqual({
      count: 0,
      total: 0,
      limit: 25,
      offset: 0,
      has_more: false,
      events: []
    })
  })

  it('should parse tab-separated output into event objects', async () => {
    mockExecAbortable.mockResolvedValue({
      stdout: 'uid1\tMeeting\t4/11/2025 10:00\t4/11/2025 11:00\tOffice\tNotes here\tWork\n'
    })
    const result = await listEventsMac({})
    expect(result.count).toBe(1)
    expect(result.total).toBe(1)
    expect(result.events[0]).toEqual({
      id: 'uid1',
      title: 'Meeting',
      start: '4/11/2025 10:00',
      end: '4/11/2025 11:00',
      location: 'Office',
      notes: 'Notes here',
      calendar: 'Work'
    })
  })

  it('should paginate results with limit and offset', async () => {
    const lines = Array.from(
      { length: 30 },
      (_, i) => `uid${i}\tEvent ${i}\t4/11/2025 10:00\t4/11/2025 11:00\t\t\tWork\n`
    ).join('')
    mockExecAbortable.mockResolvedValue({ stdout: lines })
    const result = await listEventsMac({ limit: 5, offset: 25 })
    expect(result.total).toBe(30)
    expect(result.count).toBe(5)
    expect(result.offset).toBe(25)
    expect(result.has_more).toBe(false)
    expect(result.events[0].id).toBe('uid25')
  })

  it('should cap limit at 200', async () => {
    const result = await listEventsMac({ limit: 500 })
    expect(result.limit).toBe(200)
  })
})

describe('calendar/mac — createEventMac', () => {
  let createEventMac

  beforeEach(async () => {
    vi.resetModules()
    vi.doMock('@vox-ai-app/tools/exec', () => ({
      ...mockExec(),
      execAbortable: vi.fn().mockResolvedValue({ stdout: 'new-uid-123\n' })
    }))
    ;({ createEventMac } = await import('../src/calendar/mac/index.js'))
  })

  it('should throw if title is missing', async () => {
    await expect(createEventMac({})).rejects.toThrow('"title" is required')
  })

  it('should throw if start_date is missing', async () => {
    await expect(createEventMac({ title: 'Test' })).rejects.toThrow('"start_date" is required')
  })

  it('should return created status with event_id', async () => {
    const result = await createEventMac({
      title: 'Lunch',
      start_date: '2025-04-11T12:00:00'
    })
    expect(result.status).toBe('created')
    expect(result.event_id).toBe('new-uid-123')
    expect(result.title).toBe('Lunch')
  })
})

describe('calendar/mac — updateEventMac', () => {
  let updateEventMac

  beforeEach(async () => {
    vi.resetModules()
    vi.doMock('@vox-ai-app/tools/exec', () => ({
      ...mockExec(),
      execAbortable: vi.fn().mockResolvedValue({ stdout: 'updated\n' })
    }))
    ;({ updateEventMac } = await import('../src/calendar/mac/index.js'))
  })

  it('should throw if event_id is missing', async () => {
    await expect(updateEventMac({})).rejects.toThrow('"event_id" is required')
  })

  it('should return no_changes when no fields provided', async () => {
    const result = await updateEventMac({ event_id: 'uid1' })
    expect(result.status).toBe('no_changes')
  })

  it('should return updated status', async () => {
    const result = await updateEventMac({ event_id: 'uid1', title: 'New Title' })
    expect(result.status).toBe('updated')
  })
})

describe('calendar/mac — deleteEventMac', () => {
  let deleteEventMac

  beforeEach(async () => {
    vi.resetModules()
    vi.doMock('@vox-ai-app/tools/exec', () => ({
      ...mockExec(),
      execAbortable: vi.fn().mockResolvedValue({ stdout: 'deleted\n' })
    }))
    ;({ deleteEventMac } = await import('../src/calendar/mac/index.js'))
  })

  it('should throw if event_id is missing', async () => {
    await expect(deleteEventMac({})).rejects.toThrow('"event_id" is required')
  })

  it('should return deleted status', async () => {
    const result = await deleteEventMac({ event_id: 'uid1' })
    expect(result.status).toBe('deleted')
  })
})
