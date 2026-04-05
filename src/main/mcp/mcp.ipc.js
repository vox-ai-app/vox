import { randomUUID } from 'crypto'
import { registerHandler, createHandler } from '../ipc/shared'
import {
  listMcpServers,
  addMcpServer,
  removeMcpServer,
  updateMcpServer,
  connectMcpServer,
  disconnectMcpServer
} from './mcp.service'

function serverToWire(s) {
  if (!s) return s
  return {
    id: s.id,
    name: s.name,
    transport: s.transport,
    command: s.command,
    args: s.args,
    url: s.url,
    env: s.env,
    is_enabled: s.isEnabled,
    last_synced_at: s.lastSyncedAt,
    created_at: s.createdAt,
    updated_at: s.updatedAt
  }
}

export function registerMcpIpc() {
  registerHandler(
    'mcp:list',
    createHandler(() => ({ servers: listMcpServers().map(serverToWire) }))
  )

  registerHandler(
    'mcp:create',
    createHandler((_e, data) => {
      const server = addMcpServer({ id: randomUUID(), ...data })
      return serverToWire(server)
    })
  )

  registerHandler(
    'mcp:delete',
    createHandler((_e, { id }) => {
      removeMcpServer(id)
      return { deleted: true }
    })
  )

  registerHandler(
    'mcp:update',
    createHandler((_e, { id, data }) => serverToWire(updateMcpServer(id, data)))
  )

  registerHandler(
    'mcp:sync',
    createHandler(async (_e, { id }) => {
      const result = await connectMcpServer(id)
      const updated = updateMcpServer(id, { lastSyncedAt: new Date().toISOString() })
      return { ...result, server: serverToWire(updated) }
    })
  )

  registerHandler(
    'mcp:list-servers',
    createHandler(() => listMcpServers().map(serverToWire))
  )

  registerHandler(
    'mcp:add-server',
    createHandler((_e, server) => serverToWire(addMcpServer({ id: randomUUID(), ...server })))
  )

  registerHandler(
    'mcp:remove-server',
    createHandler((_e, { id }) => {
      removeMcpServer(id)
      return { removed: true }
    })
  )

  registerHandler(
    'mcp:connect',
    createHandler((_e, { id }) => connectMcpServer(id))
  )

  registerHandler(
    'mcp:disconnect',
    createHandler((_e, { id }) => disconnectMcpServer(id))
  )
}
