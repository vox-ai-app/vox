import { randomUUID } from 'crypto'
import { createJournal } from './journal/journal.schema.js'
import { createJournalTool } from './journal/journal.tool.js'
import { createStallDetector } from './detectors/stall.detector.js'
import { createRepetitionDetector } from './detectors/repetition.detector.js'
import { validateToolResult, buildValidationPrompt } from './detectors/result.validator.js'
import { buildAgentPrompt } from './prompts/system.prompt.js'
import { planningPrompt, journalPrompt, postActionPrompt } from './prompts/iteration.prompts.js'
import { createReadResultTool, storeResult, STORE_THRESHOLD } from './result.store.js'
import { summarizeIfNeeded } from './summarize.js'
import { sessionPromptGen, jsonSchemaToZod } from '../../ai/session.utils.js'
import { CONTEXT_KEEP_RECENT_CHARS } from '../../ai/config.js'

const VERIFY_INTERVAL = 3
const JOURNAL_TOOL_NAME = 'update_journal'
const STALL_GIVE_UP_THRESHOLD = 6
const MAX_COMPRESSION_ATTEMPTS = 2
const MAX_ITERATIONS = 50

function isContextLengthError(err) {
  return /context|token|length|exceed/i.test(err?.message || '')
}

async function compressSessionHistory(session, summarize) {
  const raw = await session.getChatHistory()
  const messages = raw
    .map((item) => {
      if (item.type === 'user') return { role: 'user', content: item.text ?? '' }
      if (item.type === 'model') {
        return {
          role: 'assistant',
          content: Array.isArray(item.response)
            ? item.response.map((r) => r.text ?? '').join('')
            : String(item.response ?? '')
        }
      }
      if (item.type === 'system') return { role: 'system', content: item.text ?? '' }
      return null
    })
    .filter(Boolean)

  const condensed = await summarizeIfNeeded(messages, {
    threshold: 0,
    keepRecentChars: CONTEXT_KEEP_RECENT_CHARS,
    summarize,
    promptPrefix:
      'Summarize this task execution history concisely. Preserve key findings, decisions, tool outputs, and any context needed to continue the task:',
    summaryLabel: 'Summary of earlier work'
  })

  const llamaHistory = condensed
    .map((m) => {
      if (m.role === 'user') return { type: 'user', text: m.content }
      if (m.role === 'assistant')
        return { type: 'model', response: [{ type: 'text', text: m.content }] }
      if (m.role === 'system') return { type: 'system', text: m.content }
      return null
    })
    .filter(Boolean)

  await session.setChatHistory(llamaHistory)
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

export { buildAgentPrompt, fetchPastContext, fetchKnowledgePatterns, recordBlockerPatterns }

async function fetchPastContext(instructions) {
  try {
    const { searchTasksFts } = await import('../../storage/tasks.db.js')
    const results = searchTasksFts(instructions)
    if (results.length === 0) return null
    return results
      .slice(0, 3)
      .map((t) => `- "${t.instructions}" → ${String(t.result || '').slice(0, 500)}`)
      .join('\n')
  } catch {
    return null
  }
}

async function fetchKnowledgePatterns(instructions) {
  try {
    const { searchKnowledgePatterns } = await import('../../storage/tasks.db.js')
    const results = searchKnowledgePatterns(instructions)
    if (results.length === 0) return null
    return results.map((p) => `- When: "${p.trigger}" → Try: "${p.solution}"`).join('\n')
  } catch {
    return null
  }
}

async function recordBlockerPatterns(journal) {
  if (!journal.done || journal.blockersEncountered.length === 0) return
  try {
    const { insertKnowledgePattern } = await import('../../storage/tasks.db.js')
    const solution = journal.doneReason || journal.completed.at(-1) || ''
    if (!solution) return
    for (const blocker of journal.blockersEncountered) {
      insertKnowledgePattern(randomUUID(), String(blocker).slice(0, 500), solution.slice(0, 500))
    }
  } catch {
    /* pattern recording is best-effort */
  }
}

export async function runAgentLocal({
  taskId,
  session,
  instructions: _instructions,
  context: _context,
  toolDefinitions,
  executeToolFn,
  signal,
  emit,
  summarize
}) {
  const journal = createJournal()
  const stallDetector = createStallDetector()
  const repetitionDetector = createRepetitionDetector()

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

  let pendingCorrection = null
  let compressionAttempts = 0
  let iterations = 0

  while (true) {
    if (signal?.aborted) throw new Error('Task cancelled')
    if (++iterations > MAX_ITERATIONS) {
      emit({ type: 'thought', content: 'Max iterations reached, stopping.' })
      break
    }

    let iterationPrompt = selectPrompt(state, journal)
    if (pendingCorrection) {
      iterationPrompt = pendingCorrection + '\n\n' + iterationPrompt
      pendingCorrection = null
    }

    const iterationToolDefs = state.planningComplete ? tools.definitions : [journalTool.definition]
    const iterationFunctions = buildSessionFunctions(
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
        if (name !== JOURNAL_TOOL_NAME) {
          repetitionDetector.record(name, state.lastArgs, result)
          const warnings = validateToolResult(name, result)
          if (warnings.length) {
            const prompt = buildValidationPrompt(name, warnings)
            if (prompt)
              pendingCorrection = (pendingCorrection ? pendingCorrection + '\n\n' : '') + prompt
          }
        }
        emit({ type: 'tool_result', name, result })
      }
    )

    let pendingThought = ''

    while (true) {
      try {
        pendingThought = ''
        for await (const event of sessionPromptGen(
          session,
          iterationPrompt,
          iterationFunctions,
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
        break
      } catch (err) {
        if (
          summarize &&
          isContextLengthError(err) &&
          compressionAttempts < MAX_COMPRESSION_ATTEMPTS
        ) {
          compressionAttempts++
          try {
            await compressSessionHistory(session, summarize)
          } catch (compressErr) {
            throw new Error(`Context too large and compression failed: ${compressErr.message}`)
          }
        } else {
          throw err
        }
      }
    }

    if (pendingThought.trim()) {
      emit({ type: 'thought', content: pendingThought.trim() })
    }

    const repetition = repetitionDetector.detectRepetition()
    if (repetition) {
      if (repetition.type === 'same_failing_action') break
      pendingCorrection = (pendingCorrection ? pendingCorrection + '\n\n' : '') + repetition.message
    }

    updatePlanningState(state, journal)

    if (journal.done) break

    const { stalledFor, nudge } = stallDetector.check(journal, state.planningComplete)
    if (stalledFor >= STALL_GIVE_UP_THRESHOLD) break
    if (nudge) pendingCorrection = (pendingCorrection ? pendingCorrection + '\n\n' : '') + nudge
  }

  const summary = journal.doneReason || journal.completed.at(-1) || journal.understanding || ''
  return { summary, done: journal.done, journal }
}
