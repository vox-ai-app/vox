import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('crypto', () => ({
  randomUUID: () => 'test-uuid-' + Math.random().toString(36).slice(2, 8)
}))
vi.mock('@vox-ai-app/tools', () => ({ ALL_TOOLS: [] }))
vi.mock('@vox-ai-app/tools/registry', () => ({
  registerAll: vi.fn(),
  run: vi.fn(),
  getDeclarations: vi.fn(() => [])
}))
vi.mock('@vox-ai-app/tools/schema', () => ({ validateArgs: vi.fn(() => []) }))
vi.mock('@vox-ai-app/integrations', () => ({ ALL_INTEGRATION_TOOLS: [] }))
vi.mock('@vox-ai-app/indexing', () => ({ ALL_KNOWLEDGE_TOOLS: [] }))

const mockMessages = []
let mockSummaryCheckpoint = null
const mockStore = {}

vi.mock('../../src/main/storage/messages.db', () => ({
  getMessages: (_, limit) => {
    if (limit) return mockMessages.slice(-limit)
    return [...mockMessages]
  },
  getMessagesBeforeId: (offsetId, _, limit) => {
    const idx = mockMessages.findIndex((m) => m.id === offsetId)
    if (idx < 0) return []
    const slice = mockMessages.slice(0, idx)
    return limit ? slice.slice(-limit) : slice
  },
  appendMessage: (role, content) => {
    const msg = { id: mockMessages.length + 1, role, content }
    mockMessages.push(msg)
    return msg
  },
  saveSummaryCheckpoint: (summary, checkpointId) => {
    mockSummaryCheckpoint = { summary, checkpointId }
  },
  loadSummaryCheckpoint: () => mockSummaryCheckpoint,
  indexMessageEmbedding: vi.fn(),
  getConversationUserInfo: vi.fn(() => ({})),
  setConversationUserInfo: vi.fn()
}))

vi.mock('../../src/main/storage/store', () => ({
  storeGet: (key) => mockStore[key] ?? null,
  storeSet: (key, val) => {
    mockStore[key] = val
  }
}))

vi.mock('../../src/main/ipc/shared', () => ({ emitAll: vi.fn() }))
vi.mock('../../src/main/mcp/mcp.service', () => ({ getMcpToolDefinitions: () => [] }))
vi.mock('@vox-ai-app/storage/tools', () => ({
  listTools: vi.fn(() => [])
}))
vi.mock('../../src/main/storage/db', () => ({
  getDb: vi.fn(() => ({}))
}))
vi.mock('../../src/main/storage/tasks.db', () => ({
  getUnreportedTerminalTasks: () => [],
  markTaskReported: vi.fn(),
  indexTaskEmbedding: vi.fn(async () => {})
}))

const mockSendChatMessage = vi.fn()
const mockSummarize = vi.fn().mockResolvedValue('condensed summary')

vi.mock('../../src/main/ai/llm/bridge', () => ({
  sendChatMessage: (...args) => mockSendChatMessage(...args),
  abortChat: vi.fn(),
  clearChat: vi.fn().mockResolvedValue(undefined),
  waitForChatResult: vi.fn().mockResolvedValue({ finalText: 'response', streamId: 's1' }),
  getLlmStatus: () => ({ ready: true, modelPath: '/test', loading: false, error: null }),
  summarizeText: (...args) => mockSummarize(...args)
}))

vi.mock('../../src/main/chat/chat.prompts', () => ({
  buildDefaultSystemPrompt: () => 'You are Vox.'
}))

vi.mock('../../src/main/chat/spawn.tool', () => ({
  definition: {
    name: 'spawn_task',
    description: 'test',
    parameters: { type: 'object', properties: {} }
  }
}))

