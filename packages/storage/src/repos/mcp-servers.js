import { randomUUID } from 'crypto'

function mapServer(row) {
  if (!row) return null
  return {
    id: row.id,
    name: row.name,
    transport: row.transport,
    command: row.command || null,
    args: JSON.parse(row.args),
    url: row.url || null,
    env: JSON.parse(row.env),
    isEnabled: !!row.is_enabled,
    lastSyncedAt: row.last_synced_at || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

export function createMcpServer(db, server) {
  const id = server.id || randomUUID()
  const now = new Date().toISOString()

  db.prepare(
    `INSERT INTO mcp_servers (id, name, transport, command, args, url, env, is_enabled, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    String(server.name),
    String(server.transport || 'stdio'),
    server.command || null,
    JSON.stringify(server.args || []),
    server.url || null,
    JSON.stringify(server.env || {}),
    server.isEnabled === false ? 0 : 1,
    now,
    now
  )

  return getMcpServer(db, id)
}

export function updateMcpServer(db, id, updates) {
  const existing = getMcpServer(db, id)
  if (!existing) return null

  const now = new Date().toISOString()
  const merged = { ...existing, ...updates }

  db.prepare(
    `UPDATE mcp_servers SET name = ?, transport = ?, command = ?, args = ?, url = ?,
      env = ?, is_enabled = ?, last_synced_at = ?, updated_at = ?
     WHERE id = ?`
  ).run(
    String(merged.name),
    String(merged.transport || 'stdio'),
    merged.command || null,
    JSON.stringify(merged.args || []),
    merged.url || null,
    JSON.stringify(merged.env || {}),
    merged.isEnabled === false ? 0 : 1,
    merged.lastSyncedAt || null,
    now,
    id
  )

  return getMcpServer(db, id)
}

export function deleteMcpServer(db, id) {
  return db.prepare(`DELETE FROM mcp_servers WHERE id = ?`).run(id)
}

export function getMcpServer(db, id) {
  return mapServer(db.prepare(`SELECT * FROM mcp_servers WHERE id = ?`).get(id))
}

export function listMcpServers(db, enabledOnly = false) {
  if (enabledOnly) {
    return db.prepare(`SELECT * FROM mcp_servers WHERE is_enabled = 1`).all().map(mapServer)
  }
  return db.prepare(`SELECT * FROM mcp_servers ORDER BY name ASC`).all().map(mapServer)
}
