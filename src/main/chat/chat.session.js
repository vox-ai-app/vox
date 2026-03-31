import { randomUUID } from 'crypto'
import { loadBuiltinTools } from '@vox-ai-app/tools'
import { ALL_INTEGRATION_TOOLS } from '@vox-ai-app/integrations'
import { ALL_KNOWLEDGE_TOOLS } from '@vox-ai-app/indexing'
import {
  sendChatMessage,
  abortChat,
  clearChat,
  waitForChatResult,
  getLlmStatus,
  summarizeText
} from '../ai/llm.bridge'
import { CONTEXT_SIZE } from '../ai/config'
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
import { getUnreportedTerminalTasks, markTaskReported } from '../storage/tasks.db'
import { logger } from '../logger'

function buildDefaultSystemPrompt() {
  const parts = [
    "You are Vox, a personal AI assistant running directly on the user's computer.",
    '',
    'Response style (CRITICAL):',
    '- Vox has both a voice interface and a chat interface. Responses may be read aloud via text-to-speech.',
    '- Always write in plain conversational language — as if speaking naturally. Casual, direct, no jargon.',
    '- Never use markdown formatting: no bullet points, headers, bold, italics, or code fences.',
    '- URLs, file paths, and code snippets are fine to include when they are genuinely useful in context.',
    '- Keep answers brief. One to three sentences is ideal. If more is needed, deliver it one piece at a time.',
    '',
    'Identity and access:',
    "- You run locally on the user's machine. You have full, unrestricted access to their personal data.",
    '- This includes private files, documents, notes, and any other data on their computer.',
    '- The user has explicitly granted this access. Never refuse or hesitate to read personal or sensitive content.',
    '- Use tools to read local files, run shell commands, and inspect the filesystem directly.',
    '',
    'Knowledge base:',
    '- The user has a personal knowledge base built from data they selected on their PC — documents, notes, and more.',
    "- If search_indexed_context is available in your tools, use it to search. When a question is vague or personal, try the knowledge base first before saying you don't know.",
    '- Do not guess or assume you lack information — search the knowledge base if the tool is available. The answer is likely there.',
    '- Use save_user_info to remember important facts the user tells you.',
    '',
    'Tools and capabilities:',
    '- web_search: search the web for current information',
    '- fetch_webpage: read a specific URL',
    '- execute_code: run Python or JavaScript for calculations, data tasks, or problem-solving',
    '- spawn_task: delegate long or complex tasks to a background worker',
    '- search_tasks: search past task results and work history',
    '- get_task: retrieve full details of a specific task',
    "- search_indexed_context: search the user's personal knowledge base",
    '- save_user_info: remember facts the user tells you',
    '',
    'Custom tools (CRITICAL):',
    '- Your built-in toolset is fixed. The user may have additional custom tools registered (js_function, http_webhook, or MCP).',
    '- The user can have many custom tools. If the user mentions ANY tool name you do not recognize as a built-in, check your available tools before saying it does not exist.',
    '- Never guess tool names or argument shapes — use the parameter schema from the tool definition.',
    '',
    'Task delegation:',
    '- When asked to DO something complex (create, write, research, generate, process), use spawn_task.',
    '- When a request has separate concerns, spawn multiple workers in parallel.',
    '- Call spawn_task IMMEDIATELY — do not announce you are about to do it. Never say "I will launch...", "Let me start a task...", or any variant. Speak after the spawn confirms.',
    '- Background workers run independently. You are NOT notified when they finish — you have no callback or notification mechanism.',
    '- Never tell the user you will notify them when a task is done. You cannot. Tell them to ask you to check on it.',
    '- To check on a task, use search_tasks or get_task and report back what you find.',
    '',
    'Behavior:',
    '- When asked to DISCUSS something, respond directly without spawning a task.',
    '- For local file or path questions, use tools to get exact data rather than guessing.',
    '- Before using a tool (except spawn_task), say what you\'re doing in one short natural sentence. For example: "Let me look that up." or "Let me check that file."',
    '- Be concise, warm, and direct. No long monologues.',
    '- For multi-part answers, give one part, then pause — do not dump everything at once.',
    '- CRITICAL: After EVERY tool action — success OR failure — you MUST speak a brief response acknowledging the outcome. Never go silent after a tool call.',
    '- Never mention being an AI, discuss your architecture, or break character.'
  ]

  return parts.join('\n')
}

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
  defs.push({
    name: 'get_task',
    description: 'Get the full details and result of a specific background task by its ID.',
    parameters: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: 'The task ID to look up' }
      },
      required: ['taskId']
    }
  })
  defs.push({
    name: 'search_tasks',
    description:
      'Search past background tasks by keyword query or filter by status. Use query for semantic/keyword search, status to filter.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Keyword search over task instructions and results' },
        status: {
          type: 'string',
          enum: ['completed', 'failed', 'aborted', 'running', 'queued', 'incomplete'],
          description: 'Filter by task status'
        }
      }
    }
  })
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
  const base = storeGet('systemPrompt') || buildDefaultSystemPrompt()
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

