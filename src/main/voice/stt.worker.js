const { parentPort } = require('worker_threads')

const Module = require('module')
const _resolveFilename = Module._resolveFilename
Module._resolveFilename = function (request, ...args) {
  if (request === 'onnxruntime-node') throw new Error('blocked')
  return _resolveFilename.call(this, request, ...args)
}

let transcriber = null

async function init(cacheDir) {
  const { pipeline, env } = await import('@huggingface/transformers')
  env.cacheDir = cacheDir
  env.allowRemoteModels = true

  parentPort.postMessage({ type: 'status', status: 'downloading' })

  transcriber = await pipeline('automatic-speech-recognition', 'onnx-community/whisper-tiny.en', {
    dtype: 'fp32',
    session_options: { intraOpNumThreads: 1, interOpNumThreads: 1 },
    progress_callback: (p) => {
      if (p.status === 'progress' && p.total) {
        parentPort.postMessage({ type: 'progress', file: p.file, loaded: p.loaded, total: p.total })
      }
    }
  })

  parentPort.postMessage({ type: 'ready' })
}

async function transcribe(audioBuffer) {
  if (!transcriber) {
    parentPort.postMessage({ type: 'error', message: 'STT not initialized' })
    return
  }

  const audio = new Float32Array(audioBuffer)
  const result = await transcriber(audio, { return_timestamps: false })

  const text = (result.text || '').trim()
  parentPort.postMessage({ type: 'transcript', text })
}

parentPort.on('message', async (msg) => {
  try {
    if (msg.type === 'init') await init(msg.cacheDir)
    else if (msg.type === 'transcribe') await transcribe(msg.audio)
  } catch (err) {
    parentPort.postMessage({ type: 'error', message: err.message })
  }
})
