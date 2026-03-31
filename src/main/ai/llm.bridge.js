import { Worker } from 'worker_threads'
import { join } from 'path'
import { randomUUID } from 'crypto'
import { app } from 'electron'
import { emitAll } from '../ipc/shared'
import { logger } from '../logger'
import { CONTEXT_SIZE } from './config.js'

let worker = null
let _status = { ready: false, modelPath: null, loading: false, error: null }
let _shuttingDown = false
const pendingRequests = new Map()
const agentListeners = new Map()

let _activeStreamId = null
let _voiceTextHandler = null
let _voiceEndHandler = null
let _streamBuffer = ''
let _streamFlushTimer = null
const MAX_STREAM_BUFFER = 64 * 1024

function flushStreamBuffer() {
  if (!_streamBuffer || !_activeStreamId) return
  const content = _streamBuffer
  _streamBuffer = ''
  try {
    emitAll('chat:event', {
      type: 'msg:stream-chunk',
      data: { streamId: _activeStreamId, content }
    })
    emitAll('chat:event', {
      type: 'message_chunk',
      data: { streamId: _activeStreamId, content }
    })
  } catch (err) {
    logger.error('[llm.bridge] flushStreamBuffer failed:', err)
  }
}

function scheduleFlush() {
  if (_streamFlushTimer) return
  _streamFlushTimer = setTimeout(() => {
    _streamFlushTimer = null
    flushStreamBuffer()
  }, 16)
}

function resetStreamState() {
  if (_streamFlushTimer) {
    clearTimeout(_streamFlushTimer)
    _streamFlushTimer = null
  }
  _streamBuffer = ''
  _activeStreamId = null
}

let _restartAttempts = 0
let _healthCheckInterval = null
let _missedPongs = 0
const MAX_RESTART_ATTEMPTS = 3
const HEALTH_CHECK_INTERVAL_MS = 30_000

export function setChatStreamHandlers(onText, onEnd) {
  _voiceTextHandler = onText
  _voiceEndHandler = onEnd
}

export function clearChatStreamHandlers() {
  _voiceTextHandler = null
  _voiceEndHandler = null
}

function workerPath() {
  const base = app.getAppPath().replace('app.asar', 'app.asar.unpacked')
  return join(base, 'out/main/llm.worker.js')
}

function spawnWorker() {
  if (worker || _shuttingDown) return

  worker = new Worker(workerPath())
  worker.on('message', handleWorkerMessage)
  worker.on('error', (err) => {
    logger.error('[llm.bridge] Worker error:', err)
    _status = { ready: false, modelPath: _status.modelPath, loading: false, error: err.message }
    emitAll('models:load-error', { message: err.message })
  })
  worker.on('exit', (code) => {
    stopHealthCheck()
    const prevModelPath = _status.modelPath
    worker = null
    _status = {
      ready: false,
      modelPath: prevModelPath,
      loading: false,
      error: code !== 0 ? `Worker exited: ${code}` : null
    }

    if (code !== 0 && !_shuttingDown) {
      logger.warn('[llm.bridge] Worker exited with code', code)

      if (prevModelPath && _restartAttempts < MAX_RESTART_ATTEMPTS) {
        _restartAttempts++
        logger.info(
          `[llm.bridge] Auto-restarting worker (attempt ${_restartAttempts}/${MAX_RESTART_ATTEMPTS})`
        )
        emitAll('models:restarting', { attempt: _restartAttempts })
        setTimeout(() => {
          if (_shuttingDown) return
          loadModel(prevModelPath).catch((err) => {
            logger.error('[llm.bridge] Auto-restart failed:', err)
            emitAll('models:load-error', { message: err.message })
          })
        }, 2000 * _restartAttempts)
      } else if (_restartAttempts >= MAX_RESTART_ATTEMPTS) {
        logger.error('[llm.bridge] Worker failed permanently after max restarts')
        emitAll('models:load-error', {
          message: 'AI worker failed to restart. Please reload the app.'
        })
      }
    }
  })
}