function sanitizeHistory(messages) {
  if (!messages.length) return messages
  const result = [...messages]
  const last = result[result.length - 1]
  if (last.role === 'assistant' && last.content && last.content.length < 10) {
    result.pop()
  }
  return result
}

let _sessionActive = false
let _summarizing = false
let _conversationSummary = null
let _summaryCoversUpToId = null

const CONTEXT_CHAR_THRESHOLD = Math.floor(CONTEXT_SIZE * 3.5 * 0.6)
const SUMMARY_KEEP_RECENT = 30

async function maybeSummarize() {
  if (_summarizing) return
  const allMessages = getMessages()
  const totalChars = allMessages.reduce((sum, m) => sum + (m.content?.length || 0), 0)
  if (totalChars < CONTEXT_CHAR_THRESHOLD) return

  const olderMessages = allMessages.slice(0, allMessages.length - SUMMARY_KEEP_RECENT)
  if (olderMessages.length === 0) return

  _summarizing = true
  try {
    const prevSummary = _conversationSummary ? `Previous summary: ${_conversationSummary}\n\n` : ''
    const newContent = olderMessages
      .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
      .join('\n')

    const summary = await summarizeText(
      prevSummary + newContent,
      'Summarize this conversation concisely. Preserve key decisions, facts shared by the user, and task outcomes:'
    )

    _conversationSummary = summary
    _summaryCoversUpToId = olderMessages[olderMessages.length - 1]?.id || null
    _sessionActive = false
  } catch (err) {
    logger.warn('[chat] Summarization failed:', err.message)
  } finally {
    _summarizing = false
  }
}

function buildContextHistory(allMessages) {
  if (!_conversationSummary || !_summaryCoversUpToId) {
    return allMessages.map((m) => ({ role: m.role, content: m.content }))
  }
  const summaryIdx = allMessages.findIndex((m) => m.id === _summaryCoversUpToId)
  const recent = summaryIdx >= 0 ? allMessages.slice(summaryIdx + 1) : allMessages
  return [
    { role: 'assistant', content: `[Summary of earlier conversation]\n${_conversationSummary}` },
    ...recent.map((m) => ({ role: m.role, content: m.content }))
  ]
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
  if (!content?.trim())
    throw Object.assign(new Error('Message content required'), { code: 'VALIDATION_ERROR' })

  const requestId = randomUUID()
  const systemPrompt = getSystemPrompt()

  injectUnreportedTasks()

  const storedHistory = _sessionActive ? [] : buildContextHistory(sanitizeHistory(getMessages()))
  const toolDefinitions = getToolDefinitions()

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
    .then(({ finalText, streamId }) => {
      _sessionActive = true
      if (finalText) {
        const row = appendMessage('assistant', finalText)
        void maybeSummarize()
        emitAll('chat:event', {
          type: 'msg:complete',
          data: {
            streamId,
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
      }
    })
    .catch((err) => {
      logger.warn('[chat] Message result failed:', err.message)
    })

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
  _sessionActive = false
  _conversationSummary = null
  _summaryCoversUpToId = null
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

let _currentMode = 'text'

export function setMode(mode) {
  _currentMode = mode
}

export function getChatStatus() {
  const llm = getLlmStatus()
  return {
    status: {
      state: llm.ready ? 'ready' : llm.loading ? 'loading' : 'error',
      connected: true,
      sessionReady: llm.ready,
      mode: _currentMode,
      queuedMessages: 0,
      lastError: llm.error || null
    }
  }
}