vi.mock('../../src/main/core/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}))

let mod

beforeEach(async () => {
  vi.resetModules()
  mockMessages.length = 0
  mockSummaryCheckpoint = null
  for (const k of Object.keys(mockStore)) delete mockStore[k]
  mockSendChatMessage.mockClear()
  mockSummarize.mockClear()
  mod = await import('../../src/main/chat/chat.session.js')
})

describe('sanitizeHistory via sendMessage', () => {
  it('should strip trailing empty assistant messages from LLM context', async () => {
    mockMessages.push(
      { id: 1, role: 'user', content: 'hello' },
      { id: 2, role: 'assistant', content: 'hi there' },
      { id: 3, role: 'assistant', content: '' }
    )

    await mod.sendMessage({ content: 'next question' })

    const sentHistory = mockSendChatMessage.mock.calls[0][0].history
    const hasEmpty = sentHistory.some((m) => m.role === 'assistant' && m.content === '')
    expect(hasEmpty).toBe(false)
  })

  it('should strip trailing orphan tool messages from LLM context', async () => {
    mockMessages.push(
      { id: 1, role: 'user', content: 'do thing' },
      { id: 2, role: 'assistant', content: 'calling tool' },
      { id: 3, role: 'tool', content: '{"ok": true}' }
    )

    await mod.sendMessage({ content: 'what happened?' })

    const sentHistory = mockSendChatMessage.mock.calls[0][0].history
    const lastNonUser = [...sentHistory].reverse().find((m) => m.role !== 'user')
    expect(lastNonUser.role).toBe('assistant')
    expect(lastNonUser.content).toBe('calling tool')
  })

  it('should strip trailing assistant with tool_call but no tool result', async () => {
    mockMessages.push(
      { id: 1, role: 'user', content: 'search info' },
      { id: 2, role: 'assistant', content: '{"tool_call": "web_search"}' }
    )

    await mod.sendMessage({ content: 'still there?' })

    const sentHistory = mockSendChatMessage.mock.calls[0][0].history
    const toolCallMsgs = sentHistory.filter(
      (m) => m.role === 'assistant' && m.content.includes('"tool_call"')
    )
    expect(toolCallMsgs.length).toBe(0)
  })

  it('should keep valid tool call + tool result pairs mid-conversation', async () => {
    mockMessages.push(
      { id: 1, role: 'user', content: 'search' },
      { id: 2, role: 'assistant', content: '{"tool_call": "search"}' },
      { id: 3, role: 'tool', content: 'search results' },
      { id: 4, role: 'assistant', content: 'Found it' },
      { id: 5, role: 'user', content: 'thanks' }
    )

    await mod.sendMessage({ content: 'new question' })

    const sentHistory = mockSendChatMessage.mock.calls[0][0].history
    expect(sentHistory.length).toBeGreaterThanOrEqual(5)
  })

  it('should drop orphaned tool messages not preceded by assistant', async () => {
    mockMessages.push(
      { id: 1, role: 'user', content: 'hey' },
      { id: 2, role: 'tool', content: 'orphan result' },
      { id: 3, role: 'assistant', content: 'hello' }
    )

    await mod.sendMessage({ content: 'hi' })

    const sentHistory = mockSendChatMessage.mock.calls[0][0].history
    const toolMsgs = sentHistory.filter((m) => m.role === 'tool')
    expect(toolMsgs.length).toBe(0)
  })

  it('should handle empty message list', async () => {
    await mod.sendMessage({ content: 'first message' })

    const sentHistory = mockSendChatMessage.mock.calls[0][0].history
    expect(sentHistory.length).toBe(0)
  })
})

describe('buildContextHistory via sendMessage', () => {
  it('should return plain messages when no summary exists', async () => {
    mockMessages.push(
      { id: 1, role: 'user', content: 'hello' },
      { id: 2, role: 'assistant', content: 'hi' }
    )

    await mod.sendMessage({ content: 'next' })

    const sentHistory = mockSendChatMessage.mock.calls[0][0].history
    expect(sentHistory[0]).toEqual({ role: 'user', content: 'hello' })
    expect(sentHistory[1]).toEqual({ role: 'assistant', content: 'hi' })
  })

  it('should prepend summary and only keep recent messages when summary exists', async () => {
    mockSummaryCheckpoint = { summary: 'Previously discussed weather', checkpointId: 3 }

    mockMessages.push(
      { id: 1, role: 'user', content: 'old message 1' },
      { id: 2, role: 'assistant', content: 'old response 1' },
      { id: 3, role: 'user', content: 'old message 2' },
      { id: 4, role: 'assistant', content: 'recent response' },
      { id: 5, role: 'user', content: 'latest' }
    )

    await mod.sendMessage({ content: 'new q' })

    const sentHistory = mockSendChatMessage.mock.calls[0][0].history
    expect(sentHistory[0].role).toBe('assistant')
    expect(sentHistory[0].content).toContain('[Summary of earlier conversation]')
    expect(sentHistory[0].content).toContain('Previously discussed weather')

    const recentContents = sentHistory.slice(1).map((m) => m.content)
    expect(recentContents).toContain('recent response')
    expect(recentContents).toContain('latest')
  })

  it('should fall back to all messages if summary checkpoint ID not found', async () => {
    mockSummaryCheckpoint = { summary: 'some summary', checkpointId: 999 }

    mockMessages.push(
      { id: 1, role: 'user', content: 'a' },
      { id: 2, role: 'assistant', content: 'b' }
    )

    await mod.sendMessage({ content: 'c' })

    const sentHistory = mockSendChatMessage.mock.calls[0][0].history
    expect(sentHistory[0].content).toContain('[Summary of earlier conversation]')
    expect(sentHistory.length).toBeGreaterThanOrEqual(3)
  })
})

describe('summarization checkpoint persistence', () => {
  it('should load persisted checkpoint on first access', async () => {
    mockSummaryCheckpoint = { summary: 'loaded from db', checkpointId: 10 }

    mockMessages.push(
      { id: 8, role: 'user', content: 'old' },
      { id: 9, role: 'assistant', content: 'old resp' },
      { id: 10, role: 'user', content: 'checkpoint' },
      { id: 11, role: 'assistant', content: 'after checkpoint' }
    )

    await mod.sendMessage({ content: 'test' })

    const sentHistory = mockSendChatMessage.mock.calls[0][0].history
    expect(sentHistory[0].content).toContain('loaded from db')
  })
})

describe('message persistence across send', () => {
  it('should not persist assistant message if finalText is empty', async () => {
    const { waitForChatResult } = await import('../../src/main/ai/llm/bridge')
    waitForChatResult.mockResolvedValueOnce({ finalText: '', streamId: 'y' })

    const before = mockMessages.filter((m) => m.role === 'assistant').length
    await mod.sendMessage({ content: 'test' })
    const after = mockMessages.filter((m) => m.role === 'assistant').length
    expect(after).toBe(before)
  })
})

describe('unreported task injection', () => {
  it('should inject completed task results into message history', async () => {
    const tasksDb = await import('../../src/main/storage/tasks.db')
    tasksDb.getUnreportedTerminalTasks = vi.fn(() => [
      { id: 't1', status: 'completed', instructions: 'Do X', result: 'Done X' }
    ])
    tasksDb.markTaskReported = vi.fn()

    await mod.sendMessage({ content: 'any updates?' })

    expect(tasksDb.markTaskReported).toHaveBeenCalledWith('t1')
    const injected = mockMessages.find(
      (m) => m.role === 'assistant' && m.content.includes('Background task completed')
    )
    expect(injected).toBeTruthy()
    expect(injected.content).toContain('Do X')
  })
})
