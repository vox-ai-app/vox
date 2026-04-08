import { describe, it, expect, vi, beforeEach } from 'vitest'

let streamChatYield = []
let mockIsReady = true

vi.mock('../../../src/main/ai/llm/server.js', () => ({
  startServer: vi.fn(),
  stopServer: vi.fn(),
  onLoadProgress: vi.fn(),
  isReady: () => mockIsReady,
  getModelPath: () => '/test/model.gguf',
  getProcess: () => null
}))

vi.mock('../../../src/main/ai/llm/client.js', () => ({
  streamChat: async function* () {
    for (const event of streamChatYield) {
      yield event
    }
  },
  nonStreamChat: vi.fn(),
  healthCheck: vi.fn().mockResolvedValue(true),
  chatCompletion: vi.fn()
}))

const mockEmitAll = vi.fn()
vi.mock('../../../src/main/ipc/shared', () => ({
  emitAll: (...args) => mockEmitAll(...args)
}))

vi.mock('../../../src/main/core/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}))

vi.mock('../../../src/main/ai/llm/tool-executor.js', () => ({
  executeElectronTool: vi.fn()
}))

vi.mock('../../../src/main/ai/config.js', () => ({
  CONTEXT_SIZE: 4096
}))

const mockHandleChatEvent = vi.fn()
vi.mock('../../../src/main/ai/llm/stream.js', () => ({
  handleChatEventForRenderer: (...args) => mockHandleChatEvent(...args),
  resetStreamState: vi.fn(),
  setChatStreamHandlers: vi.fn(),
  clearChatStreamHandlers: vi.fn()
}))

let bridge

beforeEach(async () => {
  streamChatYield = [{ type: 'text', content: 'hello' }]
  mockIsReady = true
  mockEmitAll.mockClear()
  mockHandleChatEvent.mockClear()
  vi.resetModules()
  bridge = await import('../../../src/main/ai/llm/bridge.js')
})

describe('sendChatMessage + waitForChatResult race condition', () => {
  it('should resolve when waitForChatResult is called after handleChatSend completes', async () => {
    streamChatYield = [{ type: 'text', content: 'fast reply' }]

    bridge.sendChatMessage({
      requestId: 'req-race-1',
      message: 'hi',
      systemPrompt: 'sys',
      history: [],
      toolDefinitions: []
    })

    await new Promise((r) => setTimeout(r, 50))

    const result = await bridge.waitForChatResult('req-race-1', 2000)
    expect(result).toBeTruthy()
    expect(result.finalText).toBe('fast reply')
  })

  it('should resolve when waitForChatResult is called before handleChatSend completes', async () => {
    streamChatYield = [{ type: 'text', content: 'normal reply' }]

    bridge.sendChatMessage({
      requestId: 'req-race-2',
      message: 'hi',
      systemPrompt: 'sys',
      history: [],
      toolDefinitions: []
    })

    const result = await bridge.waitForChatResult('req-race-2', 5000)
    expect(result).toBeTruthy()
    expect(result.finalText).toBe('normal reply')
    expect(result.streamId).toBe('req-race-2')
  })

  it('should timeout if no result arrives', async () => {
    const result = await bridge.waitForChatResult('req-never-sent', 100)
    expect(result.finalText).toBeNull()
  })

  it('should handle multiple concurrent requests independently', async () => {
    streamChatYield = [{ type: 'text', content: 'reply-a' }]
    bridge.sendChatMessage({
      requestId: 'req-a',
      message: 'a',
      systemPrompt: 'sys',
      history: [],
      toolDefinitions: []
    })

    const resultA = await bridge.waitForChatResult('req-a', 5000)
    expect(resultA.finalText).toBe('reply-a')

    streamChatYield = [{ type: 'text', content: 'reply-b' }]
    bridge.sendChatMessage({
      requestId: 'req-b',
      message: 'b',
      systemPrompt: 'sys',
      history: [],
      toolDefinitions: []
    })

    const resultB = await bridge.waitForChatResult('req-b', 5000)
    expect(resultB.finalText).toBe('reply-b')
  })
})

describe('sendChatMessage streaming', () => {
  it('should strip think tags from streamed content', async () => {
    streamChatYield = [{ type: 'text', content: '<think>internal</think>visible' }]

    bridge.sendChatMessage({
      requestId: 'req-think',
      message: 'test',
      systemPrompt: 'sys',
      history: [],
      toolDefinitions: []
    })

    const result = await bridge.waitForChatResult('req-think', 5000)
    expect(result.finalText).toBe('visible')
  })

  it('should handle empty stream gracefully', async () => {
    streamChatYield = []

    bridge.sendChatMessage({
      requestId: 'req-empty',
      message: 'test',
      systemPrompt: 'sys',
      history: [],
      toolDefinitions: []
    })

    const result = await bridge.waitForChatResult('req-empty', 5000)
    expect(result.finalText).toBe('')
  })
})

describe('abortChat', () => {
  it('should not throw when no active controller', () => {
    expect(() => bridge.abortChat()).not.toThrow()
  })
})

describe('clearChat', () => {
  it('should clear internal state', async () => {
    streamChatYield = [{ type: 'text', content: 'hi' }]
    bridge.sendChatMessage({
      requestId: 'req-clear',
      message: 'test',
      systemPrompt: 'sys',
      history: [],
      toolDefinitions: []
    })
    await bridge.waitForChatResult('req-clear', 5000)

    await bridge.clearChat()
    const history = await bridge.getChatHistory()
    expect(history).toEqual([])
  })
})

describe('getChatHistory', () => {
  it('should return history after a chat round', async () => {
    streamChatYield = [{ type: 'text', content: 'response' }]

    bridge.sendChatMessage({
      requestId: 'req-hist',
      message: 'question',
      systemPrompt: 'You are helpful.',
      history: [],
      toolDefinitions: []
    })

    await bridge.waitForChatResult('req-hist', 5000)
    const history = await bridge.getChatHistory()
    expect(history.length).toBeGreaterThanOrEqual(2)
    expect(history.some((m) => m.role === 'user' && m.content === 'question')).toBe(true)
    expect(history.some((m) => m.role === 'assistant' && m.content === 'response')).toBe(true)
  })
})

describe('model not ready early return', () => {
  it('should resolve pending request with null finalText when model unavailable', async () => {
    mockIsReady = false

    bridge.sendChatMessage({
      requestId: 'req-no-model',
      message: 'test',
      systemPrompt: 'sys',
      history: [],
      toolDefinitions: []
    })

    const result = await bridge.waitForChatResult('req-no-model', 2000)
    expect(result.finalText).toBeNull()
    expect(result.streamId).toBe('req-no-model')
  })
})

describe('streamId always present in results', () => {
  it('should include streamId on successful response', async () => {
    streamChatYield = [{ type: 'text', content: 'ok' }]

    bridge.sendChatMessage({
      requestId: 'req-sid-1',
      message: 'test',
      systemPrompt: 'sys',
      history: [],
      toolDefinitions: []
    })

    const result = await bridge.waitForChatResult('req-sid-1', 5000)
    expect(result.streamId).toBe('req-sid-1')
  })

  it('should include streamId on timeout', async () => {
    const result = await bridge.waitForChatResult('req-timeout-sid', 100)
    expect(result.streamId).toBe('req-timeout-sid')
  })

  it('should include streamId on empty response', async () => {
    streamChatYield = []

    bridge.sendChatMessage({
      requestId: 'req-empty-sid',
      message: 'test',
      systemPrompt: 'sys',
      history: [],
      toolDefinitions: []
    })

    const result = await bridge.waitForChatResult('req-empty-sid', 5000)
    expect(result.streamId).toBe('req-empty-sid')
  })
})

describe('renderer event flow', () => {
  it('should emit chunk_start then chunk_end for normal request', async () => {
    streamChatYield = [{ type: 'text', content: 'hi' }]

    bridge.sendChatMessage({
      requestId: 'req-events',
      message: 'test',
      systemPrompt: 'sys',
      history: [],
      toolDefinitions: []
    })

    await bridge.waitForChatResult('req-events', 5000)

    const chunkStart = mockHandleChatEvent.mock.calls.find((c) => c[1]?.type === 'chunk_start')
    expect(chunkStart).toBeTruthy()
    expect(chunkStart[1].streamId).toBe('req-events')

    const chunkEnd = mockHandleChatEvent.mock.calls.find((c) => c[1]?.type === 'chunk_end')
    expect(chunkEnd).toBeTruthy()
    expect(chunkEnd[1].finalText).toBe('hi')
  })

  it('should emit text events for streaming content', async () => {
    streamChatYield = [
      { type: 'text', content: 'Hello ' },
      { type: 'text', content: 'world' }
    ]

    bridge.sendChatMessage({
      requestId: 'req-text-events',
      message: 'test',
      systemPrompt: 'sys',
      history: [],
      toolDefinitions: []
    })

    await bridge.waitForChatResult('req-text-events', 5000)

    const textCalls = mockHandleChatEvent.mock.calls.filter((c) => c[1]?.type === 'text')
    expect(textCalls.length).toBe(2)
    expect(textCalls[0][1].content).toBe('Hello ')
    expect(textCalls[1][1].content).toBe('world')
  })
})

describe('tool_call_id matching with duplicate tool names', () => {
  it('should handle two calls to the same tool in one round', async () => {
    const { executeElectronTool } = await import('../../../src/main/ai/llm/tool-executor.js')
    executeElectronTool.mockResolvedValue('result')

    let callNum = 0
    const _originalYield = streamChatYield
    Object.defineProperty(globalThis, '__streamCallCount', {
      value: 0,
      writable: true,
      configurable: true
    })

    streamChatYield = null
    const mod = await import('../../../src/main/ai/llm/client.js')
    vi.spyOn(mod, 'streamChat').mockImplementation(async function* () {
      callNum++
      if (callNum === 1) {
        yield { type: 'tool_call', id: 'call_aaa', name: 'web_search', args: { q: 'first' } }
        yield { type: 'tool_call', id: 'call_bbb', name: 'web_search', args: { q: 'second' } }
      } else {
        yield { type: 'text', content: 'Done searching.' }
      }
    })

    bridge.sendChatMessage({
      requestId: 'req-dup-tools',
      message: 'search both',
      systemPrompt: 'sys',
      history: [],
      toolDefinitions: [{ name: 'web_search', parameters: {} }]
    })

    await bridge.waitForChatResult('req-dup-tools', 5000)

    expect(executeElectronTool).toHaveBeenCalledTimes(2)
    expect(executeElectronTool).toHaveBeenCalledWith('web_search', { q: 'first' })
    expect(executeElectronTool).toHaveBeenCalledWith('web_search', { q: 'second' })

    const toolResultCalls = mockHandleChatEvent.mock.calls.filter(
      (c) => c[1]?.type === 'tool_result'
    )
    expect(toolResultCalls.length).toBe(2)
  })
})

describe('agent event deduplication', () => {
  it('should not emit task:event directly for task.status events', async () => {
    const listener = vi.fn()
    bridge.onAgentEvent('test-dedup', listener)

    streamChatYield = [{ type: 'text', content: 'done' }]

    bridge.startAgent({
      taskId: 'test-dedup',
      instructions: 'test',
      context: '',
      toolDefinitions: []
    })

    await new Promise((r) => setTimeout(r, 200))

    const taskStatusEmissions = mockEmitAll.mock.calls.filter(
      (c) => c[0] === 'task:event' && c[1]?.type === 'task.status'
    )

    const taskIds = taskStatusEmissions.map((c) => c[1].taskId)
    const statuses = taskStatusEmissions.map((c) => c[1].status)

    expect(taskIds.every((id) => id === 'test-dedup')).toBe(true)

    const completedCount = statuses.filter((s) => s === 'completed' || s === 'incomplete').length
    expect(completedCount).toBeLessThanOrEqual(1)
  })
})
