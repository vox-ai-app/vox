import { validateToolResult, buildValidationPrompt } from './detectors/index.js'
import { canParallelize, executeToolsParallel } from './agent.util.js'
import { summarizeIfNeeded } from './summarize.js'

const MAX_CONTEXT_RETRIES = 2
const CONTEXT_SIZE = 32768
const CHAR_THRESHOLD = Math.floor(CONTEXT_SIZE * 3.5 * 0.6)
const CHAR_KEEP_RECENT = Math.floor(CHAR_THRESHOLD * 0.5)
const CHAR_WARN_AT = Math.floor(CHAR_THRESHOLD * 0.9)

function isContextLengthError(err) {
  return /context|token|length|exceed/i.test(err?.message || '')
}

export async function* agentLoop(sessionPromptGen, session, userPrompt, messages, tools, options) {
  let totalInput = 0
  let totalOutput = 0

  const summarize = options.summarize
  const summarizeOpts = {
    promptPrefix:
      'Summarize this task execution history concisely. Preserve key findings, decisions, tool outputs, and any context needed to continue the task:',
    summaryLabel: 'Summary of earlier work',
    summarize
  }

  let textContent = ''
  let toolCalls = null
  let contextRetries = 0

  while (true) {
    textContent = ''
    toolCalls = null

    try {
      for await (const event of sessionPromptGen(
        session,
        userPrompt,
        tools.functions,
        options.signal
      )) {
        if (event.type === 'text') {
          textContent += event.content
          yield event
        } else if (event.type === 'tool_calls') {
          toolCalls = event.calls
        } else if (event.type === 'usage') {
          totalInput += event.inputTokens || 0
          totalOutput += event.outputTokens || 0
        }
      }
      break
    } catch (err) {
      if (isContextLengthError(err) && contextRetries < MAX_CONTEXT_RETRIES) {
        contextRetries++
        textContent = ''
        toolCalls = null
        const condensed = await summarizeIfNeeded(messages, {
          threshold: 0,
          keepRecentChars: Math.floor(CHAR_KEEP_RECENT * 0.3),
          ...summarizeOpts
        }).catch(() => messages)
        messages.splice(0, messages.length, ...condensed)
        continue
      }
      throw err
    }
  }

  if (toolCalls?.length) {
    messages.push({ role: 'assistant', content: textContent || null, toolCalls })

    let results
    const validationWarnings = []

    if (canParallelize(toolCalls, tools.definitions)) {
      for (const call of toolCalls) {
        yield { type: 'tool_call', name: call.name, args: call.args }
      }
      results = await executeToolsParallel(toolCalls, tools.execute, options.signal)
    } else {
      results = []
      for (const call of toolCalls) {
        if (options.signal?.aborted) break
        yield { type: 'tool_call', name: call.name, args: call.args }
        let output
        try {
          output = await tools.execute(call.name, call.args, { signal: options.signal })
        } catch (err) {
          output = { error: err.message }
        }
        results.push({ call, output })
      }
    }

    for (const { call, output } of results) {
      const serialized = typeof output === 'string' ? output : JSON.stringify(output)
      yield { type: 'tool_result', name: call.name, result: serialized }
      messages.push({ role: 'tool', toolCallId: call.id, name: call.name, content: serialized })

      const warnings = validateToolResult(call.name, output)
      if (warnings.length) {
        const prompt = buildValidationPrompt(call.name, warnings)
        if (prompt) validationWarnings.push(prompt)
      }
    }

    if (validationWarnings.length) {
      messages.push({ role: 'user', content: validationWarnings.join('\n\n') })
      yield { type: 'validation_warning', warnings: validationWarnings }
    }

    const totalLen = messages.reduce((n, m) => {
      let c = typeof m.content === 'string' ? m.content.length : 0
      if (m.toolCalls?.length)
        for (const tc of m.toolCalls) c += JSON.stringify(tc.args || {}).length
      return n + c
    }, 0)

    if (totalLen > CHAR_WARN_AT) options.onSummarizing?.()
    const condensed = await summarizeIfNeeded(messages, {
      threshold: CHAR_THRESHOLD,
      keepRecentChars: CHAR_KEEP_RECENT,
      ...summarizeOpts
    }).catch(() => messages)
    messages.splice(0, messages.length, ...condensed)
    return
  }

  if (textContent) {
    messages.push({ role: 'assistant', content: textContent })
  } else if (messages.length > 0 && messages[messages.length - 1].role === 'tool') {
    messages.push({
      role: 'user',
      content:
        'You just completed a tool action but did not respond. Always acknowledge the outcome to the user — whether it succeeded or failed — in a brief spoken sentence.'
    })
    return
  }

  if (totalInput || totalOutput) {
    yield { type: 'usage', inputTokens: totalInput, outputTokens: totalOutput }
  }
}
