import { emitAll } from '../../ipc/shared'
import { logger } from '../../core/logger'
import { getContextSize } from '../config.js'

let _activeStreamId = null
let _voiceTextHandler = null
let _voiceEndHandler = null
let _streamBuffer = ''
let _streamFlushTimer = null
const MAX_STREAM_BUFFER = 64 * 1024

function flushStreamBuffer() {
  if (!_streamBuffer || !_activeStreamId) return
  const content = _streamBuffer
  _streamBuffer = ''
  try {
    emitAll('chat:event', {
      type: 'msg:stream-chunk',
      data: { streamId: _activeStreamId, content }
    })
    emitAll('chat:event', {
      type: 'message_chunk',
      data: { streamId: _activeStreamId, content }
    })
  } catch (err) {
    logger.error('[llm.stream] flushStreamBuffer failed:', err)
  }
}

function scheduleFlush() {
  if (_streamFlushTimer) return
  _streamFlushTimer = setTimeout(() => {
    _streamFlushTimer = null
    flushStreamBuffer()
  }, 16)
}

export function resetStreamState() {
  if (_streamFlushTimer) {
    clearTimeout(_streamFlushTimer)
    _streamFlushTimer = null
  }
  _streamBuffer = ''
  _activeStreamId = null
}

export function setChatStreamHandlers(onText, onEnd) {
  _voiceTextHandler = onText
  _voiceEndHandler = onEnd
}

export function clearChatStreamHandlers() {
  _voiceTextHandler = null
  _voiceEndHandler = null
}

export function handleChatEventForRenderer(requestId, event) {
  switch (event.type) {
    case 'chunk_start': {
      const streamId = event.streamId || requestId
      _activeStreamId = streamId

      emitAll('chat:event', { type: 'chunk_start', streamId })

      emitAll('chat:event', {
        type: 'msg:append',
        data: {
          message: {
            id: `stream-${streamId}`,
            dbId: null,
            role: 'assistant',
            content: '',
            pending: true,
            streamId
          }
        }
      })
      break
    }

    case 'text': {
      if (_voiceTextHandler) _voiceTextHandler(event.content)
      if (_activeStreamId) {
        _streamBuffer += event.content
        if (_streamFlushTimer) {
          clearTimeout(_streamFlushTimer)
          _streamFlushTimer = null
        }
        if (_streamBuffer.length > MAX_STREAM_BUFFER) {
          flushStreamBuffer()
        } else {
          scheduleFlush()
        }
      }
      break
    }

    case 'chunk_end': {
      if (_streamFlushTimer) {
        clearTimeout(_streamFlushTimer)
        _streamFlushTimer = null
      }
      flushStreamBuffer()
      const streamId = event.streamId || requestId
      emitAll('chat:event', { type: 'chunk_end', streamId, finalText: event.finalText })
      if (_voiceEndHandler) _voiceEndHandler(event.finalText || null)
      _activeStreamId = null
      break
    }

    case 'tool_call':
      emitAll('chat:event', { type: 'tool_call', data: { name: event.name, args: event.args } })
      break

    case 'tool_result':
      emitAll('chat:event', {
        type: 'tool_result',
        data: { name: event.name, result: event.result }
      })
      break

    case 'abort_initiated':
      resetStreamState()
      emitAll('chat:event', { type: 'abort_initiated' })
      if (_voiceEndHandler) _voiceEndHandler(null)
      break

    case 'error':
      resetStreamState()
      emitAll('chat:event', { type: 'error', data: { message: event.message } })
      if (_voiceEndHandler) _voiceEndHandler(null)
      break

    case 'usage': {
      emitAll('chat:event', { type: 'usage', data: event })
      if (event.inputTokens && event.inputTokens > 0) {
        getContextSize().then((contextSize) => {
          const usageRatio = event.inputTokens / contextSize
          if (usageRatio > 0.7) {
            emitAll('chat:event', {
              type: 'context_warning',
              data: { ratio: usageRatio, message: 'Context window is getting full.' }
            })
          }
        })
      }
      break
    }

    default:
      break
  }
}
