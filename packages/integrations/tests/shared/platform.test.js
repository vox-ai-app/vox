import { describe, it, expect, vi, beforeEach } from 'vitest'

describe('shared/platform — resolveExecutors', () => {
  let resolveExecutors

  beforeEach(async () => {
    vi.resetModules()
    ;({ resolveExecutors } = await import('../../src/shared/platform.js'))
  })

  it('should resolve darwin fns when on darwin', () => {
    const fn = vi.fn()
    const executors = resolveExecutors({ darwin: { my_tool: fn } }, 'Test')
    expect(typeof executors.my_tool).toBe('function')
    const inner = executors.my_tool({})
    expect(inner).toBe(fn)
  })

  it('should collect tool names across all platforms', () => {
    const executors = resolveExecutors(
      {
        darwin: { tool_a: vi.fn(), tool_b: vi.fn() },
        win32: { tool_b: vi.fn(), tool_c: vi.fn() }
      },
      'Test'
    )
    expect(Object.keys(executors).sort()).toEqual(['tool_a', 'tool_b', 'tool_c'])
  })

  it('should return fallback for tools missing on current platform', () => {
    const executors = resolveExecutors(
      {
        win32: { win_tool: vi.fn() }
      },
      'TestLabel'
    )
    const fn = executors.win_tool({})
    expect(() => fn()).toThrow('TestLabel tools are not available on')
  })
})

describe('shared/platform — makePlatformTools', () => {
  let makePlatformTools

  beforeEach(async () => {
    vi.resetModules()
    ;({ makePlatformTools } = await import('../../src/shared/platform.js'))
  })

  it('should zip definitions with executors by name', () => {
    const defs = [{ name: 'a' }, { name: 'b' }]
    const execs = { a: () => () => 'exec-a', b: () => () => 'exec-b' }
    const tools = makePlatformTools(defs, execs)
    expect(tools).toHaveLength(2)
    expect(tools[0].definition).toBe(defs[0])
    expect(tools[0].execute).toBe(execs.a)
    expect(tools[1].definition).toBe(defs[1])
    expect(tools[1].execute).toBe(execs.b)
  })
})
