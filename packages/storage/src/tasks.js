function parseJson(value, fallback) {
  if (value === null || value === undefined || value === '') {
    return fallback
  }

  try {
    return JSON.parse(value)
  } catch {
    return fallback
  }
}

function stringifyJson(value, fallback = null) {
  if (value === null || value === undefined) {
    return fallback
  }

  try {
    return JSON.stringify(value)
  } catch {
    return fallback
  }
}

function mapTask(row) {
  if (!row) return null

  return {
    taskId: row.task_id,
    instructions: row.instructions,
    context: row.context,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    currentPlan: row.current_plan,
    message: row.message,
    result: row.result,
    completedAt: row.completed_at,
    failedAt: row.failed_at
  }
}

function mapActivity(row) {
  if (!row) return null

  return {
    id: row.id,
    taskId: row.task_id,
    type: row.type,
    name: row.name || null,
    rawResult: parseJson(row.raw_result, row.raw_result),
    timestamp: row.timestamp,
    data: parseJson(row.data, {})
  }
}

export function upsertTask(db, task) {
  const taskId = String(task?.taskId || '').trim()
  if (!taskId) {
    throw new Error('taskId is required.')
  }

  const createdAt = String(task?.createdAt || new Date().toISOString())
  const updatedAt = String(task?.updatedAt || createdAt)

  db.prepare(
    `
    INSERT INTO tasks (
      task_id,
      instructions,
      context,
      status,
      created_at,
      updated_at,
      current_plan,
      message,
      result,
      completed_at,
      failed_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(task_id) DO UPDATE SET
      instructions = excluded.instructions,
      context = excluded.context,
      status = excluded.status,
      updated_at = excluded.updated_at,
      current_plan = excluded.current_plan,
      message = excluded.message,
      result = excluded.result,
      completed_at = excluded.completed_at,
      failed_at = excluded.failed_at
  `
  ).run(
    taskId,
    String(task?.instructions || ''),
    String(task?.context || ''),
    String(task?.status || 'queued'),
    createdAt,
    updatedAt,
    String(task?.currentPlan || ''),
    String(task?.message || ''),
    task?.result === null || task?.result === undefined ? null : String(task.result),
    String(task?.completedAt || ''),
    String(task?.failedAt || '')
  )

  return getTask(db, taskId)
}

export function getTask(db, taskId) {
  return mapTask(
    db
      .prepare(
        `
    SELECT
      task_id,
      instructions,
      context,
      status,
      created_at,
      updated_at,
      current_plan,
      message,
      result,
      completed_at,
      failed_at
    FROM tasks
    WHERE task_id = ?
  `
      )
      .get(String(taskId || '').trim())
  )
}

export function loadTasks(db) {
  return db
    .prepare(
      `
    SELECT
      task_id,
      instructions,
      context,
      status,
      created_at,
      updated_at,
      current_plan,
      message,
      result,
      completed_at,
      failed_at
    FROM tasks
    ORDER BY created_at DESC, task_id DESC
  `
    )
    .all()
    .map(mapTask)
}

export function appendTaskActivity(db, activity) {
  const id = String(activity?.id || '').trim()
  const taskId = String(activity?.taskId || '').trim()
  if (!id || !taskId) {
    throw new Error('Task activity requires id and taskId.')
  }

  db.prepare(
    `
    INSERT INTO task_activity (id, task_id, type, name, raw_result, timestamp, data)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      task_id = excluded.task_id,
      type = excluded.type,
      name = excluded.name,
      raw_result = excluded.raw_result,
      timestamp = excluded.timestamp,
      data = excluded.data
  `
  ).run(
    id,
    taskId,
    String(activity?.type || ''),
    activity?.name ? String(activity.name) : null,
    stringifyJson(
      activity?.rawResult,
      activity?.rawResult === undefined ? null : String(activity.rawResult)
    ),
    String(activity?.timestamp || new Date().toISOString()),
    stringifyJson(activity?.data || {}, '{}')
  )

  return id
}

export function loadTaskActivity(db, taskId) {
  return db
    .prepare(
      `
    SELECT id, task_id, type, name, raw_result, timestamp, data
    FROM task_activity
    WHERE task_id = ?
    ORDER BY timestamp ASC, id ASC
  `
    )
    .all(String(taskId || '').trim())
    .map(mapActivity)
}

export function loadAllTaskActivity(db) {
  return db
    .prepare(
      `
    SELECT id, task_id, type, name, raw_result, timestamp, data
    FROM task_activity
    ORDER BY timestamp ASC, id ASC
  `
    )
    .all()
    .map(mapActivity)
}
