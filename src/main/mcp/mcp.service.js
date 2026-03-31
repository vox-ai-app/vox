import { connectMcpServer as _connect, setLogger } from '@vox-ai-app/mcp/client'
import { storeGet, storeSet } from '../storage/store'
import { logger } from '../logger'

setLogger(logger)

const STORE_KEY = 'mcpServers'

const connections = new Map()
let _toolInvalidationCallback = null

export function setToolInvalidationCallback(fn) {
  _toolInvalidationCallback = fn
}

function invalidateToolCache() {
  _toolInvalidationCallback?.()
}

export function listMcpServers() {
  return storeGet(STORE_KEY) || []
}

function saveServers(servers) {
  storeSet(STORE_KEY, servers)
}

export function addMcpServer(server) {
  const servers = listMcpServers()
  if (servers.find((s) => s.id === server.id))
    throw Object.assign(new Error('Server already exists'), { code: 'DUPLICATE' })
  servers.push(server)
  saveServers(servers)
  return server
}

export function removeMcpServer(id) {
  disconnectMcpServer(id).catch(() => {})
  saveServers(listMcpServers().filter((s) => s.id !== id))
}

export function updateMcpServer(id, patch) {
  const servers = listMcpServers()
  const idx = servers.findIndex((s) => s.id === id)
  if (idx < 0) throw Object.assign(new Error('Server not found'), { code: 'NOT_FOUND' })
  servers[idx] = { ...servers[idx], ...patch }
  saveServers(servers)
  return servers[idx]
}

export async function connectMcpServer(id) {
  const server = listMcpServers().find((s) => s.id === id)
  if (!server) throw Object.assign(new Error('Server not found'), { code: 'NOT_FOUND' })

  await disconnectMcpServer(id)

  const { client, tools } = await _connect(server)
  connections.set(id, { client, tools })
  invalidateToolCache()
  logger.info('[mcp] Connected:', id, `(${tools.length} tools)`)
  return { connected: true, toolCount: tools.length }
}

export async function disconnectMcpServer(id) {
  const conn = connections.get(id)
  if (!conn) return
  try {
    await conn.client.close()
    // eslint-disable-next-line no-empty
  } catch {}
  connections.delete(id)
  invalidateToolCache()
}

export async function connectAllMcpServers() {
  for (const server of listMcpServers()) {
    try {
      await connectMcpServer(server.id)
    } catch (err) {
      logger.warn('[mcp] Failed to connect', server.id, err.message)
    }
  }
}

export async function closeAllMcp() {
  for (const id of [...connections.keys()]) {
    await disconnectMcpServer(id).catch(() => {})
  }
}

export function getMcpToolDefinitions() {
  const defs = []
  for (const { tools } of connections.values()) {
    defs.push(...tools)
  }
  return defs
}

export async function executeMcpTool(name, args) {
  for (const { client, tools } of connections.values()) {
    if (tools.some((t) => t.name === name)) {
      const result = await client.callTool({ name, arguments: args || {} })

      if (result?.content?.length) {
        return result.content
          .map((c) => (c.type === 'text' ? c.text : JSON.stringify(c)))
          .join('\n')
      }
      return JSON.stringify(result)
    }
  }
  throw new Error(`MCP tool not found: ${name}`)
}
