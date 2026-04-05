export const name = '003_mcp_last_synced'

export function up(db) {
  db.exec(`ALTER TABLE mcp_servers ADD COLUMN last_synced_at TEXT`)
}
