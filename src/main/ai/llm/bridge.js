import { randomUUID } from 'crypto'
import {
  startServer,
  stopServer,
  onLoadProgress,
  isReady,
  getModelPath,
  getProcess
} from './server.js'
import { streamChat, nonStreamChat, healthCheck } from './client.js'
import { chatCompletion } from './client.js'
import { emitAll } from '../../ipc/shared'
import { logger } from '../../core/logger'
import { parseTextToolCalls } from './text-tool-parser.js'
import { executeElectronTool } from './tool-executor.js'
import { getContextSize } from '../config.js'
import {
  resetStreamState,
  setChatStreamHandlers,
  clearChatStreamHandlers,
  handleChatEventForRenderer
} from './stream.js'

export { setChatStreamHandlers, clearChatStreamHandlers }

let _status = { ready: false, modelPath: null, loading: false, error: null }
let _shuttingDown = false

const pendingRequests = new Map()
const agentListeners = new Map()
const agentControllers = new Map()

let _chatHistory = []
let _systemPrompt = null
let _chatController = null

let _restartAttempts = 0
let _healthCheckInterval = null
const MAX_RESTART_ATTEMPTS = 3
const HEALTH_CHECK_INTERVAL_MS = 30_000

function stopHealthCheck() {
  if (_healthCheckInterval) {
    clearInterval(_healthCheckInterval)
    _healthCheckInterval = null
  }
}

function startHealthCheckLoop() {
  stopHealthCheck()
  let missedChecks = 0
  _healthCheckInterval = setInterval(async () => {
    if (!isReady()) {
      stopHealthCheck()
      return
    }
    const ok = await healthCheck()
    if (ok) {
      missedChecks = 0
    } else {
      missedChecks++
      if (missedChecks > 3) {
        logger.error('[llm.bridge] Server health check failed — restarting')
        stopHealthCheck()
        const modelPath = getModelPath()
        if (modelPath && _restartAttempts < MAX_RESTART_ATTEMPTS) {
          _restartAttempts++
          emitAll('models:restarting', { attempt: _restartAttempts })
          loadModel(modelPath).catch((err) => {
            logger.error('[llm.bridge] Auto-restart failed:', err)
            emitAll('models:load-error', { message: err.message })
          })
        }
      }
    }
  }, HEALTH_CHECK_INTERVAL_MS)
}

export function getLlmStatus() {
  return { ..._status }
}

export async function loadModel(modelPath) {
  stopHealthCheck()

  _chatController?.abort()
  for (const [, controller] of agentControllers) {
    controller.abort()
  }

  _status = { ready: false, modelPath, loading: true, error: null }
  emitAll('models:load-progress', { percent: 0 })

  onLoadProgress((percent) => {
    emitAll('models:load-progress', { percent })
  })

  try {
    await startServer(modelPath, { contextSize: await getContextSize() })
    _status = { ready: true, modelPath, loading: false, error: null }
    _restartAttempts = 0
    startHealthCheckLoop()
    logger.info('[llm.bridge] Model ready (llama-server):', modelPath)
    emitAll('models:load-progress', { percent: 100 })
    emitAll('models:ready', { path: modelPath })
  } catch (err) {
    _status = { ready: false, modelPath, loading: false, error: err.message }
    logger.error('[llm.bridge] Load error:', err.message)
    emitAll('models:load-error', { message: err.message })
    throw err
  }
}

export async function reloadModel(modelPath) {
  return loadModel(modelPath)
}

let _prewarmToolProvider = null
let _prewarmPromptProvider = null
let _prewarmController = null

export function setPrewarmProviders(toolProvider, promptProvider) {
  _prewarmToolProvider = toolProvider
  _prewarmPromptProvider = promptProvider
}

function cancelPrewarm() {
  if (_prewarmController) {
    _prewarmController.abort()
    _prewarmController = null
    logger.info('[llm.bridge] Prewarm cancelled — real message incoming')
  }
}

