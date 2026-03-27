import Database from 'better-sqlite3'
import { mkdirSync } from 'node:fs'
import path from 'node:path'

const dbs = new Map()

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

  db.exec(`
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_messages_conversation_id_id
      ON messages (conversation_id, id);

    CREATE TABLE IF NOT EXISTS tasks (
      task_id TEXT PRIMARY KEY,
      instructions TEXT NOT NULL DEFAULT '',
      context TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'queued',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      current_plan TEXT NOT NULL DEFAULT '',
      message TEXT NOT NULL DEFAULT '',
      result TEXT,
      completed_at TEXT NOT NULL DEFAULT '',
      failed_at TEXT NOT NULL DEFAULT ''
    );

    CREATE INDEX IF NOT EXISTS idx_tasks_created_at
      ON tasks (created_at DESC, task_id DESC);

    CREATE TABLE IF NOT EXISTS task_activity (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      type TEXT NOT NULL,
      name TEXT,
      raw_result TEXT,
      timestamp TEXT NOT NULL,
      data TEXT NOT NULL DEFAULT '{}',
      FOREIGN KEY (task_id) REFERENCES tasks(task_id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_task_activity_timestamp
      ON task_activity (timestamp ASC, id ASC);

    CREATE INDEX IF NOT EXISTS idx_task_activity_task_id
      ON task_activity (task_id, timestamp ASC, id ASC);
  `)
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
