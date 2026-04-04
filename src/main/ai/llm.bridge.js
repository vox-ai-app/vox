import { randomUUID } from 'crypto'
import { isReady } from './llm.server.js'
import { streamChat, nonStreamChat } from './llm.client.js'
import { logger } from '../logger'
import { parseTextToolCalls } from './llm.text-tool-parser.js'
import { executeElectronTool } from './llm.tool-executor.js'
import {
  resetStreamState,
  setChatStreamHandlers,
  clearChatStreamHandlers,
  handleChatEventForRenderer
} from './llm.stream.js'
import {
  loadModel,
  reloadModel,
  getLlmStatus,
  setPrewarmProviders,
  prewarmChat,
  cancelPrewarm,
  waitForReady,
  stopHealthCheck,
  stopServer,
  resetModelStatus
} from './llm.model-lifecycle.js'
import { startAgent as _startAgent, abortAgent, onAgentEvent, abortAllAgents } from './llm.agent.js'

export { setChatStreamHandlers, clearChatStreamHandlers }
export { loadModel, reloadModel, getLlmStatus, setPrewarmProviders, prewarmChat }
export { abortAgent, onAgentEvent }

const pendingRequests = new Map()

let _chatHistory = []
let _systemPrompt = null
let _chatController = null

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

async function handleChatSend({
  requestId,
  message,
  systemPrompt,
  history,
  toolDefinitions = [],
  silent
}) {
  const _bridgePerfId = `[PERF] handleChatSend #${Date.now()}`
  console.time(_bridgePerfId)
  console.log(
    `${_bridgePerfId} message: "${message.slice(0, 80)}"${message.length > 80 ? '...' : ''} tools: ${toolDefinitions.length}`
  )

  if (!isReady()) {
    console.time(`${_bridgePerfId} waitForReady`)
    const ready = await waitForReady()
    console.timeEnd(`${_bridgePerfId} waitForReady`)
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

  const emit = silent
    ? () => {}
    : (event) => {
        if (!signal.aborted) handleChatEventForRenderer(requestId, event)
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
      console.time(`${_bridgePerfId} round-${round}`)

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
      console.timeEnd(`${_bridgePerfId} round-${round}`)

      if (toolCalls.length === 0 && roundText.length > 0) {
        const textCalls = parseTextToolCalls(roundText, toolNameSet)
        if (textCalls.length > 0) {
          logger.info(`[llm.bridge] Parsed ${textCalls.length} tool call(s) from text output`)
          for (const tc of textCalls) toolCalls.push(tc)

          const tagIdx = roundText.indexOf('<tool_call>')
          const jsonIdx = roundText.search(/\{\s*"name"\s*:\s*"/)
          const cutIdx = tagIdx !== -1 ? tagIdx : jsonIdx
          const originalLen = roundText.length
          if (cutIdx > 0) {
            roundText = roundText.slice(0, cutIdx).trimEnd()
          } else {
            roundText = ''
          }
          const charsRemoved = originalLen - roundText.length
          if (charsRemoved > 0) {
            finalText = finalText.slice(0, finalText.length - charsRemoved)
          }
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
        console.time(`${_bridgePerfId} tool:${tc.name}`)
        let result
        try {
          result = await executeElectronTool(tc.name, tc.args)
          logger.info(`[llm.bridge] Tool ${tc.name} result: ${String(result).slice(0, 200)}`)
        } catch (err) {
          logger.error(`[llm.bridge] Tool ${tc.name} error:`, err.message)
          result = JSON.stringify({ error: err.message })
        }
        console.timeEnd(`${_bridgePerfId} tool:${tc.name}`)
        const serialized = typeof result === 'string' ? result : JSON.stringify(result)
        emit({ type: 'tool_result', name: tc.name, result: serialized })

        messages.push({
          role: 'tool',
          tool_call_id: assistantToolCallMsg.tool_calls[i]?.id,
          content: serialized
        })
      }
    }

    if (lastRoundText) {
      messages.push({ role: 'assistant', content: lastRoundText })
    }

    if (!silent) {
      _chatHistory = messages
      _systemPrompt = systemPrompt
    }

    console.timeEnd(_bridgePerfId)
    console.log(`${_bridgePerfId} finalText length: ${finalText.length} chars`)
    emit({ type: 'chunk_end', streamId: requestId, finalText, history: exportHistory(messages) })

    resolvePending(requestId, { finalText, streamId: requestId })
  } catch (err) {
    if (signal.aborted) {
      if (!silent) handleChatEventForRenderer(requestId, { type: 'abort_initiated' })
      if (!silent)
        handleChatEventForRenderer(requestId, {
          type: 'chunk_end',
          streamId: requestId,
          finalText: null
        })
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
  _startAgent({
    taskId,
    instructions,
    context,
    toolDefinitions,
    summarizeFn: (text, prefix) => summarizeText(text, prefix)
  })
}

export async function destroyWorker() {
  stopHealthCheck()
  resetStreamState()
  _chatController?.abort()
  abortAllAgents()
  for (const [key, pending] of pendingRequests) {
    pending.reject?.(new Error('Server destroyed'))
    pendingRequests.delete(key)
  }
  await stopServer()
  resetModelStatus()
}
