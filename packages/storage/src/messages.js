export const DEFAULT_CONVERSATION_ID = 'main'

function getConversationId(conversationId) {
  const normalized = String(conversationId || '').trim()
  return normalized || DEFAULT_CONVERSATION_ID
}

function normalizeLimit(limit) {
  const parsed = Number.parseInt(limit, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

function normalizeBeforeId(beforeId) {
  const parsed = Number.parseInt(beforeId, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

function mapRow(row) {
  if (!row) return null
  return {
    id: row.id,
    conversationId: row.conversation_id,
    role: row.role,
    content: row.content,
    createdAt: row.created_at
  }
}

export function ensureConversation(db, conversationId = DEFAULT_CONVERSATION_ID) {
  const id = getConversationId(conversationId)
  const now = new Date().toISOString()

  db.prepare(
    `
    INSERT INTO conversations (id, created_at, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(id) DO NOTHING
  `
  ).run(id, now, now)

  return db
    .prepare(
      `
    SELECT id, created_at, updated_at
    FROM conversations
    WHERE id = ?
  `
    )
    .get(id)
}

export function touchConversation(db, conversationId = DEFAULT_CONVERSATION_ID) {
  const id = getConversationId(conversationId)
  const now = new Date().toISOString()

  db.prepare(
    `
    INSERT INTO conversations (id, created_at, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET updated_at = excluded.updated_at
  `
  ).run(id, now, now)

  return db
    .prepare(
      `
    SELECT id, created_at, updated_at
    FROM conversations
    WHERE id = ?
  `
    )
    .get(id)
}

export function appendMessage(db, role, content, conversationId = DEFAULT_CONVERSATION_ID) {
  const id = getConversationId(conversationId)
  const now = new Date().toISOString()
  const normalizedRole = String(role || '').trim() || 'user'
  const normalizedContent = String(content ?? '')

  touchConversation(db, id)

  const result = db
    .prepare(
      `
    INSERT INTO messages (conversation_id, role, content, created_at)
    VALUES (?, ?, ?, ?)
  `
    )
    .run(id, normalizedRole, normalizedContent, now)

  return mapRow(
    db
      .prepare(
        `
    SELECT id, conversation_id, role, content, created_at
    FROM messages
    WHERE id = ?
  `
      )
      .get(result.lastInsertRowid)
  )
}

export function getMessages(db, conversationId = DEFAULT_CONVERSATION_ID, limit) {
  const id = getConversationId(conversationId)
  const normalizedLimit = normalizeLimit(limit)

  if (!normalizedLimit) {
    return db
      .prepare(
        `
      SELECT id, conversation_id, role, content, created_at
      FROM messages
      WHERE conversation_id = ?
      ORDER BY id ASC
    `
      )
      .all(id)
      .map(mapRow)
  }

  return db
    .prepare(
      `
    SELECT id, conversation_id, role, content, created_at
    FROM (
      SELECT id, conversation_id, role, content, created_at
      FROM messages
      WHERE conversation_id = ?
      ORDER BY id DESC
      LIMIT ?
    )
    ORDER BY id ASC
  `
    )
    .all(id, normalizedLimit)
    .map(mapRow)
}

export function getMessagesBeforeId(
  db,
  beforeId,
  conversationId = DEFAULT_CONVERSATION_ID,
  limit = 50
) {
  const id = getConversationId(conversationId)
  const normalizedBeforeId = normalizeBeforeId(beforeId)
  const normalizedLimit = normalizeLimit(limit) || 50

  if (!normalizedBeforeId) {
    return []
  }

  return db
    .prepare(
      `
    SELECT id, conversation_id, role, content, created_at
    FROM (
      SELECT id, conversation_id, role, content, created_at
      FROM messages
      WHERE conversation_id = ? AND id < ?
      ORDER BY id DESC
      LIMIT ?
    )
    ORDER BY id ASC
  `
    )
    .all(id, normalizedBeforeId, normalizedLimit)
    .map(mapRow)
}

export function clearMessages(db, conversationId = DEFAULT_CONVERSATION_ID) {
  const id = getConversationId(conversationId)
  ensureConversation(db, id)
  return db
    .prepare(
      `
    DELETE FROM messages
    WHERE conversation_id = ?
  `
    )
    .run(id)
}
