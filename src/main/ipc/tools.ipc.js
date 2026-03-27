import { randomUUID } from 'crypto'
import { registerHandler, createHandler } from './shared'
import { getMcpToolDefinitions } from '../mcp/mcp.service'
import { storeGet, storeSet } from '../storage/store'

const STORE_KEY = 'customTools'

function loadCustomTools() {
  return storeGet(STORE_KEY) || []
}

function saveCustomTools(tools) {
  storeSet(STORE_KEY, tools)
}

function mcpDefsToTools(defs) {
  return defs.map((def) => ({
    id: `mcp:${def.name}`,
    name: def.name,
    description: def.description || '',
    source_type: 'mcp',
    is_enabled: true
  }))
}

function allTools() {
  return [...loadCustomTools(), ...mcpDefsToTools(getMcpToolDefinitions())]
}

export function registerToolsIpc() {
  registerHandler(
    'tools:list',
    createHandler(() => ({ tools: allTools(), has_more: false, next_cursor: null }))
  )

  registerHandler(
    'tools:search',
    createHandler((_e, { query } = {}) => {
      const q = (query || '').toLowerCase()
      const tools = q
        ? allTools().filter(
            (t) =>
              t.name.toLowerCase().includes(q) || (t.description || '').toLowerCase().includes(q)
          )
        : allTools()
      return { tools }
    })
  )

  registerHandler(
    'tools:create',
    createHandler((_e, data) => {
      const tool = { id: randomUUID(), is_enabled: true, ...data }
      const tools = loadCustomTools()
      tools.push(tool)
      saveCustomTools(tools)
      return tool
    })
  )

  registerHandler(
    'tools:update',
    createHandler((_e, { id, data }) => {
      const tools = loadCustomTools()
      const idx = tools.findIndex((t) => t.id === id)
      if (idx >= 0) {
        tools[idx] = { ...tools[idx], ...data }
        saveCustomTools(tools)
        return tools[idx]
      }
      return { id, ...data }
    })
  )

  registerHandler(
    'tools:delete',
    createHandler((_e, { id }) => {
      saveCustomTools(loadCustomTools().filter((t) => t.id !== id))
      return { deleted: true }
    })
  )
}
