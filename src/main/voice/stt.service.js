import { Worker } from 'worker_threads'
import { join } from 'path'
import { app } from 'electron'
import { logger } from '../logger'

const SAMPLE_RATE = 16000
const SILENCE_THRESHOLD = 400
const SILENCE_DURATION_SAMPLES = Math.floor((SAMPLE_RATE * 800) / 1000)
const MIN_SPEECH_SAMPLES = Math.floor((SAMPLE_RATE * 300) / 1000)

let worker = null
let ready = false
let _onTranscript = null
let _onReady = null

let chunks = []
let queuedChunks = []
let totalSamples = 0
let speechDetected = false
let silentSamples = 0
let transcribing = false

function workerPath() {
  const base = app.getAppPath().replace('app.asar', 'app.asar.unpacked')
  return join(base, 'out/main/stt.worker.js')
}

export function initStt() {
  if (worker) return

  worker = new Worker(workerPath())

  worker.on('message', (msg) => {
    switch (msg.type) {
      case 'ready':
        ready = true
        logger.info('[stt] Whisper model ready')
        if (queuedChunks.length > 0) {
          const pending = queuedChunks
          queuedChunks = []
          for (const chunk of pending) processChunk(chunk)
        }
        _onReady?.()
        break
      case 'transcript':
        transcribing = false
        if (msg.text) _onTranscript?.(msg.text)
        break
      case 'status':
        logger.info('[stt] Status:', msg.status)
        break
      case 'error':
        transcribing = false
        logger.error('[stt] Worker error:', msg.message)
        break
    }
  })

  worker.on('error', (err) => {
    logger.error('[stt] Worker crashed:', err)
    ready = false
  })

  worker.on('exit', (code) => {
    if (code !== 0) logger.warn('[stt] Worker exited with code', code)
    worker = null
    ready = false
  })

  const cacheDir = join(app.getPath('userData'), 'models', 'whisper')
  worker.postMessage({ type: 'init', cacheDir })
}

export function setOnTranscript(fn) {
  _onTranscript = fn
}

export function setOnReady(fn) {
  _onReady = fn
}

export function isReady() {
  return ready
}

function rms(samples) {
  let sum = 0
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i]
  return Math.sqrt(sum / samples.length)
}

function mergeChunks() {
  const result = new Int16Array(totalSamples)
  let offset = 0
  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.length
  }
  return result
}

function toFloat32(int16) {
  const f32 = new Float32Array(int16.length)
  for (let i = 0; i < int16.length; i++) f32[i] = int16[i] / 32768
  return f32
}

function toInt16Chunk(arrayBuffer) {
  if (arrayBuffer instanceof Int16Array) {
    return arrayBuffer
  }
  if (arrayBuffer instanceof ArrayBuffer) {
    return new Int16Array(arrayBuffer)
  }
  if (Buffer.isBuffer(arrayBuffer)) {
    return new Int16Array(arrayBuffer.buffer, arrayBuffer.byteOffset, arrayBuffer.byteLength / 2)
  }
  return null
}

function processChunk(chunk) {
  if (!ready || transcribing) return

  chunks.push(chunk)
  totalSamples += chunk.length

  const energy = rms(chunk)

  if (energy > SILENCE_THRESHOLD) {
    speechDetected = true
    silentSamples = 0
  } else if (speechDetected) {
    silentSamples += chunk.length
    if (silentSamples >= SILENCE_DURATION_SAMPLES && totalSamples >= MIN_SPEECH_SAMPLES) {
      const merged = mergeChunks()
      resetBuffers()
      transcribing = true

      const float32 = toFloat32(merged)
      worker.postMessage({ type: 'transcribe', audio: float32.buffer }, [float32.buffer])
    }
  }

  if (!speechDetected && totalSamples > SAMPLE_RATE * 30) {
    resetBuffers()
  }
}

export function feedAudio(arrayBuffer) {
  if (transcribing) return

  const chunk = toInt16Chunk(arrayBuffer)
  if (!chunk) return

  if (!worker) initStt()

  if (!ready) {
    queuedChunks.push(chunk)
    return
  }

  processChunk(chunk)
}

export function resetBuffers() {
  chunks = []
  queuedChunks = []
  totalSamples = 0
  speechDetected = false
  silentSamples = 0
}

export function hasSpeechActivity() {
  return speechDetected
}

export function destroyStt() {
  worker?.terminate()
  worker = null
  ready = false
  transcribing = false
  resetBuffers()
}
