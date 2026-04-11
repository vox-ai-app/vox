import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockExec = () => ({
  execAbortable: vi.fn().mockResolvedValue({ stdout: 'Shortcut1\nShortcut2\n' }),
  EXEC_TIMEOUT: 120000,
  shellEsc: (s) => s
})

describe('shortcuts — definitions', () => {
  let SHORTCUTS_TOOL_DEFINITIONS

  beforeEach(async () => {
    vi.resetModules()
    ;({ SHORTCUTS_TOOL_DEFINITIONS } = await import('../src/shortcuts/def.js'))
  })

  it('should export 2 tool definitions', () => {
    expect(SHORTCUTS_TOOL_DEFINITIONS).toHaveLength(2)
  })

  it('should define list_shortcuts and run_shortcut', () => {
    const names = SHORTCUTS_TOOL_DEFINITIONS.map((d) => d.name)
    expect(names).toContain('list_shortcuts')
    expect(names).toContain('run_shortcut')
  })

  it('run_shortcut should require name param', () => {
    const def = SHORTCUTS_TOOL_DEFINITIONS.find((d) => d.name === 'run_shortcut')
    expect(def.parameters.required).toContain('name')
  })
})

describe('shortcuts — tools wiring', () => {
  let SHORTCUTS_TOOLS

  beforeEach(async () => {
    vi.resetModules()
    vi.doMock('@vox-ai-app/tools/exec', mockExec)
    ;({ SHORTCUTS_TOOLS } = await import('../src/shortcuts/tools.js'))
  })

  it('should export 2 tools', () => {
    expect(SHORTCUTS_TOOLS).toHaveLength(2)
  })

  it('run_shortcut executor should throw when name is missing', () => {
    const tool = SHORTCUTS_TOOLS.find((t) => t.definition.name === 'run_shortcut')
    const fn = tool.execute({})
    expect(() => fn({}, {})).toThrow('"name" is required')
  })
})

describe('shortcuts/mac — listShortcutsMac', () => {
  let listShortcutsMac

  beforeEach(async () => {
    vi.resetModules()
    vi.doMock('@vox-ai-app/tools/exec', () => ({
      execAbortable: vi.fn().mockResolvedValue({ stdout: 'Shortcut A\nShortcut B\n' }),
      EXEC_TIMEOUT: 120000,
      shellEsc: (s) => s
    }))
    ;({ listShortcutsMac } = await import('../src/shortcuts/mac/index.js'))
  })

  it('should return list of shortcuts with count and pagination', async () => {
    const result = await listShortcutsMac({})
    expect(result.count).toBe(2)
    expect(result.total).toBe(2)
    expect(result.limit).toBe(100)
    expect(result.offset).toBe(0)
    expect(result.has_more).toBe(false)
    expect(result.shortcuts).toEqual(['Shortcut A', 'Shortcut B'])
  })
})

describe('shortcuts/mac — runShortcutMac', () => {
  let runShortcutMac

  beforeEach(async () => {
    vi.resetModules()
    vi.doMock('@vox-ai-app/tools/exec', () => ({
      execAbortable: vi.fn().mockResolvedValue({ stdout: 'output data\n' }),
      EXEC_TIMEOUT: 120000,
      shellEsc: (s) => s
    }))
    ;({ runShortcutMac } = await import('../src/shortcuts/mac/index.js'))
  })

  it('should return shortcut name and output', async () => {
    const result = await runShortcutMac({ name: 'My Shortcut' })
    expect(result.shortcut).toBe('My Shortcut')
    expect(result.output).toBe('output data')
  })
})
