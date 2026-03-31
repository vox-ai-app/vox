import { parentPort } from 'worker_threads'
import { randomUUID } from 'crypto'
import { sessionPromptGen, jsonSchemaToZod } from './session.utils.js'
import { CONTEXT_SIZE, SUMMARIZE_CONTEXT_SIZE, MAX_CONCURRENT_AGENTS } from './config.js'

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

  for (const [, agent] of agents) {
    agent.controller.abort()
  }
  agents.clear()

  try {
    await chat.context?.dispose()
  } catch {
    /* context may already be disposed */
  }
  chat.context = null
  chat.session = null
  chat.controller = null

  try {
    await model?.dispose()
  } catch {
    /* model may already be disposed */
  }
  model = null

  await init(modelPath)
}

const ELECTRON_TOOLS = new Set([
  'pick_file',
  'get_file_path',
  'pick_directory',
  'spawn_task',
  'get_task',
  'search_tasks'
])

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
          output = await Promise.race([
            executeTool(def.name, args, taskId, signal),
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error(`Tool ${def.name} timed out after 60s`)), 60_000)
            )
          ])
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

async function handleChatPrewarm() {
  if (!model || chat.context) {
    post({ type: 'prewarm:done' })
    return
  }
  try {
    chat.context = await model.createContext({ contextSize: CONTEXT_SIZE })
  } catch (err) {
    console.warn('[llm.worker] Prewarm failed:', err.message)
  }
  post({ type: 'prewarm:done' })
}

async function ensureChatSession(systemPrompt, history) {
  if (chat.session) return chat.session

  const LlamaChatSession = globalThis._LlamaChatSession
  if (!chat.context) {
    chat.context = await model.createContext({ contextSize: CONTEXT_SIZE })
  }
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
      } catch (err) {
        console.warn('[llm.worker] Failed to set chat history:', err.message)
      }
    }
  }

  return chat.session
}

async function handleChatSend({ requestId, message, systemPrompt, history, toolDefinitions = [] }) {
  if (!model) {
    postChatEvent(requestId, { type: 'error', message: 'Model not loaded' })
    return
  }

  if (chat.controller) {
    chat.controller.abort()
    chat.session = null
  }
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
  } catch {
    /* context may already be disposed */
  }
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

  if (agents.size >= MAX_CONCURRENT_AGENTS) {
    postAgentEvent(taskId, {
      type: 'task.status',
      status: 'failed',
      message: 'Max concurrent agents reached'
    })
    return
  }

  const controller = new AbortController()
  const LlamaChatSession = globalThis._LlamaChatSession

  const { runAgentLocal, buildAgentPrompt, fetchPastContext, fetchKnowledgePatterns } =
    await import('../chat/agent/agent.runner.js')
  const [pastContext, knowledgePatterns] = await Promise.all([
    fetchPastContext(instructions).catch(() => null),
    fetchKnowledgePatterns(instructions).catch(() => null)
  ])
  const systemPrompt = buildAgentPrompt(instructions, context, pastContext, knowledgePatterns)

  const agentContext = await model.createContext({ contextSize: Math.floor(CONTEXT_SIZE / 2) })
  const agentSession = new LlamaChatSession({
    contextSequence: agentContext.getSequence(),
    systemPrompt
  })

  agents.set(taskId, { context: agentContext, session: agentSession, controller })

  postAgentEvent(taskId, { type: 'task.status', status: 'running' })

  runAgentLocal({
    taskId,
    session: agentSession,
    instructions,
    context,
    toolDefinitions,
    executeToolFn: (name, args, tid, signal) => executeTool(name, args, tid, signal),
    signal: controller.signal,
    emit: (event) => postAgentEvent(taskId, event),
    summarize: (text, prefix) => summarizeText(text, prefix)
  })
    .then(async ({ summary, done, journal }) => {
      if (journal) {
        const { recordBlockerPatterns } = await import('../chat/agent/agent.runner.js')
        await recordBlockerPatterns(journal).catch(() => {})
      }
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
        } catch {
          /* context may already be disposed */
        }
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
  const ctx = await model.createContext({ contextSize: SUMMARIZE_CONTEXT_SIZE })
  const sess = new LlamaChatSession({ contextSequence: ctx.getSequence() })
  try {
    return await sess.prompt(`${promptPrefix}\n\n${text}`)
  } finally {
    try {
      await ctx.dispose()
    } catch {
      /* context may already be disposed */
    }
  }
}

parentPort.on('message', async (msg) => {
  switch (msg.type) {
    case 'init':
      return init(msg.modelPath)
    case 'reload':
      return reload(msg.modelPath)
    case 'chat:prewarm':
      return handleChatPrewarm()
    case 'chat:send':
      return handleChatSend(msg)
    case 'chat:abort':
      if (chat.controller) {
        chat.controller.abort()
        chat.session = null
      }
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
    case 'ping':
      return post({ type: 'pong' })
    case 'summarize': {
      try {
        const result = await summarizeText(msg.text, msg.promptPrefix || 'Summarize:')
        post({ type: 'summarize:result', requestId: msg.requestId, result })
      } catch (err) {
        post({ type: 'summarize:result', requestId: msg.requestId, result: msg.text })
        console.warn('[llm.worker] Summarize failed:', err.message)
      }
      return
    }
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
