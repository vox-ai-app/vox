import { parentPort } from 'worker_threads'
import { randomUUID } from 'crypto'
import { z } from 'zod'

let llama = null
let model = null
const chat = { context: null, session: null, controller: null }
const agents = new Map()
const pendingTools = new Map()

async function init(modelPath) {
  try {
    const { getLlama, LlamaChatSession } = await import('node-llama-cpp')
    llama = await getLlama()
    model = await llama.loadModel({ modelPath })
    globalThis._LlamaChatSession = LlamaChatSession
    post({ type: 'ready' })
  } catch (err) {
    post({ type: 'load-error', message: err.message })
  }
}

async function reload(modelPath) {
  chat.controller?.abort()

  for (const [taskId, agent] of agents) {
    agent.controller.abort()
    agents.delete(taskId)
  }

  try {
    await chat.context?.dispose()
    // eslint-disable-next-line no-empty
  } catch {}
  chat.context = null
  chat.session = null
  chat.controller = null

  try {
    await model?.dispose()
    // eslint-disable-next-line no-empty
  } catch {}
  model = null

  await init(modelPath)
}

function jsonSchemaToZod(schema) {
  if (!schema) return z.unknown()
  switch (schema.type) {
    case 'string':
      return z.string()
    case 'number':
    case 'integer':
      return z.number()
    case 'boolean':
      return z.boolean()
    case 'array':
      return z.array(schema.items ? jsonSchemaToZod(schema.items) : z.unknown())
    case 'object': {
      if (!schema.properties) return z.record(z.unknown())
      const required = new Set(schema.required || [])
      const shape = {}
      for (const [key, propSchema] of Object.entries(schema.properties)) {
        const t = jsonSchemaToZod(propSchema)
        shape[key] = required.has(key) ? t : t.optional()
      }
      return z.object(shape)
    }
    default:
      return z.unknown()
  }
}

const ELECTRON_TOOLS = new Set(['pick_file', 'get_file_path', 'pick_directory', 'spawn_task'])

async function executeToolRemote(name, args, taskId = null) {
  const callId = randomUUID()
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingTools.delete(callId)
      reject(new Error(`Tool ${name} timed out after 60s`))
    }, 60_000)

    pendingTools.set(callId, { resolve, reject, timer })
    post({ type: 'tool:execute', callId, taskId, name, args })
  })
}

let _toolRegistry = null
async function getToolRegistry() {
  if (_toolRegistry) return _toolRegistry
  const { ALL_TOOLS } = await import('@vox-ai-app/tools')
  const { ALL_INTEGRATION_TOOLS } = await import('@vox-ai-app/integrations')

  _toolRegistry = new Map()

  for (const tool of ALL_TOOLS) {
    _toolRegistry.set(tool.definition.name, {
      definition: tool.definition,
      execute: tool.execute(null)
    })
  }
  for (const tool of ALL_INTEGRATION_TOOLS) {
    _toolRegistry.set(tool.definition.name, {
      definition: tool.definition,
      execute: tool.execute(null)
    })
  }
  return _toolRegistry
}

export async function executeTool(name, args, taskId = null, signal = null) {
  if (ELECTRON_TOOLS.has(name)) {
    return executeToolRemote(name, args, taskId)
  }

  try {
    const registry = await getToolRegistry()
    const tool = registry.get(name)
    if (!tool) {
      return executeToolRemote(name, args, taskId)
    }

    return await tool.execute(args, { signal })
  } catch (err) {
    return { error: err.message }
  }
}

function buildFunctions(toolDefinitions, taskId, onCall, onResult, signal) {
  const functions = {}
  for (const def of toolDefinitions) {
    const safeName = def.name.replace(/[^a-zA-Z0-9_]/g, '_')
    functions[safeName] = {
      description: def.description,
      params: jsonSchemaToZod(def.parameters),
      handler: async (args) => {
        if (signal?.aborted) throw new Error('Aborted')
        onCall?.(def.name, args)
        let output
        try {
          output = await executeTool(def.name, args, taskId, signal)
        } catch (err) {
          output = { error: err.message }
        }
        const serialized = typeof output === 'string' ? output : JSON.stringify(output)
        onResult?.(def.name, serialized)
        return serialized
      }
    }
  }
  return functions
}

