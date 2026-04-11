import { describe, it, expect, vi, beforeEach } from 'vitest'

describe('all new domains — tool definitions shape', () => {
  let CONTACTS_TOOL_DEFINITIONS,
    SHORTCUTS_TOOL_DEFINITIONS,
    MUSIC_TOOL_DEFINITIONS,
    CALENDAR_TOOL_DEFINITIONS,
    REMINDERS_TOOL_DEFINITIONS

  beforeEach(async () => {
    vi.resetModules()
    ;({ CONTACTS_TOOL_DEFINITIONS } = await import('../src/contacts/def.js'))
    ;({ SHORTCUTS_TOOL_DEFINITIONS } = await import('../src/shortcuts/def.js'))
    ;({ MUSIC_TOOL_DEFINITIONS } = await import('../src/music/def.js'))
    ;({ CALENDAR_TOOL_DEFINITIONS } = await import('../src/calendar/def.js'))
    ;({ REMINDERS_TOOL_DEFINITIONS } = await import('../src/reminders/def.js'))
  })

  it('every definition has name + description + parameters.type=object', () => {
    const allDefs = [
      ...CONTACTS_TOOL_DEFINITIONS,
      ...SHORTCUTS_TOOL_DEFINITIONS,
      ...MUSIC_TOOL_DEFINITIONS,
      ...CALENDAR_TOOL_DEFINITIONS,
      ...REMINDERS_TOOL_DEFINITIONS
    ]
    for (const def of allDefs) {
      expect(typeof def.name).toBe('string')
      expect(def.name.length).toBeGreaterThan(0)
      expect(typeof def.description).toBe('string')
      expect(def.description.length).toBeGreaterThan(0)
      expect(def.parameters).toBeDefined()
      expect(def.parameters.type).toBe('object')
    }
  })

  it('all tool names are unique across new domains', () => {
    const allDefs = [
      ...CONTACTS_TOOL_DEFINITIONS,
      ...SHORTCUTS_TOOL_DEFINITIONS,
      ...MUSIC_TOOL_DEFINITIONS,
      ...CALENDAR_TOOL_DEFINITIONS,
      ...REMINDERS_TOOL_DEFINITIONS
    ]
    const names = allDefs.map((d) => d.name)
    expect(new Set(names).size).toBe(names.length)
  })

  it('total new tool count should be 16', () => {
    const total =
      CONTACTS_TOOL_DEFINITIONS.length +
      SHORTCUTS_TOOL_DEFINITIONS.length +
      MUSIC_TOOL_DEFINITIONS.length +
      CALENDAR_TOOL_DEFINITIONS.length +
      REMINDERS_TOOL_DEFINITIONS.length
    expect(total).toBe(16)
  })
})