export async function prewarmChat() {
  if (!isReady()) return
  if (!_prewarmPromptProvider) {
    logger.warn('[llm.bridge] prewarm skipped — no providers set')
    return
  }
  _prewarmController = new AbortController()
  try {
    const systemPrompt = _prewarmPromptProvider()
    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: 'hi' }
    ]
    await chatCompletion({
      messages,
      tools: undefined,
      stream: false,
      maxTokens: 1,
      signal: _prewarmController.signal
    })
    logger.info('[llm.bridge] Prewarm complete (system prompt only, no tools)')
  } catch (err) {
    if (_prewarmController?.signal?.aborted) {
      logger.info('[llm.bridge] Prewarm aborted')
    } else {
      logger.warn('[llm.bridge] Prewarm failed:', err.message)
    }
  } finally {
    _prewarmController = null
  }
}

export function sendChatMessage({
  requestId,
  message,
  systemPrompt,
  history,
  toolDefinitions,
  silent
}) {
  cancelPrewarm()
  ensurePendingRequest(requestId)
  handleChatSend({ requestId, message, systemPrompt, history, toolDefinitions, silent })
}

async function executeTool(name, args) {
  const output = await executeElectronTool(name, args)
  if (output && typeof output === 'object' && 'endTurn' in output) return output
  return { result: typeof output === 'string' ? output : JSON.stringify(output), endTurn: false }
}

async function waitForReady(timeoutMs = 30_000, intervalMs = 500) {
  if (isReady()) return true

  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, intervalMs))
    if (isReady()) return true
    if (_status.error) return false
    if (!_status.loading && !getProcess()) return false
  }
  return false
}

async function handleChatSend({
  requestId,
  message,
  systemPrompt,
  history,
  toolDefinitions = [],
  silent = false
}) {
  if (!isReady()) {
    const ready = await waitForReady()
    if (!ready) {
      if (!silent)
        handleChatEventForRenderer(requestId, { type: 'error', message: 'Model not loaded' })
      resolvePending(requestId)
      return
    }
  }

  if (!silent && _chatController) {
    _chatController.abort()
  }
  const controller = new AbortController()
  if (!silent) _chatController = controller
  const signal = controller.signal

  const emit = (event) => {
    if (!signal.aborted && !silent) handleChatEventForRenderer(requestId, event)
  }

  emit({ type: 'chunk_start', streamId: requestId })

  try {
    const messages = buildMessages(systemPrompt, history, message)
    const tools = toolDefinitions.length > 0 ? toolDefinitions : undefined

    let finalText = ''
    const maxRounds = 15
    let lastRoundText = ''
    const toolNameSet = new Set(toolDefinitions.map((t) => t.name))

    for (let round = 0; round < maxRounds; round++) {
      let roundText = ''
      let rawRoundText = ''
      const toolCalls = []
      let insideThink = false

      for await (const event of streamChat({ messages, tools, signal })) {
        if (event.type === 'text') {
          rawRoundText += event.content

          if (insideThink) {
            const closeIdx = rawRoundText.indexOf('</think>')
            if (closeIdx !== -1) {
              insideThink = false
              const after = rawRoundText.slice(closeIdx + 8)
              rawRoundText = after
              if (after) {
                roundText += after
                finalText += after
                emit({ type: 'text', content: after })
              }
            }
            continue
          }

          const openIdx = event.content.indexOf('<think>')
          if (openIdx !== -1) {
            const before = event.content.slice(0, openIdx)
            if (before) {
              roundText += before
              finalText += before
              emit({ type: 'text', content: before })
            }
            const closeIdx = rawRoundText.indexOf('</think>')
            if (closeIdx !== -1) {
              const after = rawRoundText.slice(closeIdx + 8)
              rawRoundText = after
              if (after) {
                roundText += after
                finalText += after
                emit({ type: 'text', content: after })
              }
            } else {
              insideThink = true
            }
            continue
          }

          roundText += event.content
          finalText += event.content
          emit({ type: 'text', content: event.content })
        } else if (event.type === 'tool_call') {
          toolCalls.push(event)
        }
      }

      if (toolCalls.length === 0 && roundText.length > 0) {
        const textCalls = parseTextToolCalls(roundText, toolNameSet)
        if (textCalls.length > 0) {
          logger.info(`[llm.bridge] Parsed ${textCalls.length} tool call(s) from text output`)
          for (const tc of textCalls) toolCalls.push(tc)
        }
      }

      if (toolCalls.length === 0) {
        lastRoundText = roundText
        break
      }

      if (roundText) {
        messages.push({ role: 'assistant', content: roundText })
      }

      const assistantToolCallMsg = {
        role: 'assistant',
        content: null,
        tool_calls: toolCalls.map((tc) => ({
          id: tc.id || `call_${randomUUID().slice(0, 8)}`,
          type: 'function',
          function: { name: tc.name, arguments: JSON.stringify(tc.args) }
        }))
      }
      messages.push(assistantToolCallMsg)

      for (let i = 0; i < toolCalls.length; i++) {
        const tc = toolCalls[i]
        emit({ type: 'tool_call', name: tc.name, args: tc.args })
        logger.info(
          `[llm.bridge] Executing tool: ${tc.name}`,
          JSON.stringify(tc.args).slice(0, 200)
        )
        let toolOutput
        try {
          toolOutput = await executeTool(tc.name, tc.args)
          logger.info(
            `[llm.bridge] Tool ${tc.name} result: ${String(toolOutput.result).slice(0, 200)}`
          )
        } catch (err) {
          logger.error(`[llm.bridge] Tool ${tc.name} error:`, err.message)
          toolOutput = { result: JSON.stringify({ error: err.message }), endTurn: false }
        }
        emit({ type: 'tool_result', name: tc.name, result: toolOutput.result })

        messages.push({
          role: 'tool',
          tool_call_id: assistantToolCallMsg.tool_calls[i]?.id,
          content: toolOutput.result
        })

        if (toolOutput.endTurn) {
          if (toolOutput.message) {
            finalText += toolOutput.message
            lastRoundText = toolOutput.message
            emit({ type: 'text', content: toolOutput.message })
          }
          round = maxRounds
          break
        }
      }
    }

    if (lastRoundText) {
      messages.push({ role: 'assistant', content: lastRoundText })
    }

    if (!silent) {
      _chatHistory = messages
      _systemPrompt = systemPrompt
    }

    emit({ type: 'chunk_end', streamId: requestId, finalText, history: exportHistory(messages) })

    resolvePending(requestId, { finalText, streamId: requestId })
  } catch (err) {
    if (signal.aborted) {
      if (!silent) {
        handleChatEventForRenderer(requestId, { type: 'abort_initiated' })
        handleChatEventForRenderer(requestId, {
          type: 'chunk_end',
          streamId: requestId,
          finalText: null
        })
      }
      resolvePending(requestId)
    } else {
      if (!silent) handleChatEventForRenderer(requestId, { type: 'error', message: err.message })
      resolvePending(requestId, null, new Error(err.message))
    }
  } finally {
    if (!silent && _chatController === controller) _chatController = null
  }
}

