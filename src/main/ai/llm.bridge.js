import { Worker } from 'worker_threads'
import { join } from 'path'
import { app } from 'electron'
import { emitAll } from '../ipc/shared'
import { logger } from '../logger'

let worker = null
let _status = { ready: false, modelPath: null, loading: false, error: null }
const pendingRequests = new Map()
const agentListeners = new Map()

let _activeStreamId = null

function workerPath() {
  const base = app.getAppPath().replace('app.asar', 'app.asar.unpacked')
  return join(base, 'out/main/llm.worker.js')
}

function spawnWorker() {
  if (worker) return

  worker = new Worker(workerPath())
  worker.on('message', handleWorkerMessage)
  worker.on('error', (err) => {
    logger.error('[llm.bridge] Worker error:', err)
    _status = { ready: false, modelPath: _status.modelPath, loading: false, error: err.message }
    emitAll('models:load-error', { message: err.message })
  })
  worker.on('exit', (code) => {
    if (code !== 0) {
      logger.warn('[llm.bridge] Worker exited with code', code)
      worker = null
      _status = { ready: false, modelPath: null, loading: false, error: `Worker exited: ${code}` }
    }
  })
}

function post(msg) {
  if (!worker) spawnWorker()
  worker.postMessage(msg)
}

const KNOWLEDGE_TOOL_NAMES = new Set([
  'list_indexed_files',
  'read_indexed_file',
  'search_indexed_context'
])

async function executeElectronTool(name, args) {
  switch (name) {
    case 'pick_file':
    case 'get_file_path': {
      const { dialog } = await import('electron')
      const result = await dialog.showOpenDialog({
        properties: ['openFile'],
        filters: args?.filters
      })
      return result.canceled ? null : result.filePaths[0]
    }
    case 'pick_directory': {
      const { dialog } = await import('electron')
      const result = await dialog.showOpenDialog({ properties: ['openDirectory'] })
      return result.canceled ? null : result.filePaths[0]
    }
    case 'save_user_info': {
      const { storeGet, storeSet } = await import('../storage/store.js')
      const current = storeGet('vox.user.info') || {}
      current[String(args?.info_key || '').trim()] = args?.info_value ?? ''
      storeSet('vox.user.info', current)
      return JSON.stringify({ saved: true, key: args?.info_key })
    }
    case 'spawn_task': {
      const { enqueueTask } = await import('../chat/task.queue.js')
      const { getToolDefinitions } = await import('../chat/chat.session.js')
      const { randomUUID } = await import('crypto')
      const taskId = randomUUID()

      const toolDefinitions = getToolDefinitions()
      enqueueTask({
        taskId,
        instructions: args?.instructions || '',
        context: args?.context || '',
        toolDefinitions
      })
      return JSON.stringify({ taskId, status: 'spawned' })
    }
    default: {
      if (KNOWLEDGE_TOOL_NAMES.has(name)) {
        const { listIndexedFilesForTool, readIndexedFileForTool, searchIndexedContextForTool } =
          await import('@vox-ai-app/indexing')
        if (name === 'list_indexed_files') return listIndexedFilesForTool(args)
        if (name === 'read_indexed_file') return readIndexedFileForTool(args)
        if (name === 'search_indexed_context') return searchIndexedContextForTool(args)
      }

      const { executeMcpTool, getMcpToolDefinitions } = await import('../mcp/mcp.service.js')
      const mcpDefs = getMcpToolDefinitions()
      if (mcpDefs.some((t) => t.name === name)) {
        return executeMcpTool(name, args)
      }

      const { storeGet } = await import('../storage/store.js')
      const customTools = storeGet('customTools') || []
      const custom = customTools.find((t) => t.name === name && t.is_enabled !== false)
      if (custom) {
        if (custom.source_type === 'http_webhook' && custom.webhook_url) {
          const resp = await fetch(custom.webhook_url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(args || {})
          })
          return await resp.text()
        }
        if (
          (custom.source_type === 'js_function' || custom.source_type === 'desktop') &&
          custom.source_code
        ) {
          const fn = new Function('args', custom.source_code)
          const result = await fn(args || {})
          return typeof result === 'string' ? result : JSON.stringify(result ?? null)
        }
        throw new Error(`Custom tool "${name}" has no executable source`)
      }

      throw new Error(`No handler for tool: ${name}`)
    }
  }
}

