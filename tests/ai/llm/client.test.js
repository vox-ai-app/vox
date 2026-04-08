import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../../src/main/ai/llm/server.js', () => ({
  getBaseUrl: () => 'http://localhost:19741',
  isReady: () => true
}))

function makeSSEStream(chunks) {
  const data = chunks.map((c) => `data: ${JSON.stringify(c)}\n\n`).join('') + 'data: [DONE]\n\n'
  const encoder = new TextEncoder()
  const encoded = encoder.encode(data)
  let position = 0
  return new ReadableStream({
    pull(controller) {
      if (position < encoded.length) {
        controller.enqueue(encoded.slice(position, position + encoded.length))
        position = encoded.length
      } else {
        controller.close()
      }
    }
  })
}

function makeSSEStreamNoFinish(chunks) {
  const data = chunks.map((c) => `data: ${JSON.stringify(c)}\n\n`).join('')
  const encoder = new TextEncoder()
  const encoded = encoder.encode(data)
  let position = 0
  return new ReadableStream({
    pull(controller) {
      if (position < encoded.length) {
        controller.enqueue(encoded.slice(position, position + encoded.length))
        position = encoded.length
      } else {
        controller.close()
      }
    }
  })
}

describe('streamChat', () => {
  let streamChat

  beforeEach(async () => {
    vi.restoreAllMocks()
    const mod = await import('../../../src/main/ai/llm/client.js')
    streamChat = mod.streamChat
  })

  it('should yield tool_calls on finish_reason=tool_calls', async () => {
    const mockBody = makeSSEStream([
      {
        choices: [
          {
            delta: {
              tool_calls: [
                {
                  index: 0,
                  id: 'call_1',
                  function: { name: 'web_search', arguments: '{"q":"test"}' }
                }
              ]
            }
          }
        ]
      },
      { choices: [{ delta: {}, finish_reason: 'tool_calls' }] }
    ])

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      body: mockBody,
      json: vi.fn()
    })

    const events = []
    for await (const event of streamChat({ messages: [{ role: 'user', content: 'hi' }] })) {
      events.push(event)
    }

    const toolCallEvents = events.filter((e) => e.type === 'tool_call')
    expect(toolCallEvents).toHaveLength(1)
    expect(toolCallEvents[0].name).toBe('web_search')
    expect(toolCallEvents[0].args.q).toBe('test')
  })

  it('should flush pending tool_calls when stream ends without finish_reason', async () => {
    const mockBody = makeSSEStreamNoFinish([
      {
        choices: [
          {
            delta: {
              tool_calls: [
                {
                  index: 0,
                  id: 'call_orphan',
                  function: { name: 'search', arguments: '{"q":"lost"}' }
                }
              ]
            }
          }
        ]
      }
    ])

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      body: mockBody,
      json: vi.fn()
    })

    const events = []
    for await (const event of streamChat({ messages: [{ role: 'user', content: 'hi' }] })) {
      events.push(event)
    }

    const toolCallEvents = events.filter((e) => e.type === 'tool_call')
    expect(toolCallEvents).toHaveLength(1)
    expect(toolCallEvents[0].id).toBe('call_orphan')
    expect(toolCallEvents[0].name).toBe('search')
    expect(toolCallEvents[0].args.q).toBe('lost')
  })

  it('should yield multiple tool_calls with correct IDs', async () => {
    const mockBody = makeSSEStream([
      {
        choices: [
          {
            delta: {
              tool_calls: [
                { index: 0, id: 'call_a', function: { name: 'search', arguments: '{"q":"first"}' } }
              ]
            }
          }
        ]
      },
      {
        choices: [
          {
            delta: {
              tool_calls: [
                {
                  index: 1,
                  id: 'call_b',
                  function: { name: 'search', arguments: '{"q":"second"}' }
                }
              ]
            }
          }
        ]
      },
      { choices: [{ delta: {}, finish_reason: 'tool_calls' }] }
    ])

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      body: mockBody,
      json: vi.fn()
    })

    const events = []
    for await (const event of streamChat({ messages: [{ role: 'user', content: 'hi' }] })) {
      events.push(event)
    }

    const toolCalls = events.filter((e) => e.type === 'tool_call')
    expect(toolCalls).toHaveLength(2)
    expect(toolCalls[0].id).toBe('call_a')
    expect(toolCalls[1].id).toBe('call_b')
  })

  it('should handle incremental argument streaming', async () => {
    const mockBody = makeSSEStream([
      {
        choices: [
          {
            delta: {
              tool_calls: [
                { index: 0, id: 'call_inc', function: { name: 'search', arguments: '{"q":' } }
              ]
            }
          }
        ]
      },
      { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '"hello"}' } }] } }] },
      { choices: [{ delta: {}, finish_reason: 'tool_calls' }] }
    ])

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      body: mockBody,
      json: vi.fn()
    })

    const events = []
    for await (const event of streamChat({ messages: [{ role: 'user', content: 'hi' }] })) {
      events.push(event)
    }

    const toolCalls = events.filter((e) => e.type === 'tool_call')
    expect(toolCalls).toHaveLength(1)
    expect(toolCalls[0].args.q).toBe('hello')
  })
})
