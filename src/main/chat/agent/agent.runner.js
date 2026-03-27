import { createJournal } from './journal/journal.schema.js'
import { createJournalTool } from './journal/journal.tool.js'
import { createStallDetector } from './detectors/stall.detector.js'
import { createRepetitionDetector } from './detectors/repetition.detector.js'
import { buildAgentPrompt } from './prompts/system.prompt.js'
import { planningPrompt, journalPrompt, postActionPrompt } from './prompts/iteration.prompts.js'
import { createReadResultTool, storeResult, STORE_THRESHOLD } from './result.store.js'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)

const VERIFY_INTERVAL = 3
const JOURNAL_TOOL_NAME = 'update_journal'
const STALL_GIVE_UP_THRESHOLD = 6

async function* sessionPromptGen(session, userPrompt, functions, signal) {
  const queue = []
  let notify = null
  let done = false
  let finalErr = null

  const enqueue = (event) => {
    queue.push(event)
    if (notify) {
      const r = notify
      notify = null
      r()
    }
  }

  const promptPromise = session
    .prompt(userPrompt, {
      functions: functions && Object.keys(functions).length > 0 ? functions : undefined,
      onTextChunk: (chunk) => enqueue({ type: 'text', content: chunk }),
      signal
    })
    .then(() => {
      done = true
      if (notify) {
        const r = notify
        notify = null
        r()
      }
    })
    .catch((err) => {
      finalErr = err
      done = true
      if (notify) {
        const r = notify
        notify = null
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
        notify = r
      })
    }
  }

  await promptPromise
  if (finalErr && finalErr.name !== 'AbortError' && !signal?.aborted) throw finalErr
}

function buildTools(toolMap, ...extraTools) {
  const tools = new Map(toolMap)
  for (const tool of extraTools) {
    tools.set(tool.definition.name, { definition: tool.definition, execute: tool.execute() })
  }
  return {
    definitions: [...tools.values()].map((t) => t.definition),
    execute: async (name, args, { signal } = {}) => {
      const tool = tools.get(name)
      if (!tool) throw new Error(`Unknown tool: ${name}`)
      return tool.execute(args, { signal })
    }
  }
}

function withResultStore(tools, taskId) {
  const readResultTool = createReadResultTool(taskId)
  return {
    definitions: [...tools.definitions, readResultTool.definition],
    execute: async (name, args, opts) => {
      if (name === readResultTool.definition.name) return readResultTool.execute()(args, opts)
      const output = await tools.execute(name, args, opts)
      const serialized = typeof output === 'string' ? output : JSON.stringify(output)
      if (serialized.length > STORE_THRESHOLD) {
        const resultId = storeResult(taskId, serialized)
        const preview = serialized.slice(0, 800)
        return (
          `[Result stored — tool: ${name}, size: ${Math.ceil(serialized.length / 1000)}k chars, id: ${resultId}]\n` +
          `Preview:\n${preview}${serialized.length > 800 ? '…' : ''}\n\n` +
          `Call read_result("${resultId}") to read in 20k-char chunks.`
        )
      }
      return serialized
    }
  }
}

function summarizeResult(result) {
  if (!result) return 'no result'
  if (typeof result === 'string') return result.slice(0, 100)
  if (result.error) return `error: ${result.error}`
  if (result.exitCode !== undefined)
    return result.exitCode === 0 ? 'success' : `exit ${result.exitCode}`
  return 'completed'
}

function selectPrompt(state, journal) {
  const { planningComplete, lastToolName, lastToolResult, actionsSincePlan } = state
  if (!planningComplete) return planningPrompt(journal)
  const shouldVerify =
    lastToolName && actionsSincePlan > 0 && actionsSincePlan % VERIFY_INTERVAL === 0
  if (shouldVerify) return postActionPrompt(lastToolName, summarizeResult(lastToolResult))
  return journalPrompt(journal)
}

function updatePlanningState(state, journal) {
  if (!state.planningComplete && journal.currentPlan) {
    state.planningComplete = true
    state.actionsSincePlan = 0
    return true
  }
  if (state.planningComplete && state.lastToolName && state.lastToolName !== JOURNAL_TOOL_NAME) {
    state.actionsSincePlan++
  }
  return false
}