function handleWorkerMessage(msg) {
  switch (msg.type) {
    case 'ready':
      _status = { ready: true, modelPath: _status.modelPath, loading: false, error: null }
      logger.info('[llm.bridge] Model ready:', _status.modelPath)
      emitAll('models:ready', { path: _status.modelPath })
      break

    case 'load-error':
      _status = { ready: false, modelPath: _status.modelPath, loading: false, error: msg.message }
      logger.error('[llm.bridge] Load error:', msg.message)
      emitAll('models:load-error', { message: msg.message })
      break

    case 'chat:event': {
      const { requestId, event } = msg
      handleChatEventForRenderer(requestId, event)

      if (event.type === 'chunk_end') {
        pendingRequests.get(requestId)?.resolve(event)
        pendingRequests.delete(requestId)
      } else if (event.type === 'error') {
        pendingRequests.get(requestId)?.reject(new Error(event.message))
        pendingRequests.delete(requestId)
      }
      break
    }

    case 'agent:event': {
      const { taskId, event } = msg

      emitAll('task:event', { taskId, ...event })

      const isInternalTool =
        (event.type === 'tool_call' || event.type === 'tool_result') &&
        event.name === 'update_journal'
      if (
        !isInternalTool &&
        (event.type === 'tool_call' ||
          event.type === 'tool_result' ||
          event.type === 'text' ||
          event.type === 'thought')
      ) {
        emitAll('chat:event', { type: event.type, data: { taskId, ...event } })
      }
      agentListeners.get(taskId)?.(event)
      break
    }

    case 'history':
      pendingRequests.get('history')?.resolve(msg.history)
      pendingRequests.delete('history')
      break

    case 'tool:execute': {
      const { callId, taskId: _taskId, name, args } = msg
      executeElectronTool(name, args)
        .then((result) => post({ type: 'tool:result', callId, result }))
        .catch((err) => post({ type: 'tool:result', callId, error: err.message }))
      break
    }

    default:
      logger.warn('[llm.bridge] Unknown message from worker:', msg.type)
  }
}

function handleChatEventForRenderer(requestId, event) {
  switch (event.type) {
    case 'chunk_start': {
      const streamId = event.streamId || requestId
      _activeStreamId = streamId

      emitAll('chat:event', { type: 'chunk_start', streamId })

      emitAll('chat:event', {
        type: 'msg:append',
        data: {
          message: {
            id: `stream-${streamId}`,
            dbId: null,
            role: 'assistant',
            content: '',
            pending: true,
            streamId
          }
        }
      })
      break
    }

    case 'text': {
      if (_activeStreamId) {
        emitAll('chat:event', {
          type: 'msg:stream-chunk',
          data: { streamId: _activeStreamId, content: event.content }
        })
        emitAll('chat:event', {
          type: 'message_chunk',
          data: { streamId: _activeStreamId, content: event.content }
        })
      }
      break
    }

    case 'chunk_end': {
      const streamId = event.streamId || requestId

      emitAll('chat:event', { type: 'chunk_end', streamId, finalText: event.finalText })

      emitAll('chat:event', {
        type: 'msg:complete',
        data: { streamId, dbId: null }
      })
      _activeStreamId = null
      break
    }

    case 'tool_call':
      emitAll('chat:event', { type: 'tool_call', data: { name: event.name, args: event.args } })
      break

    case 'tool_result':
      emitAll('chat:event', {
        type: 'tool_result',
        data: { name: event.name, result: event.result }
      })
      break

    case 'abort_initiated':
      emitAll('chat:event', { type: 'abort_initiated' })
      _activeStreamId = null
      break

    case 'error':
      emitAll('chat:event', { type: 'error', data: { message: event.message } })
      _activeStreamId = null
      break

    default:
      break
  }
}

export function getLlmStatus() {
  return { ..._status }
}

export async function loadModel(modelPath) {
  spawnWorker()
  _status = { ready: false, modelPath, loading: true, error: null }
  post({ type: 'init', modelPath })
  return waitForReady()
}

export async function reloadModel(modelPath) {
  _status = { ready: false, modelPath, loading: true, error: null }
  post({ type: 'reload', modelPath })
  return waitForReady()
}

function waitForReady(timeoutMs = 120_000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Model load timeout')), timeoutMs)

    const oneShot = (msg) => {
      if (msg.type === 'ready') {
        clearTimeout(timer)
        worker.off('message', oneShot)
        resolve()
      } else if (msg.type === 'load-error') {
        clearTimeout(timer)
        worker.off('message', oneShot)
        reject(new Error(msg.message))
      }
    }
    worker.on('message', oneShot)
  })
}

export function sendChatMessage({ requestId, message, systemPrompt, history, toolDefinitions }) {
  post({ type: 'chat:send', requestId, message, systemPrompt, history, toolDefinitions })
}

export function waitForChatResult(requestId, timeoutMs = 300_000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingRequests.delete(requestId)
      resolve({ finalText: null })
    }, timeoutMs)

    pendingRequests.set(requestId, {
      resolve: (data) => {
        clearTimeout(timer)
        resolve(data)
      },
      reject: (err) => {
        clearTimeout(timer)
        reject(err)
      }
    })
  })
}

export function abortChat() {
  post({ type: 'chat:abort' })
}

export async function clearChat() {
  _activeStreamId = null
  post({ type: 'chat:clear' })
}

export async function getChatHistory() {
  if (!worker) return []
  return new Promise((resolve) => {
    pendingRequests.set('history', { resolve, reject: resolve.bind(null, []) })
    post({ type: 'chat:get-history' })
  })
}

export function startAgent({ taskId, instructions, context, toolDefinitions }) {
  post({ type: 'agent:start', taskId, instructions, context, toolDefinitions })
}

export function abortAgent(taskId) {
  post({ type: 'agent:abort', taskId })
}

export function onAgentEvent(taskId, listener) {
  agentListeners.set(taskId, listener)
  return () => agentListeners.delete(taskId)
}

export function destroyWorker() {
  worker?.terminate()
  worker = null
  _activeStreamId = null
  _status = { ready: false, modelPath: null, loading: false, error: null }
}
