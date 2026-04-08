import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockEmitAll = vi.fn()
const mockSendMessage = vi.fn().mockResolvedValue({ requestId: 'req-1' })
const mockAbort = vi.fn()
const mockFeedAudio = vi.fn()
let onTranscriptCb = null
let onHearingCb = null
const mockResetBuffers = vi.fn()
const mockDestroyStt = vi.fn()
const mockSetChatStreamHandlers = vi.fn()
const mockClearChatStreamHandlers = vi.fn()

vi.mock('../../src/main/ipc/shared', () => ({
  emitAll: (...args) => mockEmitAll(...args)
}))

vi.mock('../../src/main/chat/chat.session', () => ({
  sendMessage: (...args) => mockSendMessage(...args),
  abort: (...args) => mockAbort(...args)
}))

vi.mock('../../src/main/voice/stt.service', () => ({
  feedAudio: (...args) => mockFeedAudio(...args),
  setOnTranscript: (cb) => {
    onTranscriptCb = cb
  },
  setOnHearing: (cb) => {
    onHearingCb = cb
  },
  resetBuffers: (...args) => mockResetBuffers(...args),
  destroyStt: (...args) => mockDestroyStt(...args)
}))

vi.mock('../../src/main/ai/llm/bridge', () => ({
  setChatStreamHandlers: (...args) => {
    mockSetChatStreamHandlers(...args)
    if (args[1]) {
      setTimeout(() => args[1]('done'), 10)
    }
  },
  clearChatStreamHandlers: (...args) => mockClearChatStreamHandlers(...args)
}))

