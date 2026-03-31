import { emitAll } from '../ipc/shared'
import { sendMessage, abort as abortLlm } from '../chat/chat.session'
import { feedAudio, setOnTranscript, setOnHearing, resetBuffers, destroyStt } from './stt.service'
import { setChatStreamHandlers, clearChatStreamHandlers } from '../ai/llm.bridge'
import { logger } from '../logger'

let active = false
let aborted = false
let processing = false
let pendingTranscript = null
let _processLock = false

const SENTENCE_END = /[.!?]["']?\s*$/

const isPunctuationOnly = (text) => /^[^A-Za-z0-9]+$/.test(text)

const isBracketWrapped = (text) => {
  const t = text.trim()
  if (!t) return false
  const o = t[0]
  const c = t[t.length - 1]
  return (
    (o === '(' && c === ')') ||
    (o === '[' && c === ']') ||
    (o === '{' && c === '}') ||
    (o === '<' && c === '>')
  )
}

const isBrokenBracketFragment = (text) => {
  const hasOpening = /[([{<]/.test(text)
  const hasClosing = /[)\]}>]/.test(text)
  if (hasOpening && !hasClosing) return true
  if (hasClosing && !hasOpening) return true
  if (/[)\]}>]\s+[([{<]/.test(text)) return true
  return false
}

const sanitizeTranscript = (text) => {
  const trimmed = String(text ?? '').trim()
  if (!trimmed) return null
  if (trimmed.length < 2) return null
  if (isPunctuationOnly(trimmed)) return null
  if (isBracketWrapped(trimmed)) return null
  if (isBrokenBracketFragment(trimmed)) return null
  return trimmed
}

export function initVoiceOrchestrator() {
  setOnTranscript(handleTranscript)
  setOnHearing(() => {
    if (!active) return
    emitAll('chat:event', { type: 'hearing', data: {} })
  })
}

export function activateVoiceMode() {
  active = true
  aborted = false
  processing = false
  pendingTranscript = null
  _processLock = false
  resetBuffers()
}

export function deactivateVoiceMode() {
  active = false
  aborted = true
  processing = false
  pendingTranscript = null
  _processLock = false
  clearChatStreamHandlers()
  resetBuffers()
}

export function isVoiceModeActive() {
  return active
}

export function handleAudioChunk(buffer) {
  if (!active) return
  feedAudio(buffer)
}

async function handleTranscript(text) {
  if (!active) return

  const cleaned = sanitizeTranscript(text)
  if (!cleaned) return

  if (processing) {
    pendingTranscript = cleaned
    aborted = true
    abortLlm()
    logger.info('[voice] Barge-in — aborting current LLM for new transcript')
    emitAll('chat:event', { type: 'barge_in', data: {} })
    return
  }

  await processTranscript(cleaned)
}

async function processTranscript(cleaned) {
  if (_processLock) {
    pendingTranscript = cleaned
    return
  }
  _processLock = true
  processing = true
  logger.info('[voice] Transcript:', cleaned)
  emitAll('chat:event', { type: 'transcript', data: { content: cleaned } })

  let sentenceBuffer = ''

  function flushSentence(text) {
    const chunk = text.trim()
    if (chunk && active && !aborted) {
      emitAll('chat:event', { type: 'llm_response_chunk', data: { content: chunk } })
    }
  }

  const streamDone = new Promise((resolve) => {
    setChatStreamHandlers(
      (chunk) => {
        if (!active || aborted) return
        sentenceBuffer += chunk
        let pos
        while ((pos = sentenceBuffer.search(SENTENCE_END)) !== -1) {
          const sentence = sentenceBuffer.slice(0, pos + 1)
          sentenceBuffer = sentenceBuffer.slice(pos + 1)
          flushSentence(sentence)
        }
        if (sentenceBuffer.length > 80) {
          const breakAt = sentenceBuffer.lastIndexOf(' ', 80)
          if (breakAt > 20) {
            flushSentence(sentenceBuffer.slice(0, breakAt))
            sentenceBuffer = sentenceBuffer.slice(breakAt + 1)
          }
        }
      },
      () => {
        clearChatStreamHandlers()
        if (sentenceBuffer.trim() && active && !aborted) {
          flushSentence(sentenceBuffer)
          sentenceBuffer = ''
        }
        resolve()
      }
    )
  })

  try {
    aborted = false
    pendingTranscript = null
    await sendMessage({ content: cleaned })
    await streamDone

    if (pendingTranscript && active) {
      const next = pendingTranscript
      pendingTranscript = null
      processing = false
      _processLock = false
      await processTranscript(next)
      return
    }
  } catch (err) {
    clearChatStreamHandlers()
    if (pendingTranscript && active) {
      const next = pendingTranscript
      pendingTranscript = null
      processing = false
      _processLock = false
      await processTranscript(next)
      return
    }
    if (!aborted) {
      logger.error('[voice] Message processing error:', err)
      emitAll('chat:event', { type: 'voice_error', data: { message: err.message } })
    }
  } finally {
    processing = false
    _processLock = false
  }
}

export function destroyVoiceOrchestrator() {
  deactivateVoiceMode()
  destroyStt()
}
