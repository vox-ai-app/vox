import { randomUUID } from 'crypto'
import {
  sendChatMessage,
  abortChat,
  clearChat,
  waitForChatResult,
  getLlmStatus
} from '../ai/llm.bridge'
import {
  getMessages,
  getMessagesBeforeId,
  appendMessage,
  clearMessages,
  clearSummaryCheckpoint
} from '../storage/messages.db'
import { storeGet } from '../storage/store'
import { emitAll } from '../ipc/shared'
import { getUnreportedTerminalTasks, markTaskReported } from '../storage/tasks.db'
import { logger } from '../logger'
import { buildDefaultSystemPrompt } from './chat.prompts'
import { getToolDefinitions, invalidateToolDefinitions } from './chat.tools'
import { getSkillsPrompt } from './skills.service'
import {
  sanitizeHistory,
  buildContextHistory,
  maybeSummarize,
  resetSummaryState
} from './chat.history'

export { getToolDefinitions, invalidateToolDefinitions }

const MESSAGE_PAGE_SIZE = 50

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
  const base = storeGet('systemPrompt') || buildDefaultSystemPrompt()
  const userInfo = storeGet('vox.user.info') || {}
  const skills = getSkillsPrompt()
  let prompt = base
  if (skills) prompt += skills
  if (Object.keys(userInfo).length > 0)
    prompt += `\n\nKnown user information:\n${JSON.stringify(userInfo, null, 2)}`
  return prompt
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

function injectUnreportedTasks() {
  const unreported = getUnreportedTerminalTasks()
  for (const task of unreported) {
    const label = task.status === 'completed' ? 'completed' : task.status
    const body =
      `[Background task ${label}]\nTask: ${task.instructions}\n` +
      (task.result ? `Result: ${task.result}` : task.message ? `Message: ${task.message}` : '')
    appendMessage('assistant', body)
    markTaskReported(task.taskId)
  }
}

async function prepareMessage(content) {
  const _perfId = `[PERF] prepareMessage #${Date.now()}`
  console.time(_perfId)
  if (!content?.trim())
    throw Object.assign(new Error('Message content required'), { code: 'VALIDATION_ERROR' })

  const requestId = randomUUID()

  console.time(`${_perfId} getSystemPrompt`)
  const systemPrompt = getSystemPrompt()
  console.timeEnd(`${_perfId} getSystemPrompt`)

  injectUnreportedTasks()

  console.time(`${_perfId} buildHistory`)
  const storedHistory = buildContextHistory(sanitizeHistory(getMessages()))
  console.timeEnd(`${_perfId} buildHistory`)

  console.time(`${_perfId} getToolDefinitions`)
  const toolDefinitions = getToolDefinitions()
  console.timeEnd(`${_perfId} getToolDefinitions`)

  console.timeEnd(_perfId)
  return {
    requestId,
    systemPrompt,
    storedHistory,
    toolDefinitions
  }
}

export async function sendMessage({ content }) {
  const _perfId = `[PERF] sendMessage #${Date.now()}`
  console.time(_perfId)

  console.time(`${_perfId} prepareMessage`)
  const { requestId, systemPrompt, storedHistory, toolDefinitions } = await prepareMessage(content)
  console.timeEnd(`${_perfId} prepareMessage`)

  console.time(`${_perfId} dispatchMessage`)
  dispatchMessage({
    content,
    requestId,
    systemPrompt,
    history: storedHistory,
    toolDefinitions
  })
  console.timeEnd(`${_perfId} dispatchMessage`)

  try {
    console.time(`${_perfId} waitForChatResult`)
    const { finalText, streamId } = await waitForChatResult(requestId)
    console.timeEnd(`${_perfId} waitForChatResult`)
    if (finalText) {
      const row = appendMessage('assistant', finalText)
      void maybeSummarize()
      emitAll('chat:event', {
        type: 'msg:complete',
        data: {
          streamId: streamId || requestId,
          dbId: row?.id || null,
          recovery: {
            id: `db-${row?.id}`,
            dbId: row?.id || null,
            role: 'assistant',
            content: finalText,
            pending: false,
            streamId: null
          }
        }
      })
    } else {
      emitAll('chat:event', {
        type: 'msg:complete',
        data: { streamId: streamId || requestId }
      })
    }
  } catch (err) {
    logger.warn('[chat] Message result failed:', err.message)
    emitAll('chat:event', {
      type: 'msg:complete',
      data: { streamId: requestId }
    })
  }

  console.timeEnd(_perfId)
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
  resetSummaryState()
  try {
    clearSummaryCheckpoint()
  } catch {
    /* */
  }
  await clearChat()
  clearMessages()
  emitAll('chat:event', { type: 'msg:replace-all', data: { messages: [], hasMore: false } })
}

const WELCOME_MESSAGE =
  "Hey! I'm Vox, your personal AI assistant running right here on your machine. I can search your files, draft emails, create documents, run code, and more. Just ask."

export function getStoredMessagesPage(limit = MESSAGE_PAGE_SIZE) {
  const rows = getMessages(undefined, limit + 1)
  if (rows.length === 0) {
    appendMessage('assistant', WELCOME_MESSAGE)
    const seeded = getMessages(undefined, limit + 1)
    return buildPage(seeded, limit)
  }
  return buildPage(rows, limit)
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

let _currentMode = 'text'

export function setMode(mode) {
  _currentMode = mode
}

export function getChatStatus() {
  const llm = getLlmStatus()
  return {
    status: {
      state: llm.ready ? 'ready' : llm.loading || !llm.error ? 'loading' : 'error',
      connected: true,
      sessionReady: llm.ready,
      mode: _currentMode,
      queuedMessages: 0,
      lastError: llm.error || null
    }
  }
}
