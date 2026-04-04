import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

let canUseSqlite = true
try {
  const Database = (await import('better-sqlite3')).default
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sqlite-check-'))
  const testDb = new Database(path.join(tmp, 'check.db'))
  testDb.close()
  fs.rmSync(tmp, { recursive: true, force: true })
} catch {
  canUseSqlite = false
}

const describeIfSqlite = canUseSqlite ? describe : describe.skip

describeIfSqlite('storage/db — openDb & closeDb', () => {
  let openDb, closeDb
  let tmpDir

  beforeEach(async () => {
    vi.resetModules()
    ;({ openDb, closeDb } = await import('../packages/storage/src/db.js'))
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'storage-db-'))
  })

  afterEach(() => {
    try {
      closeDb(path.join(tmpDir, 'test.db'))
    } catch {
      /* db may already be closed */
    }
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('should open a database and create tables', () => {
    const db = openDb(path.join(tmpDir, 'test.db'))
    expect(db).toBeTruthy()
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all()
      .map((r) => r.name)
    expect(tables).toContain('conversations')
    expect(tables).toContain('messages')
    expect(tables).toContain('tasks')
    expect(tables).toContain('task_activity')
  })

  it('should reuse existing connection for same path', () => {
    const dbPath = path.join(tmpDir, 'test.db')
    const db1 = openDb(dbPath)
    const db2 = openDb(dbPath)
    expect(db1).toBe(db2)
  })

  it('should throw for empty path', () => {
    expect(() => openDb('')).toThrow('required')
  })

  it('should close a database', () => {
    const dbPath = path.join(tmpDir, 'test.db')
    openDb(dbPath)
    expect(() => closeDb(dbPath)).not.toThrow()
  })

  it('should handle closing non-existent db gracefully', () => {
    expect(() => closeDb(path.join(tmpDir, 'nonexistent.db'))).not.toThrow()
  })
})

describeIfSqlite('storage/messages', () => {
  let openDb, closeDb
  let appendMessage, getMessages, clearMessages, ensureConversation
  let saveSummaryCheckpoint, loadSummaryCheckpoint, clearSummaryCheckpoint
  let tmpDir, db

  beforeEach(async () => {
    vi.resetModules()
    ;({ openDb, closeDb } = await import('../packages/storage/src/db.js'))
    ;({
      appendMessage,
      getMessages,
      clearMessages,
      ensureConversation,
      saveSummaryCheckpoint,
      loadSummaryCheckpoint,
      clearSummaryCheckpoint
    } = await import('../packages/storage/src/messages.js'))
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'storage-msg-'))
    db = openDb(path.join(tmpDir, 'test.db'))
  })

  afterEach(() => {
    try {
      closeDb(path.join(tmpDir, 'test.db'))
    } catch {
      /* db may already be closed */
    }
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('should append and retrieve a message', () => {
    appendMessage(db, 'user', 'hello')
    const msgs = getMessages(db)
    expect(msgs).toHaveLength(1)
    expect(msgs[0].role).toBe('user')
    expect(msgs[0].content).toBe('hello')
    expect(msgs[0].id).toBeTruthy()
  })

  it('should append multiple messages in order', () => {
    appendMessage(db, 'user', 'first')
    appendMessage(db, 'assistant', 'second')
    appendMessage(db, 'user', 'third')
    const msgs = getMessages(db)
    expect(msgs).toHaveLength(3)
    expect(msgs[0].content).toBe('first')
    expect(msgs[1].content).toBe('second')
    expect(msgs[2].content).toBe('third')
  })

  it('should clear messages', () => {
    appendMessage(db, 'user', 'hello')
    appendMessage(db, 'assistant', 'hi')
    clearMessages(db)
    expect(getMessages(db)).toHaveLength(0)
  })

  it('should support limited retrieval', () => {
    for (let i = 0; i < 10; i++) {
      appendMessage(db, 'user', `msg-${i}`)
    }
    const msgs = getMessages(db, undefined, 3)
    expect(msgs).toHaveLength(3)
  })

  it('should save and load summary checkpoint', () => {
    ensureConversation(db)
    saveSummaryCheckpoint(db, 'summary text', 42)
    const cp = loadSummaryCheckpoint(db)
    expect(cp.summary).toBe('summary text')
    expect(cp.checkpointId).toBe(42)
  })

  it('should clear summary checkpoint', () => {
    ensureConversation(db)
    saveSummaryCheckpoint(db, 'summary', 1)
    clearSummaryCheckpoint(db)
    expect(loadSummaryCheckpoint(db)).toBeNull()
  })

  it('should return null when no checkpoint saved', () => {
    ensureConversation(db)
    expect(loadSummaryCheckpoint(db)).toBeNull()
  })
})