async function* sessionPromptGen(session, userPrompt, functions, signal) {
  const queue = []
  let resolve = null
  let done = false
  let finalError = null

  const enqueue = (event) => {
    queue.push(event)
    if (resolve) {
      const r = resolve
      resolve = null
      r()
    }
  }

  const promptPromise = session
    .prompt(userPrompt, {
      functions: Object.keys(functions).length > 0 ? functions : undefined,
      onTextChunk: (chunk) => enqueue({ type: 'text', content: chunk }),
      signal
    })
    .then(() => {
      done = true
      if (resolve) {
        const r = resolve
        resolve = null
        r()
      }
    })
    .catch((err) => {
      finalError = err
      done = true
      if (resolve) {
        const r = resolve
        resolve = null
        r()
      }
    })

  while (true) {
    if (queue.length > 0) {
      yield queue.shift()
    } else if (done) {
      break
    } else {
      await new Promise((r) => {
        resolve = r
      })
    }
  }

  await promptPromise
  if (finalError && finalError.name !== 'AbortError' && !signal?.aborted) {
    throw finalError
  }
}

async function ensureChatSession(systemPrompt, history) {
  if (chat.session) return chat.session

  const LlamaChatSession = globalThis._LlamaChatSession
  chat.context = await model.createContext({ contextSize: 32768 })
  chat.session = new LlamaChatSession({
    contextSequence: chat.context.getSequence(),
    systemPrompt
  })

  if (history?.length > 0) {
    const chatHistory = history
      .map((msg) => {
        if (msg.role === 'user') return { type: 'user', text: msg.content }
        if (msg.role === 'assistant')
          return { type: 'model', response: [{ type: 'text', text: msg.content }] }
        return null
      })
      .filter(Boolean)

    if (chatHistory.length > 0) {
      try {
        await chat.session.setChatHistory(chatHistory)
        // eslint-disable-next-line no-empty
      } catch {}
    }
  }

  return chat.session
}

async function handleChatSend({ requestId, message, systemPrompt, history, toolDefinitions = [] }) {
  if (!model) {
    postChatEvent(requestId, { type: 'error', message: 'Model not loaded' })
    return
  }

  chat.controller?.abort()
  const controller = new AbortController()
  chat.controller = controller
  const signal = controller.signal

  const emit = (event) => {
    if (!signal.aborted) postChatEvent(requestId, event)
  }

  emit({ type: 'chunk_start', streamId: requestId })

  try {
    const session = await ensureChatSession(systemPrompt, history)

    const functions = buildFunctions(
      toolDefinitions,
      null,
      (name, args) => emit({ type: 'tool_call', name, args }),
      (name, result) => emit({ type: 'tool_result', name, result }),
      signal
    )

    let finalText = ''
    for await (const event of sessionPromptGen(session, message, functions, signal)) {
      if (event.type === 'text') finalText += event.content
      emit(event)
    }

    const updatedHistory = await getChatHistoryRaw(session)
    emit({ type: 'chunk_end', streamId: requestId, finalText, history: updatedHistory })
  } catch (err) {
    if (signal.aborted) {
      emit({ type: 'abort_initiated' })
    } else {
      emit({ type: 'error', message: err.message })
    }
  } finally {
    if (chat.controller === controller) chat.controller = null
  }
}

async function handleChatClear() {
  chat.controller?.abort()
  try {
    await chat.context?.dispose()
    // eslint-disable-next-line no-empty
  } catch {}
  chat.context = null
  chat.session = null
  chat.controller = null
}

async function handleGetHistory() {
  if (!chat.session) {
    post({ type: 'history', history: [] })
    return
  }
  const history = await getChatHistoryRaw(chat.session)
  post({ type: 'history', history })
}

