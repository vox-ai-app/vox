import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockEmitAll = vi.fn()

vi.mock('../../../src/main/ipc/shared', () => ({
  emitAll: (...args) => mockEmitAll(...args)
}))

vi.mock('../../../src/main/core/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}))

vi.mock('../../../src/main/ai/config.js', () => ({
  CONTEXT_SIZE: 4096
}))

const {
  handleChatEventForRenderer,
  resetStreamState,
  setChatStreamHandlers,
  clearChatStreamHandlers
} = await import('../../../src/main/ai/llm/stream.js')

beforeEach(() => {
  mockEmitAll.mockClear()
  resetStreamState()
  clearChatStreamHandlers()
})

describe('chunk_start event', () => {
  it('should emit chunk_start and msg:append with pending assistant message', () => {
    handleChatEventForRenderer('req-1', { type: 'chunk_start', streamId: 'stream-1' })

    expect(mockEmitAll).toHaveBeenCalledWith('chat:event', {
      type: 'chunk_start',
      streamId: 'stream-1'
    })

    const appendCall = mockEmitAll.mock.calls.find((c) => c[1]?.type === 'msg:append')
    expect(appendCall).toBeTruthy()
    const msg = appendCall[1].data.message
    expect(msg.role).toBe('assistant')
    expect(msg.pending).toBe(true)
    expect(msg.streamId).toBe('stream-1')
    expect(msg.content).toBe('')
  })

  it('should use requestId as streamId fallback', () => {
    handleChatEventForRenderer('req-2', { type: 'chunk_start' })

    const appendCall = mockEmitAll.mock.calls.find((c) => c[1]?.type === 'msg:append')
    expect(appendCall[1].data.message.streamId).toBe('req-2')
  })
})

describe('text event buffering', () => {
  it('should buffer text and flush after timer', async () => {
    handleChatEventForRenderer('req-1', { type: 'chunk_start', streamId: 's1' })
    mockEmitAll.mockClear()

    handleChatEventForRenderer('req-1', { type: 'text', content: 'Hello ' })
    handleChatEventForRenderer('req-1', { type: 'text', content: 'world' })

    expect(mockEmitAll.mock.calls.some((c) => c[1]?.type === 'msg:stream-chunk')).toBe(false)

    await new Promise((r) => setTimeout(r, 30))

    const chunkCalls = mockEmitAll.mock.calls.filter((c) => c[1]?.type === 'msg:stream-chunk')
    expect(chunkCalls.length).toBeGreaterThanOrEqual(1)
    const flushedContent = chunkCalls.map((c) => c[1].data.content).join('')
    expect(flushedContent).toBe('Hello world')
  })

  it('should force flush when buffer exceeds max size', () => {
    handleChatEventForRenderer('req-1', { type: 'chunk_start', streamId: 's1' })
    mockEmitAll.mockClear()

    const bigChunk = 'x'.repeat(65 * 1024)
    handleChatEventForRenderer('req-1', { type: 'text', content: bigChunk })

    const chunkCalls = mockEmitAll.mock.calls.filter((c) => c[1]?.type === 'msg:stream-chunk')
    expect(chunkCalls.length).toBeGreaterThanOrEqual(1)
  })

  it('should forward text to voice handler when set', () => {
    const onText = vi.fn()
    setChatStreamHandlers(onText, vi.fn())

    handleChatEventForRenderer('req-1', { type: 'chunk_start', streamId: 's1' })
    handleChatEventForRenderer('req-1', { type: 'text', content: 'speech ' })

    expect(onText).toHaveBeenCalledWith('speech ')
  })
})

describe('chunk_end event', () => {
  it('should flush remaining buffer and emit chunk_end', async () => {
    handleChatEventForRenderer('req-1', { type: 'chunk_start', streamId: 's1' })
    handleChatEventForRenderer('req-1', { type: 'text', content: 'final' })
    mockEmitAll.mockClear()

    handleChatEventForRenderer('req-1', {
      type: 'chunk_end',
      streamId: 's1',
      finalText: 'full response'
    })

    const chunkCalls = mockEmitAll.mock.calls.filter((c) => c[1]?.type === 'msg:stream-chunk')
    expect(chunkCalls.some((c) => c[1].data.content.includes('final'))).toBe(true)

    const endCall = mockEmitAll.mock.calls.find((c) => c[1]?.type === 'chunk_end')
    expect(endCall[1].finalText).toBe('full response')
  })

  it('should call voice end handler', () => {
    const onEnd = vi.fn()
    setChatStreamHandlers(vi.fn(), onEnd)

    handleChatEventForRenderer('req-1', { type: 'chunk_start', streamId: 's1' })
    handleChatEventForRenderer('req-1', { type: 'chunk_end', streamId: 's1', finalText: 'done' })

    expect(onEnd).toHaveBeenCalledWith('done')
  })
})

describe('tool events', () => {
  it('should emit tool_call event', () => {
    handleChatEventForRenderer('req-1', {
      type: 'tool_call',
      name: 'web_search',
      args: { q: 'test' }
    })

    const call = mockEmitAll.mock.calls.find((c) => c[1]?.type === 'tool_call')
    expect(call[1].data.name).toBe('web_search')
    expect(call[1].data.args).toEqual({ q: 'test' })
  })

  it('should emit tool_result event', () => {
    handleChatEventForRenderer('req-1', {
      type: 'tool_result',
      name: 'web_search',
      result: 'found it'
    })

    const call = mockEmitAll.mock.calls.find((c) => c[1]?.type === 'tool_result')
    expect(call[1].data.name).toBe('web_search')
    expect(call[1].data.result).toBe('found it')
  })
})

describe('error and abort events', () => {
  it('should reset state and emit error', () => {
    handleChatEventForRenderer('req-1', { type: 'chunk_start', streamId: 's1' })
    handleChatEventForRenderer('req-1', { type: 'text', content: 'partial...' })
    mockEmitAll.mockClear()

    handleChatEventForRenderer('req-1', { type: 'error', message: 'OOM' })

    const errorCall = mockEmitAll.mock.calls.find((c) => c[1]?.type === 'error')
    expect(errorCall[1].data.message).toBe('OOM')
  })

  it('should reset state and emit abort_initiated', () => {
    handleChatEventForRenderer('req-1', { type: 'chunk_start', streamId: 's1' })
    mockEmitAll.mockClear()

    handleChatEventForRenderer('req-1', { type: 'abort_initiated' })

    const abortCall = mockEmitAll.mock.calls.find((c) => c[1]?.type === 'abort_initiated')
    expect(abortCall).toBeTruthy()
  })

  it('should call voice end handler on error', () => {
    const onEnd = vi.fn()
    setChatStreamHandlers(vi.fn(), onEnd)

    handleChatEventForRenderer('req-1', { type: 'error', message: 'fail' })
    expect(onEnd).toHaveBeenCalledWith(null)
  })

  it('should call voice end handler on abort', () => {
    const onEnd = vi.fn()
    setChatStreamHandlers(vi.fn(), onEnd)

    handleChatEventForRenderer('req-1', { type: 'abort_initiated' })
    expect(onEnd).toHaveBeenCalledWith(null)
  })
})

describe('usage event', () => {
  it('should emit usage data', () => {
    handleChatEventForRenderer('req-1', { type: 'usage', inputTokens: 100, outputTokens: 50 })

    const usageCall = mockEmitAll.mock.calls.find((c) => c[1]?.type === 'usage')
    expect(usageCall[1].data.inputTokens).toBe(100)
  })

  it('should emit context_warning when usage exceeds 70% of context', () => {
    handleChatEventForRenderer('req-1', { type: 'usage', inputTokens: 3500, outputTokens: 50 })

    const warningCall = mockEmitAll.mock.calls.find((c) => c[1]?.type === 'context_warning')
    expect(warningCall).toBeTruthy()
    expect(warningCall[1].data.ratio).toBeGreaterThan(0.7)
  })

  it('should not emit context_warning when usage is low', () => {
    handleChatEventForRenderer('req-1', { type: 'usage', inputTokens: 100, outputTokens: 50 })

    const warningCall = mockEmitAll.mock.calls.find((c) => c[1]?.type === 'context_warning')
    expect(warningCall).toBeUndefined()
  })
})

describe('resetStreamState', () => {
  it('should clear active stream and buffer', async () => {
    handleChatEventForRenderer('req-1', { type: 'chunk_start', streamId: 's1' })
    handleChatEventForRenderer('req-1', { type: 'text', content: 'buffered' })
    resetStreamState()
    mockEmitAll.mockClear()

    await new Promise((r) => setTimeout(r, 30))

    const chunkCalls = mockEmitAll.mock.calls.filter((c) => c[1]?.type === 'msg:stream-chunk')
    expect(chunkCalls.length).toBe(0)
  })
})

describe('stream handler lifecycle', () => {
  it('should support setting and clearing handlers', () => {
    const onText = vi.fn()
    const onEnd = vi.fn()

    setChatStreamHandlers(onText, onEnd)
    handleChatEventForRenderer('req-1', { type: 'chunk_start', streamId: 's1' })
    handleChatEventForRenderer('req-1', { type: 'text', content: 'hello' })
    expect(onText).toHaveBeenCalledWith('hello')

    clearChatStreamHandlers()
    handleChatEventForRenderer('req-1', { type: 'text', content: 'world' })
    expect(onText).toHaveBeenCalledTimes(1)
  })
})