function buildSessionFunctions(tools, _taskId, signal, onCall, onResult) {
  const { z } = require('zod')
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
        for (const [key, s] of Object.entries(schema.properties)) {
          const t = jsonSchemaToZod(s)
          shape[key] = required.has(key) ? t : t.optional()
        }
        return z.object(shape)
      }
      default:
        return z.unknown()
    }
  }

  const functions = {}
  for (const def of tools.definitions) {
    const safeName = def.name.replace(/[^a-zA-Z0-9_]/g, '_')
    functions[safeName] = {
      description: def.description,
      params: jsonSchemaToZod(def.parameters),
      handler: async (args) => {
        if (signal?.aborted) throw new Error('Aborted')
        onCall?.(def.name, args)
        let output
        try {
          output = await tools.execute(def.name, args, { signal })
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

export async function runAgentLocal({
  taskId,
  session,
  instructions,
  context,
  toolDefinitions,
  executeToolFn,
  signal,
  emit
}) {
  const journal = createJournal()
  const stallDetector = createStallDetector()
  const repetitionDetector = createRepetitionDetector()

  const systemPrompt = buildAgentPrompt(instructions, context)

  const toolMap = new Map(
    toolDefinitions.map((def) => [
      def.name,
      {
        definition: def,
        execute: async (args, opts) => executeToolFn(def.name, args, taskId, opts?.signal)
      }
    ])
  )

  const journalTool = createJournalTool(journal, (j) =>
    emit({ type: 'journal_update', journal: j })
  )
  const tools = withResultStore(buildTools(toolMap, journalTool), taskId)

  const state = {
    planningComplete: false,
    actionsSincePlan: 0,
    lastToolName: null,
    lastToolResult: null,
    lastArgs: null
  }

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: instructions }
  ]

  let pendingCorrection = null

  while (true) {
    if (signal?.aborted) throw new Error('Task cancelled')

    let iterationPrompt = selectPrompt(state, journal)
    if (pendingCorrection) {
      iterationPrompt = pendingCorrection + '\n\n' + iterationPrompt
      pendingCorrection = null
    }

    const iterationToolDefs = state.planningComplete ? tools.definitions : [journalTool.definition]
    const iterationTools = {
      definitions: iterationToolDefs,
      execute: tools.execute,
      functions: buildSessionFunctions(
        { definitions: iterationToolDefs, execute: tools.execute },
        taskId,
        signal,
        (name, args) => {
          state.lastToolName = name
          state.lastArgs = args
          emit({ type: 'tool_call', name, args })
        },
        (name, result) => {
          state.lastToolResult = result
          if (name !== JOURNAL_TOOL_NAME) repetitionDetector.record(name, state.lastArgs, result)
          emit({ type: 'tool_result', name, result })
        }
      )
    }

    let pendingThought = ''

    for await (const event of sessionPromptGen(
      session,
      iterationPrompt,
      iterationTools.functions,
      signal
    )) {
      switch (event.type) {
        case 'text':
          pendingThought += event.content
          emit({ type: 'text', content: event.content })
          break
        case 'usage':
          emit(event)
          break
      }
    }

    if (pendingThought.trim()) {
      emit({ type: 'thought', content: pendingThought.trim() })
    }

    messages.push({ role: 'user', content: iterationPrompt })

    const repetition = repetitionDetector.detectRepetition()
    if (repetition) {
      if (repetition.type === 'same_failing_action') break
      pendingCorrection = repetition.message
    }

    updatePlanningState(state, journal)

    if (journal.done) break

    const { stalledFor, nudge } = stallDetector.check(journal, state.planningComplete)
    if (stalledFor >= STALL_GIVE_UP_THRESHOLD) break
    if (nudge) pendingCorrection = (pendingCorrection ? pendingCorrection + '\n\n' : '') + nudge
  }

  const summary = journal.doneReason || journal.completed.at(-1) || journal.understanding || ''
  return { summary, done: journal.done }
}
