import {
  upsertTask as _upsertTask,
  getTask as _getTask,
  loadTasks as _loadTasks,
  appendTaskActivity as _appendTaskActivity,
  loadTaskActivity as _loadTaskActivity,
  loadAllTaskActivity as _loadAllTaskActivity
} from '@vox-ai-app/storage/tasks'
import { getDb } from './db.js'

export const upsertTask = (task) => _upsertTask(getDb(), task)
export const getTask = (taskId) => _getTask(getDb(), taskId)
export const loadTasks = () => _loadTasks(getDb())
export const appendTaskActivity = (activity) => _appendTaskActivity(getDb(), activity)
export const loadTaskActivity = (taskId) => _loadTaskActivity(getDb(), taskId)
export const loadAllTaskActivity = () => _loadAllTaskActivity(getDb())

export function getUnreportedTerminalTasks() {
  return getDb()
    .prepare(
      `SELECT task_id, instructions, status, result, message
       FROM tasks
       WHERE status IN ('completed', 'failed', 'aborted', 'incomplete')
         AND reported = 0
       ORDER BY updated_at ASC`
    )
    .all()
    .map((row) => ({
      taskId: row.task_id,
      instructions: row.instructions,
      status: row.status,
      result: row.result || '',
      message: row.message || ''
    }))
}

export function markTaskReported(taskId) {
  getDb().prepare(`UPDATE tasks SET reported = 1 WHERE task_id = ?`).run(String(taskId))
}

export function indexTaskInFts(taskId, instructions, result) {
  const db = getDb()
  db.prepare(`DELETE FROM tasks_fts WHERE task_id = ?`).run(taskId)
  db.prepare(`INSERT INTO tasks_fts(task_id, instructions, result) VALUES (?, ?, ?)`).run(
    taskId,
    instructions || '',
    result || ''
  )
}

export function searchTasksFts(query) {
  if (!query?.trim()) return []
  const terms = query
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => `"${t.replace(/"/g, '')}"`)
    .join(' ')
  try {
    return getDb()
      .prepare(
        `SELECT task_id, instructions, result
         FROM tasks_fts
         WHERE tasks_fts MATCH ?
         ORDER BY bm25(tasks_fts)
         LIMIT 10`
      )
      .all(terms)
      .map((row) => ({
        taskId: row.task_id,
        instructions: row.instructions,
        result: row.result || ''
      }))
  } catch {
    return []
  }
}

export function insertKnowledgePattern(id, trigger, solution) {
  const now = new Date().toISOString()
  getDb()
    .prepare(
      `INSERT OR REPLACE INTO knowledge_patterns(id, trigger, solution, created_at) VALUES (?, ?, ?, ?)`
    )
    .run(id, trigger, solution, now)
  getDb().prepare(`DELETE FROM patterns_fts WHERE pattern_id = ?`).run(id)
  getDb()
    .prepare(`INSERT INTO patterns_fts(pattern_id, trigger, solution) VALUES (?, ?, ?)`)
    .run(id, trigger, solution)
}

export function searchKnowledgePatterns(query) {
  if (!query?.trim()) return []
  const terms = query
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => `"${t.replace(/"/g, '')}"`)
    .join(' ')
  try {
    return getDb()
      .prepare(
        `SELECT p.pattern_id, p.trigger, p.solution
         FROM patterns_fts f
         JOIN knowledge_patterns p ON p.id = f.pattern_id
         WHERE f.patterns_fts MATCH ?
         ORDER BY bm25(f.patterns_fts)
         LIMIT 5`
      )
      .all(terms)
      .map((row) => ({ id: row.pattern_id, trigger: row.trigger, solution: row.solution }))
  } catch {
    return []
  }
}