function post(msg) {
  if (_shuttingDown) return
  if (!worker) spawnWorker()
  if (worker) worker.postMessage(msg)
}

function stopHealthCheck() {
  if (_healthCheckInterval) {
    clearInterval(_healthCheckInterval)
    _healthCheckInterval = null
  }
  _missedPongs = 0
}

function startHealthCheck() {
  stopHealthCheck()
  _healthCheckInterval = setInterval(() => {
    if (!worker) {
      stopHealthCheck()
      return
    }
    _missedPongs++
    if (_missedPongs > 3) {
      logger.error('[llm.bridge] Worker health check failed — force terminating')
      stopHealthCheck()
      worker.terminate()
      return
    }
    post({ type: 'ping' })
  }, HEALTH_CHECK_INTERVAL_MS)
}

const KNOWLEDGE_TOOL_NAMES = new Set([
  'list_indexed_files',
  'read_indexed_file',
  'search_indexed_context'
])

const SAFE_MODULES = new Set(['path', 'url', 'querystring', 'crypto', 'util', 'buffer', 'os'])

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
      const key = String(args?.info_key || '').trim()
      if (!key) return JSON.stringify({ error: 'info_key is required' })
      current[key] = args?.info_value ?? ''
      storeSet('vox.user.info', current)
      return JSON.stringify({ saved: true, key })
    }
    case 'spawn_task': {
      const { enqueueTask } = await import('../chat/task.queue.js')
      const { getToolDefinitions } = await import('../chat/chat.session.js')
      const { randomUUID: uuid } = await import('crypto')
      const taskId = uuid()
      enqueueTask({
        taskId,
        instructions: args?.instructions || '',
        context: args?.context || '',
        toolDefinitions: getToolDefinitions()
      })
      return JSON.stringify({ taskId, status: 'spawned' })
    }
    case 'get_task': {
      const { getTaskDetail } = await import('../chat/task.queue.js')
      const detail = getTaskDetail(String(args?.taskId || ''))
      if (!detail) return JSON.stringify({ error: 'Task not found' })
      return JSON.stringify(detail)
    }
    case 'search_tasks': {
      const { listTaskHistory } = await import('../chat/task.queue.js')
      const { searchTasksFts } = await import('../storage/tasks.db.js')
      if (args?.query) {
        const results = searchTasksFts(args.query)
        return JSON.stringify({ tasks: results, has_more: false })
      }
      return JSON.stringify(listTaskHistory({ status: args?.status || null }))
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
          const { getToolSecrets } = await import('../storage/secrets.js')
          const secrets = getToolSecrets(name)
          const headers = { 'Content-Type': 'application/json', ...(custom.webhook_headers || {}) }
          for (const [k, v] of Object.entries(headers)) {
            if (typeof v === 'string' && v.startsWith('secret:')) {
              const secretKey = v.slice(7)
              headers[k] = secrets[secretKey] || v
            }
          }
          const resp = await fetch(custom.webhook_url, {
            method: 'POST',
            headers,
            body: JSON.stringify(args || {})
          })
          return await resp.text()
        }
        if (
          (custom.source_type === 'js_function' || custom.source_type === 'desktop') &&
          custom.source_code
        ) {
          const { createContext, runInContext } = await import('vm')
          const { createRequire } = await import('module')
          const vmRequire = createRequire(import.meta.url)
          const sandboxedRequire = (mod) => {
            if (!SAFE_MODULES.has(mod)) {
              throw new Error(`Module "${mod}" is not allowed in custom tool sandbox`)
            }
            return vmRequire(mod)
          }
          const sandbox = {
            args: args || {},
            require: sandboxedRequire,
            console: { log: () => {}, warn: () => {}, error: () => {} },
            Promise,
            JSON,
            Math,
            Date,
            result: undefined
          }
          createContext(sandbox)
          const wrapped = `(async function(args) { ${custom.source_code} })(args).then(r => { result = r }).catch(e => { result = { error: e.message } })`
          await runInContext(wrapped, sandbox, { timeout: 10_000 })
          const result = sandbox.result
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
      _restartAttempts = 0
      startHealthCheck()
      post({ type: 'chat:prewarm' })
      break

    case 'prewarm:done':
      logger.info('[llm.bridge] Model ready (prewarmed):', _status.modelPath)
      emitAll('models:ready', { path: _status.modelPath })
      break

    case 'pong':
      _missedPongs = 0
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

    case 'summarize:result':
      pendingRequests.get(msg.requestId)?.resolve(msg.result)
      pendingRequests.delete(msg.requestId)
      break

    case 'tool:execute': {
      const { callId, name, args } = msg
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
      if (_voiceTextHandler) _voiceTextHandler(event.content)
      if (_activeStreamId) {
        _streamBuffer += event.content
        if (_streamBuffer.length > MAX_STREAM_BUFFER) {
          flushStreamBuffer()
        } else {
          scheduleFlush()
        }
      }
      break
    }

    case 'chunk_end': {
      if (_streamFlushTimer) {
        clearTimeout(_streamFlushTimer)
        _streamFlushTimer = null
      }
      flushStreamBuffer()
      const streamId = event.streamId || requestId
      emitAll('chat:event', { type: 'chunk_end', streamId, finalText: event.finalText })
      if (_voiceEndHandler) _voiceEndHandler(event.finalText || null)
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
      resetStreamState()
      emitAll('chat:event', { type: 'abort_initiated' })
      if (_voiceEndHandler) _voiceEndHandler(null)
      break

    case 'error':
      resetStreamState()
      emitAll('chat:event', { type: 'error', data: { message: event.message } })
      if (_voiceEndHandler) _voiceEndHandler(null)
      break

    case 'usage': {
      emitAll('chat:event', { type: 'usage', data: event })
      if (event.inputTokens && event.inputTokens > 0) {
        const usageRatio = event.inputTokens / (CONTEXT_SIZE / 4)
        if (usageRatio > 0.7) {
          emitAll('chat:event', {
            type: 'context_warning',
            data: { ratio: usageRatio, message: 'Context window is getting full.' }
          })
        }
      }
      break
    }

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
    const timer = setTimeout(() => {
      worker?.off('message', oneShot)
      reject(new Error('Model load timeout'))
    }, timeoutMs)

    const oneShot = (msg) => {
      if (msg.type === 'ready') {
        clearTimeout(timer)
        worker?.off('message', oneShot)
        resolve()
      } else if (msg.type === 'load-error') {
        clearTimeout(timer)
        worker?.off('message', oneShot)
        reject(new Error(msg.message))
      }
    }
    if (worker) worker.on('message', oneShot)
    else reject(new Error('Worker not available'))
  })
}