function buildMessages(systemPrompt, history, userMessage) {
  const messages = []
  if (systemPrompt) {
    messages.push({ role: 'system', content: systemPrompt })
  }
  if (history?.length) {
    for (const msg of history) {
      if (msg.role === 'user' || msg.role === 'assistant' || msg.role === 'system') {
        messages.push({ role: msg.role, content: msg.content || '' })
      }
    }
  }
  messages.push({ role: 'user', content: userMessage })
  return messages
}

function exportHistory(messages) {
  return messages
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => ({
      role: m.role,
      content: m.content || ''
    }))
}

function ensurePendingRequest(requestId) {
  if (pendingRequests.has(requestId)) return
  pendingRequests.set(requestId, { resolve: null, reject: null, settled: null })
}

function resolvePending(requestId, result, error) {
  const pending = pendingRequests.get(requestId)
  if (!pending) return
  const payload = result || { finalText: null, streamId: requestId }
  if (pending.resolve) {
    if (error) pending.reject(error)
    else pending.resolve(payload)
    pendingRequests.delete(requestId)
  } else {
    pending.settled = error
      ? { finalText: null, streamId: requestId, error: error.message }
      : payload
  }
}

export function waitForChatResult(requestId, timeoutMs = 300_000) {
  return new Promise((resolve, reject) => {
    const existing = pendingRequests.get(requestId)

    if (existing?.settled) {
      pendingRequests.delete(requestId)
      resolve(existing.settled)
      return
    }

    const timer = setTimeout(() => {
      pendingRequests.delete(requestId)
      resolve({ finalText: null, streamId: requestId })
    }, timeoutMs)

    const entry = {
      resolve: (data) => {
        clearTimeout(timer)
        resolve(data)
      },
      reject: (err) => {
        clearTimeout(timer)
        reject(err)
      },
      settled: null
    }

    if (existing) {
      existing.resolve = entry.resolve
      existing.reject = entry.reject
    } else {
      pendingRequests.set(requestId, entry)
    }
  })
}

