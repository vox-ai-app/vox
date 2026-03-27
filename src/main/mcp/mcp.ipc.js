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

export function registerMcpIpc() {
  registerHandler(
    'mcp:list',
    createHandler(() => ({ servers: listMcpServers() }))
  )

  registerHandler(
    'mcp:create',
    createHandler((_e, data) => {
      const server = { id: randomUUID(), ...data }
      addMcpServer(server)
      return server
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
    createHandler((_e, { id, data }) => updateMcpServer(id, data))
  )

  registerHandler(
    'mcp:sync',
    createHandler(async (_e, { id }) => {
      const result = await connectMcpServer(id)
      const updated = updateMcpServer(id, { last_synced_at: new Date().toISOString() })
      return { ...result, server: updated }
    })
  )

  registerHandler(
    'mcp:list-servers',
    createHandler(() => listMcpServers())
  )

  registerHandler(
    'mcp:add-server',
    createHandler((_e, server) => addMcpServer({ id: randomUUID(), ...server }))
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
