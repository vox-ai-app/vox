import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockExec = () => ({
  execAbortable: vi.fn().mockResolvedValue({ stdout: '' }),
  esc: (s) => String(s).replace(/"/g, '\\"'),
  EXEC_TIMEOUT: 120000,
  writeTempScript: vi.fn().mockResolvedValue('/tmp/t.scpt'),
  cleanupTemp: vi.fn()
})

describe('contacts — definitions', () => {
  let CONTACTS_TOOL_DEFINITIONS

  beforeEach(async () => {
    vi.resetModules()
    ;({ CONTACTS_TOOL_DEFINITIONS } = await import('../src/contacts/def.js'))
  })

  it('should export definitions array with 1 tool', () => {
    expect(CONTACTS_TOOL_DEFINITIONS).toHaveLength(1)
  })

  it('should define search_contacts with query param', () => {
    const def = CONTACTS_TOOL_DEFINITIONS[0]
    expect(def.name).toBe('search_contacts')
    expect(def.parameters.required).toContain('query')
    expect(def.parameters.properties.query.type).toBe('string')
  })
})

describe('contacts — tools wiring', () => {
  let CONTACTS_TOOLS

  beforeEach(async () => {
    vi.resetModules()
    vi.doMock('@vox-ai-app/tools/exec', mockExec)
    ;({ CONTACTS_TOOLS } = await import('../src/contacts/tools.js'))
  })

  it('should export 1 tool', () => {
    expect(CONTACTS_TOOLS).toHaveLength(1)
  })

  it('should have definition and execute for search_contacts', () => {
    const tool = CONTACTS_TOOLS[0]
    expect(tool.definition.name).toBe('search_contacts')
    expect(typeof tool.execute).toBe('function')
  })

  it('executor should throw when query is missing', () => {
    const fn = CONTACTS_TOOLS[0].execute({})
    expect(() => fn({}, {})).toThrow('"query" is required')
  })

  it('executor should return paginated results with defaults', async () => {
    const mockResults = Array.from({ length: 30 }, (_, i) => ({
      name: `Person ${i}`,
      emails: [],
      phones: [],
      organization: '',
      title: '',
      addresses: [],
      notes: ''
    }))
    vi.resetModules()
    vi.doMock('@vox-ai-app/tools/exec', mockExec)
    const macMod = await import('../src/contacts/mac/index.js')
    vi.spyOn(macMod, 'searchContactsMac').mockResolvedValue(mockResults)
    ;({ CONTACTS_TOOLS } = await import('../src/contacts/tools.js'))
    const fn = CONTACTS_TOOLS[0].execute({})
    const result = await fn({ query: 'P', limit: 10, offset: 5 }, {})
    expect(result.total).toBe(30)
    expect(result.count).toBe(10)
    expect(result.offset).toBe(5)
    expect(result.limit).toBe(10)
    expect(result.has_more).toBe(true)
    expect(result.contacts[0].name).toBe('Person 5')
  })
})

describe('contacts/mac — searchContactsMac', () => {
  let searchContactsMac, mockExecAbortable

  beforeEach(async () => {
    vi.resetModules()
    mockExecAbortable = vi.fn().mockResolvedValue({ stdout: '' })
    vi.doMock('@vox-ai-app/tools/exec', () => ({
      ...mockExec(),
      execAbortable: mockExecAbortable
    }))
    ;({ searchContactsMac } = await import('../src/contacts/mac/index.js'))
  })

  it('should return empty array for no matches', async () => {
    const result = await searchContactsMac('nobody')
    expect(result).toEqual([])
  })

  it('should parse full contact results', async () => {
    mockExecAbortable.mockResolvedValue({
      stdout:
        'John Smith\tjohn@example.com,j@work.com\t555-1234,555-5678\tAcme Inc\tEngineer\t123 Main St, NYC, NY 10001, US\tGood guy\n'
    })
    const result = await searchContactsMac('Smith')
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({
      name: 'John Smith',
      emails: ['john@example.com', 'j@work.com'],
      phones: ['555-1234', '555-5678'],
      organization: 'Acme Inc',
      title: 'Engineer',
      addresses: ['123 Main St, NYC, NY 10001, US'],
      notes: 'Good guy'
    })
  })

  it('should handle contacts with missing fields', async () => {
    mockExecAbortable.mockResolvedValue({
      stdout: 'Jane Doe\tjane@test.com\t\t\t\t\t\n'
    })
    const result = await searchContactsMac('Jane')
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('Jane Doe')
    expect(result[0].emails).toEqual(['jane@test.com'])
    expect(result[0].phones).toEqual([])
    expect(result[0].organization).toBe('')
    expect(result[0].title).toBe('')
    expect(result[0].addresses).toEqual([])
    expect(result[0].notes).toBe('')
  })
})