async function getChatHistoryRaw(session) {
  try {
    const raw = await session.getChatHistory()
    return raw
      .map((item) => {
        if (item.type === 'user') return { role: 'user', content: item.text ?? '' }
        if (item.type === 'model')
          return {
            role: 'assistant',
            content: Array.isArray(item.response)
              ? item.response.map((r) => r.text ?? '').join('')
              : (item.response ?? '')
          }
        if (item.type === 'system') return { role: 'system', content: item.text ?? '' }
        return null
      })
      .filter(Boolean)
  } catch {
    return []
  }
}

async function handleAgentStart({ taskId, instructions, context, toolDefinitions = [] }) {
  if (!model) {
    postAgentEvent(taskId, { type: 'task.status', status: 'failed', message: 'Model not loaded' })
    return
  }

  if (agents.size >= 2) {
    postAgentEvent(taskId, {
      type: 'task.status',
      status: 'failed',
      message: 'Max concurrent agents reached'
    })
    return
  }

  const controller = new AbortController()
  const LlamaChatSession = globalThis._LlamaChatSession

  const agentContext = await model.createContext({ contextSize: 32768 })
  const agentSession = new LlamaChatSession({
    contextSequence: agentContext.getSequence()
  })

  agents.set(taskId, { context: agentContext, session: agentSession, controller })

  postAgentEvent(taskId, { type: 'task.status', status: 'running' })

  const { runAgentLocal } = await import('../chat/agent/agent.runner.js')

  runAgentLocal({
    taskId,
    session: agentSession,
    instructions,
    context,
    toolDefinitions,
    executeToolFn: (name, args, tid, signal) => executeTool(name, args, tid, signal),
    signal: controller.signal,
    emit: (event) => postAgentEvent(taskId, event)
  })
    .then(({ summary, done }) => {
      postAgentEvent(taskId, {
        type: 'task.status',
        status: done ? 'completed' : 'incomplete',
        result: summary
      })
    })
    .catch((err) => {
      const status = controller.signal.aborted ? 'aborted' : 'failed'
      postAgentEvent(taskId, { type: 'task.status', status, message: err.message })
    })
    .finally(async () => {
      const agent = agents.get(taskId)
      if (agent) {
        try {
          await agent.context.dispose()
          // eslint-disable-next-line no-empty
        } catch {}
        agents.delete(taskId)
      }
    })
}

function handleAgentAbort({ taskId }) {
  agents.get(taskId)?.controller.abort()
}

function handleToolResult({ callId, result, error }) {
  const pending = pendingTools.get(callId)
  if (!pending) return
  clearTimeout(pending.timer)
  pendingTools.delete(callId)
  if (error) pending.reject(new Error(error))
  else pending.resolve(result)
}

export async function summarizeText(text, promptPrefix) {
  if (!model) return text
  const LlamaChatSession = globalThis._LlamaChatSession
  const ctx = await model.createContext({ contextSize: 4096 })
  const sess = new LlamaChatSession({ contextSequence: ctx.getSequence() })
  try {
    return await sess.prompt(`${promptPrefix}\n\n${text}`)
  } finally {
    await ctx.dispose()
  }
}

parentPort.on('message', async (msg) => {
  switch (msg.type) {
    case 'init':
      return init(msg.modelPath)
    case 'reload':
      return reload(msg.modelPath)
    case 'chat:send':
      return handleChatSend(msg)
    case 'chat:abort':
      chat.controller?.abort()
      break
    case 'chat:clear':
      return handleChatClear()
    case 'chat:get-history':
      return handleGetHistory()
    case 'agent:start':
      return handleAgentStart(msg)
    case 'agent:abort':
      return handleAgentAbort(msg)
    case 'tool:result':
      return handleToolResult(msg)
    default:
      console.warn('[llm.worker] Unknown message type:', msg.type)
  }
})

function post(msg) {
  parentPort.postMessage(msg)
}
function postChatEvent(requestId, event) {
  post({ type: 'chat:event', requestId, event })
}
function postAgentEvent(taskId, event) {
  post({ type: 'agent:event', taskId, event })
}
