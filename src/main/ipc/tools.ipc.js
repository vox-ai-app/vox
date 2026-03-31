import { randomUUID } from 'crypto'
import { registerHandler, createHandler } from './shared'
import { getMcpToolDefinitions } from '../mcp/mcp.service'
import { storeGet, storeSet } from '../storage/store'

const STORE_KEY = 'customTools'

const VALID_SOURCE_TYPES = new Set(['js_function', 'http_webhook', 'desktop', 'mcp'])
const TOOL_NAME_PATTERN = /^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/

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

function validateToolData(data) {
  if (!data?.name || !TOOL_NAME_PATTERN.test(data.name)) {
    throw Object.assign(
      new Error('Tool name must start with a letter and contain only letters, numbers, _ or -'),
      { code: 'VALIDATION_ERROR' }
    )
  }
  if (data.source_type && !VALID_SOURCE_TYPES.has(data.source_type)) {
    throw Object.assign(new Error(`Invalid source_type: ${data.source_type}`), {
      code: 'VALIDATION_ERROR'
    })
  }
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
      validateToolData(data)
      const existing = loadCustomTools()
      if (existing.some((t) => t.name === data.name)) {
        throw Object.assign(new Error(`Tool "${data.name}" already exists`), {
          code: 'DUPLICATE'
        })
      }
      const tool = { id: randomUUID(), is_enabled: true, ...data }
      existing.push(tool)
      saveCustomTools(existing)
      return tool
    })
  )

  registerHandler(
    'tools:update',
    createHandler((_e, { id, data }) => {
      const tools = loadCustomTools()
      const idx = tools.findIndex((t) => t.id === id)
      if (idx < 0) {
        throw Object.assign(new Error('Tool not found'), { code: 'NOT_FOUND' })
      }
      if (data?.name) validateToolData(data)
      tools[idx] = { ...tools[idx], ...data }
      saveCustomTools(tools)
      return tools[idx]
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
