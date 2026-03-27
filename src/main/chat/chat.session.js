import { randomUUID } from 'crypto'
import { loadBuiltinTools } from '@vox-ai-app/tools'
import { ALL_INTEGRATION_TOOLS } from '@vox-ai-app/integrations'
import { ALL_KNOWLEDGE_TOOLS } from '@vox-ai-app/indexing'
import { sendChatMessage, abortChat, clearChat, waitForChatResult } from '../ai/llm.bridge'
import {
  getMessages,
  getMessagesBeforeId,
  appendMessage,
  clearMessages
} from '../storage/messages.db'
import { storeGet } from '../storage/store'
import { emitAll } from '../ipc/shared'
import { definition as spawnDef } from './spawn.tool'
import { getMcpToolDefinitions } from '../mcp/mcp.service'
import { logger } from '../logger'

const DEFAULT_SYSTEM_PROMPT = `You are Vox, a helpful AI assistant running locally on the user's computer. You have access to their filesystem, can run code, search the web, and delegate complex multi-step tasks to background agents via spawn_task.

Be concise, direct, and genuinely useful. When the user asks for something that requires multiple steps or might take a while, use spawn_task to delegate it so they don't have to wait.`

const SAVE_USER_INFO_DEF = {
  name: 'save_user_info',
  description:
    'Persist a piece of information about the user for future reference. Use this when the user tells you something about themselves that would be useful to remember (name, location, job, preferences, etc.).',
  parameters: {
    type: 'object',
    properties: {
      info_key: {
        type: 'string',
        description:
          'Short identifier for what this information is (e.g. "name", "location", "preferred_language", "occupation")'
      },
      info_value: {
        type: 'string',
        description: 'The value to store'
      }
    },
    required: ['info_key', 'info_value']
  }
}

const MESSAGE_PAGE_SIZE = 50

let _toolDefinitions = null

function buildToolDefinitions() {
  const defs = []

  try {
    const builtinMap = loadBuiltinTools()
    for (const t of builtinMap.values()) defs.push(t.definition)
  } catch (err) {
    logger.warn('[chat] Failed to load builtin tools:', err.message)
  }

  try {
    for (const t of ALL_INTEGRATION_TOOLS) defs.push(t.definition)
  } catch (err) {
    logger.warn('[chat] Failed to load integration tools:', err.message)
  }

  try {
    for (const t of ALL_KNOWLEDGE_TOOLS) defs.push(t.definition)
  } catch (err) {
    logger.warn('[chat] Failed to load knowledge tools:', err.message)
  }

  try {
    defs.push(...getMcpToolDefinitions())
  } catch (err) {
    logger.warn('[chat] Failed to load MCP tools:', err.message)
  }

  try {
    const customTools = storeGet('customTools') || []
    for (const t of customTools) {
      if (t.is_enabled !== false && t.name) {
        defs.push({
          name: t.name,
          description: t.description || '',
          parameters: t.parameters || { type: 'object', properties: {} }
        })
      }
    }
  } catch (err) {
    logger.warn('[chat] Failed to load custom tools:', err.message)
  }

  defs.push(spawnDef)
  defs.push(SAVE_USER_INFO_DEF)
  _toolDefinitions = defs
  return defs
}

export function getToolDefinitions() {
  return _toolDefinitions || buildToolDefinitions()
}

export function invalidateToolDefinitions() {
  _toolDefinitions = null
}

function formatMessagesForRenderer(rows) {
  return rows.map((m, i) => ({
    id: `db-${m.id || i}`,
    dbId: m.id || null,
    role: m.role,
    content: String(m.content || ''),
    pending: false,
    streamId: null
  }))
}

function buildPage(rows, limit) {
  const hasMore = rows.length > limit
  const pageRows = hasMore ? rows.slice(rows.length - limit) : rows
  return {
    messages: formatMessagesForRenderer(pageRows),
    hasMore
  }
}

export function getSystemPrompt() {
  const base = storeGet('systemPrompt') || DEFAULT_SYSTEM_PROMPT
  const userInfo = storeGet('vox.user.info') || {}
  if (Object.keys(userInfo).length === 0) return base
  return `${base}\n\nKnown user information:\n${JSON.stringify(userInfo, null, 2)}`
}

function appendUserMessageToConversation(content, requestId) {
  const userMsgRow = appendMessage('user', content)

  emitAll('chat:event', {
    type: 'msg:append',
    data: {
      message: {
        id: `db-${userMsgRow?.id || requestId}`,
        dbId: userMsgRow?.id || null,
        role: 'user',
        content,
        pending: false,
        streamId: null
      }
    }
  })
}

function dispatchMessage({ content, requestId, systemPrompt, history, toolDefinitions }) {
  appendUserMessageToConversation(content, requestId)

  sendChatMessage({
    requestId,
    message: content,
    systemPrompt,
    history,
    toolDefinitions
  })
}

async function prepareMessage(content) {
  if (!content?.trim())
    throw Object.assign(new Error('Message content required'), { code: 'VALIDATION_ERROR' })

  const requestId = randomUUID()
  const systemPrompt = getSystemPrompt()

  const storedHistory = getMessages().map((m) => ({ role: m.role, content: m.content }))
  const toolDefinitions = buildToolDefinitions()

  return {
    requestId,
    systemPrompt,
    storedHistory,
    toolDefinitions
  }
}

export async function sendMessage({ content }) {
  const { requestId, systemPrompt, storedHistory, toolDefinitions } = await prepareMessage(content)

  dispatchMessage({
    content,
    requestId,
    systemPrompt,
    history: storedHistory,
    toolDefinitions
  })

  waitForChatResult(requestId)
    .then(({ finalText }) => {
      if (finalText) appendMessage('assistant', finalText)
    })
    .catch(() => {})

  return { requestId }
}

export async function sendMessageAndWait({ content }) {
  const { requestId, systemPrompt, storedHistory, toolDefinitions } = await prepareMessage(content)

  dispatchMessage({
    content,
    requestId,
    systemPrompt,
    history: storedHistory,
    toolDefinitions
  })

  const { finalText } = await waitForChatResult(requestId)
  if (finalText) appendMessage('assistant', finalText)
  return finalText || ''
}

export function abort() {
  abortChat()
}

export async function clearConversation() {
  await clearChat()
  clearMessages()
  emitAll('chat:event', { type: 'msg:replace-all', data: { messages: [], hasMore: false } })
}

export function getStoredMessagesPage(limit = MESSAGE_PAGE_SIZE) {
  return buildPage(getMessages(undefined, limit + 1), limit)
}

export function loadOlderStoredMessages(offsetId, limit = MESSAGE_PAGE_SIZE) {
  const page = buildPage(getMessagesBeforeId(offsetId, undefined, limit + 1), limit)
  if (page.messages.length > 0) {
    emitAll('chat:event', { type: 'msg:prepend', data: page })
  }
  return page
}

export function getStoredMessages(limit = MESSAGE_PAGE_SIZE) {
  return getStoredMessagesPage(limit).messages
}

export function getChatStatus() {
  return {
    status: {
      state: 'ready',
      connected: true,
      sessionReady: true,
      mode: 'text',
      queuedMessages: 0,
      lastError: null
    }
  }
}