vi.mock('../../src/main/core/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}))

const {
  initVoiceOrchestrator,
  activateVoiceMode,
  deactivateVoiceMode,
  isVoiceModeActive,
  handleAudioChunk,
  destroyVoiceOrchestrator
} = await import('../../src/main/voice/voice.orchestrator.js')

beforeEach(() => {
  mockEmitAll.mockClear()
  mockSendMessage.mockClear()
  mockAbort.mockClear()
  mockFeedAudio.mockClear()
  mockResetBuffers.mockClear()
  mockDestroyStt.mockClear()
  mockSetChatStreamHandlers.mockClear()
  mockClearChatStreamHandlers.mockClear()
  deactivateVoiceMode()
})

describe('transcript sanitization', () => {
  it('should reject empty strings', () => {
    activateVoiceMode()
    initVoiceOrchestrator()
    if (onTranscriptCb) onTranscriptCb('')
    expect(mockSendMessage).not.toHaveBeenCalled()
  })

  it('should reject whitespace-only strings', () => {
    activateVoiceMode()
    initVoiceOrchestrator()
    if (onTranscriptCb) onTranscriptCb('   ')
    expect(mockSendMessage).not.toHaveBeenCalled()
  })

  it('should reject single character strings', () => {
    activateVoiceMode()
    initVoiceOrchestrator()
    if (onTranscriptCb) onTranscriptCb('a')
    expect(mockSendMessage).not.toHaveBeenCalled()
  })

  it('should reject punctuation-only strings', () => {
    activateVoiceMode()
    initVoiceOrchestrator()
    if (onTranscriptCb) onTranscriptCb('...')
    expect(mockSendMessage).not.toHaveBeenCalled()
  })

  it('should reject bracket-wrapped strings', () => {
    activateVoiceMode()
    initVoiceOrchestrator()
    if (onTranscriptCb) onTranscriptCb('(silence)')
    expect(mockSendMessage).not.toHaveBeenCalled()
  })

  it('should reject broken bracket fragments', () => {
    activateVoiceMode()
    initVoiceOrchestrator()
    if (onTranscriptCb) onTranscriptCb('(incomplete')
    expect(mockSendMessage).not.toHaveBeenCalled()
  })

  it('should accept valid transcripts', async () => {
    activateVoiceMode()
    initVoiceOrchestrator()
    if (onTranscriptCb) await onTranscriptCb('Hello what is the weather')
    expect(mockSendMessage).toHaveBeenCalledWith({ content: 'Hello what is the weather' })
  })

  it('should reject various bracket types', () => {
    activateVoiceMode()
    initVoiceOrchestrator()
    const brackets = ['[noise]', '{cough}', '<silence>']
    for (const b of brackets) {
      mockSendMessage.mockClear()
      if (onTranscriptCb) onTranscriptCb(b)
      expect(mockSendMessage).not.toHaveBeenCalled()
    }
  })
})

describe('voice mode lifecycle', () => {
  it('should start inactive', () => {
    expect(isVoiceModeActive()).toBe(false)
  })

  it('should activate voice mode', () => {
    activateVoiceMode()
    expect(isVoiceModeActive()).toBe(true)
  })

  it('should deactivate voice mode', () => {
    activateVoiceMode()
    deactivateVoiceMode()
    expect(isVoiceModeActive()).toBe(false)
  })

  it('should reset buffers on activation', () => {
    activateVoiceMode()
    expect(mockResetBuffers).toHaveBeenCalled()
  })

  it('should clear chat stream handlers on deactivation', () => {
    activateVoiceMode()
    deactivateVoiceMode()
    expect(mockClearChatStreamHandlers).toHaveBeenCalled()
  })

  it('should reset buffers on deactivation', () => {
    activateVoiceMode()
    mockResetBuffers.mockClear()
    deactivateVoiceMode()
    expect(mockResetBuffers).toHaveBeenCalled()
  })
})

describe('audio chunk handling', () => {
  it('should not feed audio when inactive', () => {
    handleAudioChunk(Buffer.from([0, 1, 2]))
    expect(mockFeedAudio).not.toHaveBeenCalled()
  })

  it('should feed audio when active', () => {
    activateVoiceMode()
    const buf = Buffer.from([0, 1, 2])
    handleAudioChunk(buf)
    expect(mockFeedAudio).toHaveBeenCalledWith(buf)
  })
})

describe('barge-in behavior', () => {
  it('should emit barge_in event on transcript during processing', async () => {
    activateVoiceMode()
    initVoiceOrchestrator()

    mockSendMessage.mockImplementation(() => new Promise((r) => setTimeout(r, 100)))

    if (onTranscriptCb) {
      const _first = onTranscriptCb('first question')

      await new Promise((r) => setTimeout(r, 20))

      onTranscriptCb('interrupt with this')

      const bargeInCall = mockEmitAll.mock.calls.find((c) => c[1]?.type === 'barge_in')

      if (bargeInCall) {
        expect(bargeInCall).toBeTruthy()
        expect(mockAbort).toHaveBeenCalled()
      }
    }
  })
})

describe('hearing event', () => {
  it('should emit hearing event when active', () => {
    activateVoiceMode()
    initVoiceOrchestrator()

    if (onHearingCb) {
      onHearingCb()
      const hearingCall = mockEmitAll.mock.calls.find((c) => c[1]?.type === 'hearing')
      expect(hearingCall).toBeTruthy()
    }
  })

  it('should not emit hearing event when inactive', () => {
    initVoiceOrchestrator()

    if (onHearingCb) {
      onHearingCb()
      const hearingCall = mockEmitAll.mock.calls.find((c) => c[1]?.type === 'hearing')
      expect(hearingCall).toBeUndefined()
    }
  })
})

describe('destroyVoiceOrchestrator', () => {
  it('should deactivate and destroy STT', () => {
    activateVoiceMode()
    destroyVoiceOrchestrator()
    expect(isVoiceModeActive()).toBe(false)
    expect(mockDestroyStt).toHaveBeenCalled()
  })
})

describe('transcript event emission', () => {
  it('should emit transcript event for valid speech', async () => {
    activateVoiceMode()
    initVoiceOrchestrator()

    if (onTranscriptCb) {
      await onTranscriptCb('Tell me about the weather')

      const transcriptCall = mockEmitAll.mock.calls.find((c) => c[1]?.type === 'transcript')
      expect(transcriptCall).toBeTruthy()
      expect(transcriptCall[1].data.content).toBe('Tell me about the weather')
    }
  })
})

describe('no processing when inactive', () => {
  it('should ignore transcripts when not active', () => {
    initVoiceOrchestrator()
    if (onTranscriptCb) onTranscriptCb('should be ignored')
    expect(mockSendMessage).not.toHaveBeenCalled()
  })
})
