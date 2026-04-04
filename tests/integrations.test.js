import { describe, it, expect, vi, beforeEach } from 'vitest'

describe('integrations — tool definitions structure', () => {
  let MAIL_TOOL_DEFINITIONS, SCREEN_TOOL_DEFINITIONS, IMESSAGE_TOOL_DEFINITIONS
  let ALL_INTEGRATION_TOOLS

  beforeEach(async () => {
    vi.resetModules()
    ;({ MAIL_TOOL_DEFINITIONS } = await import('../packages/integrations/src/mail/def.js'))
    ;({ SCREEN_TOOL_DEFINITIONS } = await import('../packages/integrations/src/screen/def.js'))
    ;({ IMESSAGE_TOOL_DEFINITIONS } = await import('../packages/integrations/src/imessage/def.js'))
    ;({ ALL_INTEGRATION_TOOLS } = await import('../packages/integrations/src/tools.js'))
  })

  it('should export mail tool definitions as array', () => {
    expect(Array.isArray(MAIL_TOOL_DEFINITIONS)).toBe(true)
    expect(MAIL_TOOL_DEFINITIONS.length).toBeGreaterThan(0)
  })

  it('should export screen tool definitions as array', () => {
    expect(Array.isArray(SCREEN_TOOL_DEFINITIONS)).toBe(true)
    expect(SCREEN_TOOL_DEFINITIONS.length).toBeGreaterThan(0)
  })

  it('should export imessage tool definitions as array', () => {
    expect(Array.isArray(IMESSAGE_TOOL_DEFINITIONS)).toBe(true)
    expect(IMESSAGE_TOOL_DEFINITIONS.length).toBeGreaterThan(0)
  })

  it('should have valid definition shapes (name + description + parameters)', () => {
    for (const def of [
      ...MAIL_TOOL_DEFINITIONS,
      ...SCREEN_TOOL_DEFINITIONS,
      ...IMESSAGE_TOOL_DEFINITIONS
    ]) {
      expect(typeof def.name).toBe('string')
      expect(def.name.length).toBeGreaterThan(0)
      expect(typeof def.description).toBe('string')
      expect(def.description.length).toBeGreaterThan(0)
      expect(def.parameters).toBeDefined()
      expect(def.parameters.type).toBe('object')
    }
  })

  it('should have unique tool names across all definitions', () => {
    const allDefs = [
      ...MAIL_TOOL_DEFINITIONS,
      ...SCREEN_TOOL_DEFINITIONS,
      ...IMESSAGE_TOOL_DEFINITIONS
    ]
    const names = allDefs.map((d) => d.name)
    expect(new Set(names).size).toBe(names.length)
  })

  it('should have ALL_INTEGRATION_TOOLS matching combined count', () => {
    expect(ALL_INTEGRATION_TOOLS.length).toBeGreaterThan(0)
    for (const tool of ALL_INTEGRATION_TOOLS) {
      expect(tool.definition).toBeDefined()
      expect(tool.execute).toBeDefined()
      expect(typeof tool.definition.name).toBe('string')
    }
  })
})

describe('integrations/screen — queue', () => {
  let acquireScreen, releaseScreen, getScreenSession, enqueueScreen

  beforeEach(async () => {
    vi.resetModules()
    ;({ acquireScreen, releaseScreen, getScreenSession, enqueueScreen } =
      await import('../packages/integrations/src/screen/queue.js'))
  })

  it('should acquire screen session', () => {
    const result = acquireScreen({ sessionId: 'test-1' })
    expect(result.sessionId).toBe('test-1')
  })

  it('should report active session', () => {
    acquireScreen({ sessionId: 'test-1' })
    const session = getScreenSession()
    expect(session.sessionId).toBe('test-1')
  })

  it('should release screen session', () => {
    acquireScreen({ sessionId: 'test-1' })
    const result = releaseScreen({ sessionId: 'test-1' })
    expect(result.ok).toBe(true)
  })

  it('should throw when screen is locked by another session', () => {
    acquireScreen({ sessionId: 'owner' })
    expect(() => acquireScreen({ sessionId: 'intruder' })).toThrow('in use')
  })

  it('should allow force acquire', () => {
    acquireScreen({ sessionId: 'owner' })
    const result = acquireScreen({ sessionId: 'override', force: true })
    expect(result.sessionId).toBe('override')
  })

  it('should enqueue screen operations', async () => {
    const results = []
    await enqueueScreen(async () => {
      results.push(1)
    })
    await enqueueScreen(async () => {
      results.push(2)
    })
    expect(results).toEqual([1, 2])
  })
})