export function abortChat() {
  _chatController?.abort()
}

export async function clearChat() {
  resetStreamState()
  _chatController?.abort()
  _chatHistory = []
  _systemPrompt = null
}

export async function getChatHistory() {
  return exportHistory(_chatHistory)
}

export function summarizeText(text, promptPrefix) {
  if (!isReady()) return Promise.resolve(text)

  return (async () => {
    try {
      const result = await nonStreamChat({
        messages: [{ role: 'user', content: `${promptPrefix}\n\n${text}` }],
        temperature: 0.3,
        maxTokens: 2048
      })
      return result.text || text
    } catch {
      return text
    }
  })()
}

export function startAgent({ taskId, instructions, context, toolDefinitions }) {
  runAgent({ taskId, instructions, context, toolDefinitions }).catch((err) => {
    agentListeners.get(taskId)?.({ type: 'task.status', status: 'failed', message: err.message })
  })
}

async function runAgent({ taskId, instructions, context, toolDefinitions }) {
  const { runAgentLoop, buildAgentPrompt, fetchPastContext, fetchKnowledgePatterns } =
    await import('../../chat/agent/agent.runner.js')

  const controller = new AbortController()
  agentControllers.set(taskId, controller)
  const signal = controller.signal

  const [pastContext, knowledgePatterns] = await Promise.all([
    fetchPastContext(instructions).catch(() => null),
    fetchKnowledgePatterns(instructions).catch(() => null)
  ])
  const systemPrompt = buildAgentPrompt(instructions, context, pastContext, knowledgePatterns)

  const emit = (event) => {
    if (event.type !== 'task.status') {
      emitAll('task:event', { taskId, ...event })
    }
    const isInternalTool =
      (event.type === 'tool_call' || event.type === 'tool_result') &&
      event.name === 'update_journal'
    if (
      !isInternalTool &&
      (event.type === 'tool_call' || event.type === 'tool_result' || event.type === 'thought')
    ) {
      emitAll('chat:event', { type: event.type, data: { taskId, ...event } })
    }
    agentListeners.get(taskId)?.(event)
  }

  try {
    const { summary, done, journal } = await runAgentLoop({
      taskId,
      systemPrompt,
      instructions,
      context,
      toolDefinitions,
      executeToolFn: async (name, args) => {
        const output = await executeTool(name, args)
        return output.result
      },
      signal,
      emit,
      summarize: (text, prefix) => summarizeText(text, prefix)
    })

    if (journal) {
      const { recordBlockerPatterns } = await import('../../chat/agent/agent.runner.js')
      await recordBlockerPatterns(journal).catch(() => {})
    }

    emit({
      type: 'task.status',
      status: done ? 'completed' : 'incomplete',
      result: summary
    })
  } catch (err) {
    emit({ type: 'task.status', status: 'failed', message: err.message })
  } finally {
    agentControllers.delete(taskId)
  }
}

export function abortAgent(taskId) {
  const controller = agentControllers.get(taskId)
  if (controller) {
    controller.abort()
    agentControllers.delete(taskId)
  }
}

export function onAgentEvent(taskId, listener) {
  agentListeners.set(taskId, listener)
  return () => agentListeners.delete(taskId)
}

export async function destroyWorker() {
  _shuttingDown = true
  stopHealthCheck()
  resetStreamState()
  _chatController?.abort()
  for (const [, controller] of agentControllers) {
    controller.abort()
  }
  agentControllers.clear()
  for (const [key, pending] of pendingRequests) {
    pending.reject?.(new Error('Server destroyed'))
    pendingRequests.delete(key)
  }
  await stopServer()
  _status = { ready: false, modelPath: null, loading: false, error: null }
}
