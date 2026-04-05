import Database from 'better-sqlite3'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { runMigrations } from './migrations/runner.js'
import * as initialSchema from './migrations/001_initial_schema.js'
import * as taskActivityTypes from './migrations/002_task_activity_types.js'
import * as mcpLastSynced from './migrations/003_mcp_last_synced.js'

const dbs = new Map()

const migrations = [initialSchema, taskActivityTypes, mcpLastSynced]

function resolveDbPath(dbPath) {
  const normalized = String(dbPath || '').trim()
  if (!normalized) {
    throw new Error('A database path is required.')
  }
  return path.resolve(normalized)
}
function prepareDb(db) {
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  runMigrations(db, migrations)
}

export function openDb(dbPath) {
  const resolvedPath = resolveDbPath(dbPath)
  const existing = dbs.get(resolvedPath)
  if (existing) return existing

  mkdirSync(path.dirname(resolvedPath), { recursive: true })

  const db = new Database(resolvedPath)
  prepareDb(db)
  dbs.set(resolvedPath, db)
  return db
}

export function closeDb(dbPath) {
  const resolvedPath = resolveDbPath(dbPath)
  const db = dbs.get(resolvedPath)
  if (!db) return
  db.close()
  dbs.delete(resolvedPath)
}
