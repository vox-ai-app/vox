import { getBaseUrl, isReady } from './server.js'
import { getSetting, TEMPERATURE, MAX_TOKENS } from '../../config/settings.js'

export async function chatCompletion({
  messages,
  tools,
  toolChoice,
  stream = true,
  temperature,
  maxTokens,
  signal
} = {}) {
  if (!isReady()) throw new Error('LLM server not ready')

  const resolvedTemperature = temperature ?? getSetting(TEMPERATURE.key) ?? TEMPERATURE.default
  const resolvedMaxTokens = maxTokens ?? getSetting(MAX_TOKENS.key) ?? MAX_TOKENS.default

  const body = {
    model: 'local',
    messages,
    stream,
    temperature: resolvedTemperature,
    max_tokens: resolvedMaxTokens
  }

  if (tools?.length > 0) {
    body.tools = tools.map((t) => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description || '',
        parameters: t.parameters || { type: 'object', properties: {} }
      }
    }))
    body.tool_choice = toolChoice || 'auto'
  }

  const resp = await fetch(`${getBaseUrl()}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal
  })

  if (!resp.ok) {
    const text = await resp.text().catch(() => '')
    throw new Error(`LLM server error ${resp.status}: ${text}`)
  }

  if (!stream) return resp.json()

  return parseSSEStream(resp.body, signal)
}

async function* parseSSEStream(body, signal) {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      if (signal?.aborted) break
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || !trimmed.startsWith('data: ')) continue
        const payload = trimmed.slice(6)
        if (payload === '[DONE]') return
        try {
          yield JSON.parse(payload)
        } catch {
          // malformed SSE chunk
        }
      }
    }
  } finally {
    reader.releaseLock()
  }
}

export async function* streamChat({
  messages,
  tools,
  toolChoice,
  temperature,
  maxTokens,
  signal
} = {}) {
  const chunks = await chatCompletion({
    messages,
    tools,
    toolChoice,
    stream: true,
    temperature,
    maxTokens,
    signal
  })

  let pendingToolCalls = new Map()

  for await (const chunk of chunks) {
    if (signal?.aborted) break

    const choice = chunk.choices?.[0]
    if (!choice) continue

    const delta = choice.delta
    if (!delta) continue

    if (delta.content) {
      yield { type: 'text', content: delta.content }
    }

    if (delta.tool_calls) {
      for (const tc of delta.tool_calls) {
        const idx = tc.index ?? 0
        if (!pendingToolCalls.has(idx)) {
          pendingToolCalls.set(idx, { id: tc.id || '', name: '', arguments: '' })
        }
        const pending = pendingToolCalls.get(idx)
        if (tc.id) pending.id = tc.id
        if (tc.function?.name) pending.name += tc.function.name
        if (tc.function?.arguments) pending.arguments += tc.function.arguments
      }
    }

    if (choice.finish_reason === 'tool_calls' || choice.finish_reason === 'stop') {
      if (pendingToolCalls.size > 0) {
        for (const [, tc] of pendingToolCalls) {
          let args = {}
          try {
            args = JSON.parse(tc.arguments)
          } catch {
            args = {}
          }
          yield { type: 'tool_call', id: tc.id, name: tc.name, args }
        }
        pendingToolCalls = new Map()
      }
      if (choice.finish_reason === 'stop') {
        yield { type: 'done' }
      }
    }
  }

  if (pendingToolCalls.size > 0) {
    for (const [, tc] of pendingToolCalls) {
      let args = {}
      try {
        args = JSON.parse(tc.arguments)
      } catch {
        args = {}
      }
      yield { type: 'tool_call', id: tc.id, name: tc.name, args }
    }
  }
}

export async function nonStreamChat({ messages, tools, temperature, maxTokens, signal } = {}) {
  const result = await chatCompletion({
    messages,
    tools,
    stream: false,
    temperature,
    maxTokens,
    signal
  })

  const choice = result.choices?.[0]
  if (!choice) return { text: '', toolCalls: [] }

  const text = choice.message?.content || ''
  const toolCalls = (choice.message?.tool_calls || []).map((tc) => {
    let args = {}
    try {
      args =
        typeof tc.function.arguments === 'string'
          ? JSON.parse(tc.function.arguments)
          : tc.function.arguments || {}
    } catch {
      args = {}
    }
    return { id: tc.id, name: tc.function.name, args }
  })

  return { text, toolCalls, finishReason: choice.finish_reason }
}

export async function healthCheck() {
  try {
    const resp = await fetch(`${getBaseUrl()}/health`, { signal: AbortSignal.timeout(3000) })
    if (!resp.ok) return false
    const body = await resp.json()
    return body.status === 'ok'
  } catch {
    return false
  }
}
