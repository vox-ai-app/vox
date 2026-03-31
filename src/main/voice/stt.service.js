import { Worker } from 'worker_threads'
import { join } from 'path'
import { rmSync } from 'fs'
import { app } from 'electron'
import { emitAll } from '../ipc/shared'
import { logger } from '../logger'

const SAMPLE_RATE = 16000
const SILENCE_THRESHOLD = 400
const SILENCE_DURATION_SAMPLES = Math.floor((SAMPLE_RATE * 500) / 1000)
const MIN_SPEECH_SAMPLES = Math.floor((SAMPLE_RATE * 200) / 1000)
const MAX_SPEECH_SAMPLES = SAMPLE_RATE * 30
const MAX_IDLE_SAMPLES = SAMPLE_RATE * 30
const MAX_INIT_ATTEMPTS = 2
const MAX_QUEUED_CHUNKS = 100

let worker = null
let ready = false
let _onTranscript = null
let _onReady = null
let _onHearing = null
let _readyResolvers = []
let _readyRejectors = []
let _initAttempts = 0

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

function getSttCacheDir() {
  return join(app.getPath('userData'), 'models', 'whisper')
}

function clearSttCache() {
  try {
    rmSync(getSttCacheDir(), { recursive: true, force: true })
    logger.warn('[stt] Cleared corrupted STT model cache')
  } catch (err) {
    logger.error('[stt] Failed to clear STT cache:', err)
  }
}

function spawnWorker() {
  worker = new Worker(workerPath())

  worker.on('message', (msg) => {
    switch (msg.type) {
      case 'ready':
        ready = true
        _initAttempts = 0
        logger.info('[stt] Whisper model ready')
        emitAll('models:stt-status', { status: 'ready' })
        if (queuedChunks.length > 0) {
          const pending = queuedChunks
          queuedChunks = []
          for (const chunk of pending) processChunk(chunk)
        }
        for (const resolve of _readyResolvers) resolve()
        _readyResolvers = []
        _readyRejectors = []
        _onReady?.()
        break
      case 'transcript':
        transcribing = false
        if (msg.text) _onTranscript?.(msg.text)
        break
      case 'status':
        logger.info('[stt] Status:', msg.status)
        emitAll('models:stt-status', { status: msg.status })
        break
      case 'progress':
        emitAll('models:stt-progress', { file: msg.file, loaded: msg.loaded, total: msg.total })
        break
      case 'error':
        transcribing = false
        logger.error('[stt] Worker error:', msg.message)
        if (!ready) {
          if (_initAttempts < MAX_INIT_ATTEMPTS) {
            _initAttempts++
            logger.warn(`[stt] Init failed (attempt ${_initAttempts}), clearing cache and retrying`)
            clearSttCache()
            worker?.terminate()
            worker = null
            setTimeout(() => {
              emitAll('models:stt-status', { status: 'downloading' })
              spawnWorker()
              worker.postMessage({ type: 'init', cacheDir: getSttCacheDir() })
            }, 500)
          } else {
            const err = new Error(`STT init failed: ${msg.message}`)
            for (const reject of _readyRejectors) reject(err)
            _readyResolvers = []
            _readyRejectors = []
            emitAll('models:stt-status', { status: 'error', message: msg.message })
          }
        }
        break
    }
  })

  worker.on('error', (err) => {
    logger.error('[stt] Worker crashed:', err)
    ready = false
    transcribing = false
  })

  worker.on('exit', (code) => {
    if (code !== 0) logger.warn('[stt] Worker exited with code', code)
    worker = null
    ready = false
    transcribing = false
  })
}

export function initStt() {
  if (worker) return

  spawnWorker()
  worker.postMessage({ type: 'init', cacheDir: getSttCacheDir() })
}

export function setOnTranscript(fn) {
  _onTranscript = fn
}

export function setOnReady(fn) {
  _onReady = fn
}

export function setOnHearing(fn) {
  _onHearing = fn
}

export function isReady() {
  return ready
}

export function waitSttReady() {
  if (ready) return Promise.resolve()
  return new Promise((resolve, reject) => {
    _readyResolvers.push(resolve)
    _readyRejectors.push(reject)
  })
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
  if (arrayBuffer instanceof Int16Array) return arrayBuffer
  if (arrayBuffer instanceof ArrayBuffer) return new Int16Array(arrayBuffer)
  if (Buffer.isBuffer(arrayBuffer)) {
    return new Int16Array(arrayBuffer.buffer, arrayBuffer.byteOffset, arrayBuffer.byteLength / 2)
  }
  return null
}

function submitForTranscription() {
  const merged = mergeChunks()
  resetBuffers()
  transcribing = true
  const float32 = toFloat32(merged)
  worker.postMessage({ type: 'transcribe', audio: float32.buffer }, [float32.buffer])
}

function processChunk(chunk) {
  if (!ready || transcribing) return

  chunks.push(chunk)
  totalSamples += chunk.length

  const energy = rms(chunk)

  if (energy > SILENCE_THRESHOLD) {
    if (!speechDetected) _onHearing?.()
    speechDetected = true
    silentSamples = 0
  } else if (speechDetected) {
    silentSamples += chunk.length
    if (silentSamples >= SILENCE_DURATION_SAMPLES && totalSamples >= MIN_SPEECH_SAMPLES) {
      submitForTranscription()
      return
    }
  }

  if (speechDetected && totalSamples >= MAX_SPEECH_SAMPLES) {
    submitForTranscription()
    return
  }

  if (!speechDetected && totalSamples > MAX_IDLE_SAMPLES) {
    resetBuffers()
  }
}

export function feedAudio(arrayBuffer) {
  if (transcribing) return

  const chunk = toInt16Chunk(arrayBuffer)
  if (!chunk) return

  if (!ready) {
    if (queuedChunks.length < MAX_QUEUED_CHUNKS) {
      queuedChunks.push(chunk)
    }
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
