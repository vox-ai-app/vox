import { connectMcpServer } from '@vox-ai-app/mcp'

export function isConnectionError(err) {
  const msg = String(err?.message || '')
  return (
    msg.includes('No active MCP client') ||
    msg.includes('ECONNREFUSED') ||
    msg.includes('process exited') ||
    msg.includes('transport closed') ||
    msg.includes('WebSocket') ||
    msg.includes('fetch failed')
  )
}

export function withTimeout(promise, ms, label) {
  let timer
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} timed out`)), ms)
    })
  ]).finally(() => clearTimeout(timer))
}

export async function callMcpTool(client, toolName, args, timeoutMs, signal, log) {
  let result
  try {
    const callPromise = withTimeout(
      client.callTool({ name: toolName, arguments: args ?? {} }),
      timeoutMs,
      `MCP tool "${toolName}"`
    )
    if (signal) {
      result = await Promise.race([
        callPromise,
        new Promise((_, reject) => {
          if (signal.aborted) {
            reject(new Error('Task aborted'))
            return
          }
          signal.addEventListener('abort', () => reject(new Error('Task aborted')), { once: true })
        })
      ])
    } else {
      result = await callPromise
    }
  } catch (err) {
    const msg = err?.message || String(err)
    log.warn({ toolName, err: msg }, 'registry: MCP callTool error')
    if (isConnectionError(err)) throw err
    return { ok: false, error: msg }
  }
  const content = result?.content
  const text = Array.isArray(content)
    ? content
        .filter((c) => c.type === 'text')
        .map((c) => c.text)
        .join('\n')
    : JSON.stringify(result)
  if (result?.isError) return { ok: false, error: text }
  return { ok: true, result: text }
}

export function makeMcpExecutor(serverId, toolName, getSlot, log) {
  const EXECUTE_TIMEOUT_MS = 30_000
  return async (args, { signal } = {}) => {
    if (signal?.aborted) throw new Error('Task aborted')
    const slot = getSlot(serverId)
    if (!slot) throw new Error(`MCP server ${serverId} is not registered`)
    const timeoutMs =
      Number(args?.timeoutMs || args?.timeout_ms || args?.timeout) || EXECUTE_TIMEOUT_MS
    try {
      return await callMcpTool(slot.client, toolName, args, timeoutMs, signal, log)
    } catch (err) {
      if (!isConnectionError(err)) throw err
      if (!slot.reconnecting) {
        slot.reconnecting = connectMcpServer(slot.server)
          .then(({ client }) => {
            slot.client = client
            slot.reconnecting = null
            log.info({ serverId, toolName }, 'registry: MCP reconnected')
          })
          .catch((e) => {
            slot.reconnecting = null
            throw e
          })
      }
      await slot.reconnecting
      return await callMcpTool(getSlot(serverId).client, toolName, args, timeoutMs, signal, log)
    }
  }
}
