import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('crypto', () => ({ randomUUID: () => 'test-uuid-1234' }))
vi.mock('@vox-ai-app/tools', () => ({ loadBuiltinTools: () => new Map() }))
vi.mock('@vox-ai-app/integrations', () => ({ ALL_INTEGRATION_TOOLS: [] }))
vi.mock('@vox-ai-app/indexing', () => ({ ALL_KNOWLEDGE_TOOLS: [] }))

const mockMessages = []
let mockSummaryCheckpoint = null
const mockStore = {}

vi.mock('../../src/main/storage/messages.db', () => ({
  getMessages: (_, limit) => {
    if (limit) return mockMessages.slice(-limit)
    return mockMessages
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
  getConversationUserInfo: vi.fn(() => mockStore['vox.user.info'] || {}),
  setConversationUserInfo: vi.fn()
}))

vi.mock('../../src/main/storage/store', () => ({
  storeGet: (key) => mockStore[key] ?? null,
  storeSet: (key, val) => {
    mockStore[key] = val
  }
}))

vi.mock('../../src/main/ipc/shared', () => ({
  emitAll: vi.fn()
}))

vi.mock('../../src/main/mcp/mcp.service', () => ({
  getMcpToolDefinitions: () => []
}))

vi.mock('@vox-ai-app/storage/tools', () => ({
  listTools: vi.fn((db, enabledOnly) => {
    const tools = mockStore['customTools'] || []
    if (enabledOnly) return tools.filter((t) => t.is_enabled !== false && t.isEnabled !== false)
    return tools
  })
}))

vi.mock('../../src/main/storage/db', () => ({
  getDb: vi.fn(() => ({}))
}))

vi.mock('../../src/main/storage/tasks.db', () => ({
  getUnreportedTerminalTasks: () => [],
  markTaskReported: vi.fn()
}))

vi.mock('../../src/main/ai/llm/bridge', () => ({
  sendChatMessage: vi.fn(),
  abortChat: vi.fn(),
  clearChat: vi.fn().mockResolvedValue(undefined),
  waitForChatResult: vi.fn().mockResolvedValue({ finalText: 'response', streamId: 's1' }),
  getLlmStatus: () => ({ ready: true, modelPath: '/test', loading: false, error: null }),
  summarizeText: vi.fn().mockResolvedValue('summary result')
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

beforeEach(() => {
  mockMessages.length = 0
  mockSummaryCheckpoint = null
  for (const k of Object.keys(mockStore)) delete mockStore[k]
})

describe('sanitizeHistory', async () => {
  const mod = await import('../../src/main/chat/chat.session.js')

  it('should keep short but meaningful assistant messages', () => {
    const msgs = [
      { role: 'user', content: 'Are you there?' },
      { role: 'assistant', content: 'Yes' }
    ]
    mockMessages.push(...msgs)
    const result = mod.getStoredMessages(100)
    const assistantMsgs = result.filter((m) => m.role === 'assistant')
    expect(assistantMsgs.length).toBe(1)
    expect(assistantMsgs[0].content).toBe('Yes')
  })

  it('should return empty assistant messages as-is in stored page', () => {
    const msgs = [
      { id: 1, role: 'user', content: 'hello' },
      { id: 2, role: 'assistant', content: 'hi' },
      { id: 3, role: 'assistant', content: '' }
    ]
    mockMessages.push(...msgs)
    const page = mod.getStoredMessagesPage(100)
    expect(page.messages.length).toBe(3)
  })

  it('should return tool results as-is in stored page', () => {
    const msgs = [
      { id: 1, role: 'user', content: 'do something' },
      { id: 2, role: 'assistant', content: 'ok let me help' },
      { id: 3, role: 'tool', content: '{"result": "done"}' }
    ]
    mockMessages.push(...msgs)
    const page = mod.getStoredMessagesPage(100)
    expect(page.messages.length).toBe(3)
  })

  it('should return tool_call assistant messages as-is in stored page', () => {
    const msgs = [
      { id: 1, role: 'user', content: 'search for info' },
      { id: 2, role: 'assistant', content: '{"tool_call": "search"}' }
    ]
    mockMessages.push(...msgs)
    const page = mod.getStoredMessagesPage(100)
    expect(page.messages.length).toBe(2)
  })

  it('should keep tool messages that follow assistant messages mid-conversation', () => {
    const msgs = [
      { id: 1, role: 'user', content: 'search' },
      { id: 2, role: 'assistant', content: 'calling tool' },
      { id: 3, role: 'tool', content: 'result' },
      { id: 4, role: 'assistant', content: 'Here is what I found' },
      { id: 5, role: 'user', content: 'thanks' }
    ]
    mockMessages.push(...msgs)
    const page = mod.getStoredMessagesPage(100)
    expect(page.messages.length).toBe(5)
  })
})

describe('sendMessage', async () => {
  const mod = await import('../../src/main/chat/chat.session.js')
  const { waitForChatResult, sendChatMessage: _sendChatMessage } =
    await import('../../src/main/ai/llm/bridge')
  const { emitAll } = await import('../../src/main/ipc/shared')

  it('should persist user message to DB before dispatching', async () => {
    await mod.sendMessage({ content: 'hello' })
    expect(mockMessages.length).toBeGreaterThanOrEqual(1)
    expect(mockMessages[0].role).toBe('user')
    expect(mockMessages[0].content).toBe('hello')
  })

  it('should persist assistant response after stream completes', async () => {
    waitForChatResult.mockResolvedValueOnce({ finalText: 'world', streamId: 's2' })
    await mod.sendMessage({ content: 'hello' })
    const assistantMsgs = mockMessages.filter((m) => m.role === 'assistant')
    expect(assistantMsgs.some((m) => m.content === 'world')).toBe(true)
  })

  it('should reject empty messages', async () => {
    await expect(mod.sendMessage({ content: '' })).rejects.toThrow('Message content required')
    await expect(mod.sendMessage({ content: '   ' })).rejects.toThrow('Message content required')
  })

  it('should return requestId synchronously-ish', async () => {
    waitForChatResult.mockResolvedValueOnce({ finalText: 'ok', streamId: 's3' })
    const result = await mod.sendMessage({ content: 'test' })
    expect(result.requestId).toBeDefined()
    expect(typeof result.requestId).toBe('string')
  })

  it('should emit msg:complete with finalText on success', async () => {
    waitForChatResult.mockResolvedValueOnce({ finalText: 'reply', streamId: 'sid-1' })
    emitAll.mockClear()
    await mod.sendMessage({ content: 'hi' })

    const completeCall = emitAll.mock.calls.find(
      (c) => c[0] === 'chat:event' && c[1]?.type === 'msg:complete'
    )
    expect(completeCall).toBeTruthy()
    expect(completeCall[1].data.streamId).toBe('sid-1')
    expect(completeCall[1].data.dbId).toBeDefined()
    expect(completeCall[1].data.recovery).toBeTruthy()
    expect(completeCall[1].data.recovery.content).toBe('reply')
  })

  it('should emit msg:complete even when finalText is null', async () => {
    waitForChatResult.mockResolvedValueOnce({ finalText: null, streamId: 'sid-null' })
    emitAll.mockClear()
    await mod.sendMessage({ content: 'aborted msg' })

    const completeCall = emitAll.mock.calls.find(
      (c) => c[0] === 'chat:event' && c[1]?.type === 'msg:complete'
    )
    expect(completeCall).toBeTruthy()
    expect(completeCall[1].data.streamId).toBe('sid-null')
  })

  it('should emit msg:complete using requestId when streamId missing', async () => {
    waitForChatResult.mockResolvedValueOnce({ finalText: null })
    emitAll.mockClear()
    await mod.sendMessage({ content: 'no stream id' })

    const completeCall = emitAll.mock.calls.find(
      (c) => c[0] === 'chat:event' && c[1]?.type === 'msg:complete'
    )
    expect(completeCall).toBeTruthy()
    expect(completeCall[1].data.streamId).toBe('test-uuid-1234')
  })

  it('should emit msg:complete on waitForChatResult rejection', async () => {
    waitForChatResult.mockRejectedValueOnce(new Error('bridge error'))
    emitAll.mockClear()
    await mod.sendMessage({ content: 'error msg' })

    const completeCall = emitAll.mock.calls.find(
      (c) => c[0] === 'chat:event' && c[1]?.type === 'msg:complete'
    )
    expect(completeCall).toBeTruthy()
    expect(completeCall[1].data.streamId).toBe('test-uuid-1234')
  })
})

describe('getSystemPrompt', async () => {
  const mod = await import('../../src/main/chat/chat.session.js')

  it('should return default prompt when no custom prompt or user info', () => {
    const prompt = mod.getSystemPrompt()
    expect(prompt).toBe('You are Vox.')
  })

  it('should append user info when available', () => {
    mockStore['vox.user.info'] = { name: 'Alice', location: 'NYC' }
    const prompt = mod.getSystemPrompt()
    expect(prompt).toContain('Known user information')
    expect(prompt).toContain('Alice')
    expect(prompt).toContain('NYC')
  })

  it('should use custom system prompt when set', () => {
    mockStore['systemPrompt'] = 'Custom system prompt'
    const prompt = mod.getSystemPrompt()
    expect(prompt).toContain('Custom system prompt')
  })
})

describe('getChatStatus', async () => {
  const mod = await import('../../src/main/chat/chat.session.js')

  it('should reflect LLM ready state', () => {
    const status = mod.getChatStatus()
    expect(status.status.state).toBe('ready')
    expect(status.status.sessionReady).toBe(true)
    expect(status.status.connected).toBe(true)
  })
})

describe('getToolDefinitions', async () => {
  const mod = await import('../../src/main/chat/chat.session.js')

  it('should always include spawn_task', () => {
    const defs = mod.getToolDefinitions()
    expect(defs.some((d) => d.name === 'spawn_task')).toBe(true)
  })

  it('should always include save_user_info', () => {
    const defs = mod.getToolDefinitions()
    expect(defs.some((d) => d.name === 'save_user_info')).toBe(true)
  })

  it('should always include get_task and search_tasks', () => {
    const defs = mod.getToolDefinitions()
    expect(defs.some((d) => d.name === 'get_task')).toBe(true)
    expect(defs.some((d) => d.name === 'search_tasks')).toBe(true)
  })

  it('should include find_tools and run_tool when custom tools exist', () => {
    mockStore['customTools'] = [
      {
        name: 'my_tool',
        description: 'test',
        is_enabled: true,
        parameters: { type: 'object', properties: {} }
      }
    ]
    mod.invalidateToolDefinitions()
    const defs = mod.getToolDefinitions()
    expect(defs.some((d) => d.name === 'find_tools')).toBe(true)
    expect(defs.some((d) => d.name === 'run_tool')).toBe(true)
  })

  it('should always include manage_tool even with no custom tools', () => {
    mockStore['customTools'] = []
    mod.invalidateToolDefinitions()
    const defs = mod.getToolDefinitions()
    expect(defs.some((d) => d.name === 'manage_tool')).toBe(true)
  })

  it('should not include find_tools when no custom tools enabled', () => {
    mockStore['customTools'] = [{ name: 'disabled_tool', description: 'test', is_enabled: false }]
    mod.invalidateToolDefinitions()
    const defs = mod.getToolDefinitions()
    expect(defs.some((d) => d.name === 'find_tools')).toBe(false)
    expect(defs.some((d) => d.name === 'run_tool')).toBe(false)
    expect(defs.some((d) => d.name === 'manage_tool')).toBe(true)
  })

  it('should be cacheable and invalidatable', () => {
    const first = mod.getToolDefinitions()
    const second = mod.getToolDefinitions()
    expect(first).toBe(second)
    mod.invalidateToolDefinitions()
    const third = mod.getToolDefinitions()
    expect(first).not.toBe(third)
  })
})

describe('loadOlderStoredMessages', async () => {
  const mod = await import('../../src/main/chat/chat.session.js')

  it('should return page of messages before offset', () => {
    for (let i = 1; i <= 100; i++) {
      mockMessages.push({ id: i, role: i % 2 === 1 ? 'user' : 'assistant', content: `msg ${i}` })
    }
    const page = mod.loadOlderStoredMessages(50, 10)
    expect(page.messages.length).toBeLessThanOrEqual(10)
    expect(page.hasMore).toBeDefined()
  })
})