describe('storage/config', () => {
  let configGet, configSet, configDelete, configGetAll
  let tmpDir, configPath

  beforeEach(async () => {
    vi.resetModules()
    ;({ configGet, configSet, configDelete, configGetAll } =
      await import('../packages/storage/src/config.js'))
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'storage-cfg-'))
    configPath = path.join(tmpDir, 'config.json')
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('should set and get a value', () => {
    configSet(configPath, 'theme', 'dark')
    expect(configGet(configPath, 'theme')).toBe('dark')
  })

  it('should return undefined for missing key', () => {
    expect(configGet(configPath, 'nope')).toBeUndefined()
  })

  it('should delete a key', () => {
    configSet(configPath, 'key', 'val')
    expect(configDelete(configPath, 'key')).toBe(true)
    expect(configGet(configPath, 'key')).toBeUndefined()
  })

  it('should return false when deleting non-existent key', () => {
    expect(configDelete(configPath, 'nope')).toBe(false)
  })

  it('should get all config', () => {
    configSet(configPath, 'a', 1)
    configSet(configPath, 'b', 2)
    const all = configGetAll(configPath)
    expect(all.a).toBe(1)
    expect(all.b).toBe(2)
  })

  it('should return empty object for missing file', () => {
    expect(configGetAll(configPath)).toEqual({})
  })

  it('should handle complex values', () => {
    configSet(configPath, 'nested', { foo: [1, 2, 3] })
    expect(configGet(configPath, 'nested')).toEqual({ foo: [1, 2, 3] })
  })

  it('should throw for empty path', () => {
    expect(() => configGet('', 'key')).toThrow('required')
  })
})

describeIfSqlite('storage/tasks', () => {
  let openDb, closeDb
  let upsertTask, getTask, loadTasks
  let tmpDir, db

  beforeEach(async () => {
    vi.resetModules()
    ;({ openDb, closeDb } = await import('../packages/storage/src/db.js'))
    ;({ upsertTask, getTask, loadTasks } = await import('../packages/storage/src/tasks.js'))
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'storage-tasks-'))
    db = openDb(path.join(tmpDir, 'test.db'))
  })

  afterEach(() => {
    try {
      closeDb(path.join(tmpDir, 'test.db'))
    } catch {
      /* db may already be closed */
    }
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('should insert and retrieve a task', () => {
    upsertTask(db, { taskId: 't1', instructions: 'Do stuff', status: 'queued' })
    const task = getTask(db, 't1')
    expect(task).not.toBeNull()
    expect(task.taskId).toBe('t1')
    expect(task.instructions).toBe('Do stuff')
    expect(task.status).toBe('queued')
  })

  it('should update existing task', () => {
    upsertTask(db, { taskId: 't1', instructions: 'original', status: 'queued' })
    upsertTask(db, { taskId: 't1', instructions: 'updated', status: 'running' })
    const task = getTask(db, 't1')
    expect(task.instructions).toBe('updated')
    expect(task.status).toBe('running')
  })

  it('should return null for non-existent task', () => {
    expect(getTask(db, 'nope')).toBeNull()
  })

  it('should load all tasks', () => {
    upsertTask(db, { taskId: 't1', instructions: 'a', status: 'queued' })
    upsertTask(db, { taskId: 't2', instructions: 'b', status: 'running' })
    const tasks = loadTasks(db)
    expect(tasks).toHaveLength(2)
  })

  it('should throw for missing taskId', () => {
    expect(() => upsertTask(db, { instructions: 'no id' })).toThrow('taskId is required')
  })
})
