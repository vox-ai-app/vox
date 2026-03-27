import { emitAll } from '../ipc/shared'
import { sendMessageAndWait } from '../chat/chat.session'
import {
  feedAudio,
  setOnTranscript,
  resetBuffers,
  destroyStt,
  hasSpeechActivity
} from './stt.service'
import { synthesize } from './tts.service'
import { logger } from '../logger'

let active = false
let speaking = false
let aborted = false
let processing = false

const PCM_CHUNK_BYTES = 8192

export function initVoiceOrchestrator() {
  setOnTranscript(handleTranscript)
}

export function activateVoiceMode() {
  active = true
  speaking = false
  aborted = false
  processing = false
  resetBuffers()
}

export function deactivateVoiceMode() {
  active = false
  aborted = true
  speaking = false
  processing = false
  resetBuffers()
}

export function isVoiceModeActive() {
  return active
}

export function handleAudioChunk(buffer) {
  if (!active) return

  if (speaking && hasSpeechActivity()) {
    aborted = true
    speaking = false
    emitAll('chat:event', { type: 'barge_in' })
    resetBuffers()
    return
  }

  if (!speaking && !processing) {
    feedAudio(buffer)
  }
}

async function handleTranscript(text) {
  if (!active || processing) return

  const cleaned = text
    .replace(/^\[.*?\]\s*/g, '')
    .replace(/^\(.*?\)\s*/g, '')
    .trim()

  if (!cleaned || cleaned.length < 2) return

  processing = true
  logger.info('[voice] Transcript:', cleaned)
  emitAll('chat:event', { type: 'transcript', data: { content: cleaned } })

  try {
    aborted = false
    const finalText = await sendMessageAndWait({ content: cleaned })

    if (!active || aborted || !finalText?.trim()) return

    await speak(finalText)
  } catch (err) {
    logger.error('[voice] Message processing error:', err)
  } finally {
    processing = false
  }
}

async function speak(text) {
  if (!active || aborted) return

  speaking = true
  emitAll('chat:event', { type: 'audio_start' })

  try {
    const pcm = await synthesize(text)
    if (!pcm || !active || aborted) return

    for (let i = 0; i < pcm.length; i += PCM_CHUNK_BYTES) {
      if (!active || aborted) break
      const end = Math.min(i + PCM_CHUNK_BYTES, pcm.length)
      emitAll('voice:audio', pcm.subarray(i, end))
    }
  } catch (err) {
    logger.error('[voice] TTS error:', err)
  } finally {
    speaking = false
    if (active) {
      emitAll('chat:event', { type: 'audio_end' })
    }
  }
}

export function destroyVoiceOrchestrator() {
  deactivateVoiceMode()
  destroyStt()
}
