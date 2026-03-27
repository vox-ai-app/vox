const CONTEXT_SIZE = 32768
const DEFAULT_THRESHOLD = Math.floor(CONTEXT_SIZE * 3.5 * 0.6)
const DEFAULT_KEEP_RECENT = Math.floor(DEFAULT_THRESHOLD * 0.5)
const SUMMARY_CHUNK_LIMIT = Math.floor(CONTEXT_SIZE * 4 * 0.8)

function messageChars(msg) {
  let chars = 0
  if (typeof msg.content === 'string') chars += msg.content.length
  else if (Array.isArray(msg.content)) chars += JSON.stringify(msg.content).length
  if (msg.toolCalls?.length) {
    for (const tc of msg.toolCalls) {
      chars += (tc.name?.length || 0) + JSON.stringify(tc.args || {}).length
    }
  }
  return chars
}

function totalChars(messages) {
  return messages.reduce((sum, m) => sum + messageChars(m), 0)
}

function formatForSummary(messages) {
  return messages
    .map((m) => {
      if (m.role === 'tool') {
        return `tool(${m.name}): ${typeof m.content === 'string' ? m.content : JSON.stringify(m.content)}`
      }
      if (m.role === 'assistant' && m.toolCalls?.length) {
        const calls = m.toolCalls.map((tc) => tc.name).join(', ')
        const text = m.content || ''
        return `assistant: ${text}${text ? ' ' : ''}[called: ${calls}]`
      }
      if (m.role === 'user' || m.role === 'assistant') {
        return `${m.role}: ${typeof m.content === 'string' ? m.content : JSON.stringify(m.content)}`
      }
      return null
    })
    .filter(Boolean)
    .join('\n')
}

function splitIntoChunks(messages, charLimit) {
  const chunks = []
  let i = 0
  while (i < messages.length) {
    let j = i
    let chars = 0
    while (j < messages.length) {
      const next = formatForSummary([messages[j]]).length
      if (chars + next > charLimit && j > i) break
      chars += next
      j++
    }
    while (j > i + 1) {
      const msg = messages[j - 1]
      if (msg.role === 'tool' || (msg.role === 'assistant' && msg.toolCalls?.length)) j--
      else break
    }
    chunks.push(messages.slice(i, j))
    i = j
  }
  return chunks
}

export async function summarizeIfNeeded(messages, opts = {}) {
  const {
    threshold = DEFAULT_THRESHOLD,
    keepRecentChars = DEFAULT_KEEP_RECENT,
    promptPrefix = 'Summarize this conversation concisely. Preserve key facts, decisions, and any context needed to continue naturally:',
    summaryLabel = 'Summary of earlier conversation',
    summarize
  } = opts

  if (totalChars(messages) <= threshold) return messages

  const system = messages[0]

  let splitAt = messages.length - 1
  let recentChars = 0
  while (splitAt > 1 && recentChars < keepRecentChars) {
    recentChars += messageChars(messages[splitAt])
    splitAt--
  }
  while (splitAt > 1) {
    const msg = messages[splitAt]
    if (msg.role === 'tool' || (msg.role === 'assistant' && msg.toolCalls?.length)) splitAt--
    else break
  }

  const old = messages.slice(1, splitAt)
  const recent = messages.slice(splitAt)
  const formattedOld = formatForSummary(old)

  let summary
  if (formattedOld.length <= SUMMARY_CHUNK_LIMIT) {
    summary = await summarize(formattedOld, promptPrefix)
  } else {
    const chunks = splitIntoChunks(old, SUMMARY_CHUNK_LIMIT)
    const parts = []
    for (let i = 0; i < chunks.length; i++) {
      parts.push(
        await summarize(
          formatForSummary(chunks[i]),
          `${promptPrefix} (Part ${i + 1} of ${chunks.length})`
        )
      )
    }
    summary = parts.join('\n\n---\n\n')
  }

  return [system, { role: 'assistant', content: `[${summaryLabel}]\n${summary}` }, ...recent]
}
