import { registerHandler, createHandler } from './shared'
import { getMcpToolDefinitions } from '../mcp/mcp.service'
import { getDb } from '../storage/db'
import {
  listTools,
  createTool,
  updateTool,
  deleteTool,
  getToolByName
} from '@vox-ai-app/storage/tools'

const VALID_SOURCE_TYPES = new Set(['js_function', 'http_webhook', 'desktop', 'mcp'])
const TOOL_NAME_PATTERN = /^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/

function toolToWire(t) {
  if (!t) return t
  return {
    id: t.id,
    name: t.name,
    description: t.description,
    parameters: t.parameters,
    source_type: t.sourceType,
    source_code: t.sourceCode,
    webhook_url: t.webhookUrl,
    webhook_headers: t.webhookHeaders,
    is_enabled: t.isEnabled,
    tags: t.tags,
    version: t.version,
    created_at: t.createdAt,
    updated_at: t.updatedAt
  }
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
  return [...listTools(getDb()).map(toolToWire), ...mcpDefsToTools(getMcpToolDefinitions())]
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
      const db = getDb()
      if (getToolByName(db, data.name)) {
        throw Object.assign(new Error(`Tool "${data.name}" already exists`), {
          code: 'DUPLICATE'
        })
      }
      return toolToWire(
        createTool(db, {
          name: data.name,
          description: data.description,
          parameters: data.parameters,
          sourceType: data.source_type,
          sourceCode: data.source_code,
          webhookUrl: data.webhook_url,
          webhookHeaders: data.webhook_headers,
          tags: data.tags
        })
      )
    })
  )

  registerHandler(
    'tools:update',
    createHandler((_e, { id, data }) => {
      if (data?.name) validateToolData(data)
      const patch = {}
      if (data.name !== undefined) patch.name = data.name
      if (data.description !== undefined) patch.description = data.description
      if (data.parameters !== undefined) patch.parameters = data.parameters
      if (data.source_type !== undefined) patch.sourceType = data.source_type
      if (data.source_code !== undefined) patch.sourceCode = data.source_code
      if (data.webhook_url !== undefined) patch.webhookUrl = data.webhook_url
      if (data.webhook_headers !== undefined) patch.webhookHeaders = data.webhook_headers
      if (data.is_enabled !== undefined) patch.isEnabled = data.is_enabled
      if (data.tags !== undefined) patch.tags = data.tags
      const result = updateTool(getDb(), id, patch)
      if (!result) {
        throw Object.assign(new Error('Tool not found'), { code: 'NOT_FOUND' })
      }
      return toolToWire(result)
    })
  )

  registerHandler(
    'tools:delete',
    createHandler((_e, { id }) => {
      deleteTool(getDb(), id)
      return { deleted: true }
    })
  )
}