export function prewarmChat() {
  if (!worker) return
  post({ type: 'chat:prewarm' })
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
  resetStreamState()
  post({ type: 'chat:clear' })
}

export async function getChatHistory() {
  if (!worker) return []
  return new Promise((resolve) => {
    pendingRequests.set('history', { resolve, reject: () => resolve([]) })
    post({ type: 'chat:get-history' })
  })
}

export function summarizeText(text, promptPrefix) {
  if (!worker) return Promise.resolve(text)
  return new Promise((resolve) => {
    const requestId = randomUUID()
    const timer = setTimeout(() => {
      pendingRequests.delete(requestId)
      resolve(text)
    }, 60_000)
    pendingRequests.set(requestId, {
      resolve: (result) => {
        clearTimeout(timer)
        resolve(result)
      },
      reject: () => {
        clearTimeout(timer)
        resolve(text)
      }
    })
    post({ type: 'summarize', requestId, text, promptPrefix })
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
  _shuttingDown = true
  stopHealthCheck()
  resetStreamState()
  for (const [key, pending] of pendingRequests) {
    pending.reject?.(new Error('Worker destroyed'))
    pendingRequests.delete(key)
  }
  worker?.terminate()
  worker = null
  _status = { ready: false, modelPath: null, loading: false, error: null }
}
