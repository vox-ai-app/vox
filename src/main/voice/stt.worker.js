import { parentPort } from 'worker_threads'

let transcriber = null

async function init(cacheDir) {
  const { pipeline, env } = await import('@huggingface/transformers')
  env.cacheDir = cacheDir
  env.allowRemoteModels = true

  parentPort.postMessage({ type: 'status', status: 'downloading' })

  transcriber = await pipeline('automatic-speech-recognition', 'onnx-community/whisper-tiny.en', {
    dtype: 'fp32',
    device: 'cpu'
  })

  parentPort.postMessage({ type: 'ready' })
}

async function transcribe(audioBuffer) {
  if (!transcriber) {
    parentPort.postMessage({ type: 'error', message: 'STT not initialized' })
    return
  }

  const audio = new Float32Array(audioBuffer)
  const result = await transcriber(audio, {
    language: 'english',
    task: 'transcribe',
    return_timestamps: false
  })

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
