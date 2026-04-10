import { spawn, exec } from 'child_process'
import { promisify } from 'util'
import { logger } from '../../core/logger'

const execAsync = promisify(exec)
import { emitAll } from '../../ipc/shared'
import { ensure as ensureBinary, purge as purgeBinary } from './binary.manager.js'

export { ensureBinary }

const DEFAULT_PORT = 19741
const HEALTH_POLL_MS = 300
const MAX_HEALTH_POLLS = 400
const MAX_INSTANT_CRASHES = 3
const INSTANT_CRASH_THRESHOLD_MS = 2000

let _process = null
let _port = DEFAULT_PORT
let _modelPath = null
let _ready = false
let _onProgress = null
let _instantCrashCount = 0
let _lastStartTime = 0

export function getPort() {
  return _port
}

export function getBaseUrl() {
  return `http://127.0.0.1:${_port}`
}

export function isReady() {
  return _ready
}

export function getModelPath() {
  return _modelPath
}

export function onLoadProgress(handler) {
  _onProgress = handler
}

export function getProcess() {
  return _process
}

async function waitForHealth() {
  let processExited = false
  const onExit = () => {
    processExited = true
  }
  _process?.on('exit', onExit)

  try {
    for (let i = 0; i < MAX_HEALTH_POLLS; i++) {
      if (processExited || !_process) {
        throw new Error('llama-server process exited before becoming healthy')
      }
      try {
        const resp = await fetch(`${getBaseUrl()}/health`)
        if (resp.ok) {
          const body = await resp.json()
          if (body.status === 'ok') return true
        }
      } catch {
        // server not up yet
      }
      await new Promise((r) => setTimeout(r, HEALTH_POLL_MS))
    }
    throw new Error('llama-server failed to become healthy')
  } finally {
    _process?.removeListener('exit', onExit)
  }
}

async function killStaleProcessOnPort(port) {
  try {
    const { stdout } = await execAsync(`lsof -ti :${port}`)
    const pids = stdout.trim()
    if (!pids) return
    logger.warn(`[llm.server] Killing stale process(es) on port ${port}: ${pids}`)
    for (const pid of pids.split('\n').filter(Boolean)) {
      try {
        process.kill(Number(pid), 'SIGKILL')
      } catch {
        /* pid already gone */
      }
    }
  } catch {
    // no process on port
  }
}

export async function startServer(modelPath, { contextSize = 32768, nGpuLayers = -1, port } = {}) {
  if (_process) {
    await stopServer()
  }

  _port = port || DEFAULT_PORT
  _modelPath = modelPath
  _ready = false

  killStaleProcessOnPort(_port)
  await new Promise((r) => setTimeout(r, 300))

  const binary = await ensureBinary()

  const args = [
    '-m',
    modelPath,
    '--port',
    String(_port),
    '-c',
    String(contextSize),
    '-ngl',
    String(nGpuLayers),
    '--jinja',
    '--no-webui',
    '-fa',
    'auto',
    '--slots',
    '-np',
    '1'
  ]

  logger.info('[llm.server] Starting:', binary, args.join(' '))
  _lastStartTime = Date.now()

  _process = spawn(binary, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env }
  })

  let progressSent = 0

  _process.stderr.on('data', (data) => {
    const line = data.toString()
    const progressMatch = line.match(/llama_model_load:\s+(\d+(?:\.\d+)?)%/)
    if (progressMatch) {
      const pct = Math.round(parseFloat(progressMatch[1]))
      if (pct > progressSent) {
        progressSent = pct
        _onProgress?.(pct)
      }
    }
    if (line.includes('error') || line.includes('Error')) {
      logger.warn('[llm.server]', line.trim())
    }
  })

  _process.stdout.on('data', (data) => {
    const line = data.toString()
    if (line.includes('error') || line.includes('Error')) {
      logger.warn('[llm.server]', line.trim())
    }
  })

  _process.on('exit', (code, signal) => {
    const elapsed = Date.now() - _lastStartTime
    logger.info(`[llm.server] Exited code=${code} signal=${signal} after ${elapsed}ms`)
    _process = null
    _ready = false

    if (signal === 'SIGABRT' && elapsed < INSTANT_CRASH_THRESHOLD_MS) {
      _instantCrashCount++
      logger.warn(
        `[llm.server] Instant SIGABRT crash #${_instantCrashCount}/${MAX_INSTANT_CRASHES}`
      )
      if (_instantCrashCount >= MAX_INSTANT_CRASHES) {
        logger.error('[llm.server] Repeated SIGABRT — purging binary for re-download')
        _instantCrashCount = 0
        purgeBinary()
        emitAll('engine:status', {
          status: 'error',
          error:
            'The AI engine crashed repeatedly (SIGABRT). This usually means macOS is blocking the binary. ' +
            'Open System Settings > Privacy & Security and click "Allow Anyway" for llama-server, then restart Vox.'
        })
      }
    }
  })

  _process.on('error', (err) => {
    logger.error('[llm.server] Spawn error:', err.message)
    _process = null
    _ready = false
  })

  await waitForHealth()
  _ready = true
  logger.info('[llm.server] Server ready on port', _port)
}

export async function stopServer() {
  if (!_process) return
  const proc = _process
  _process = null
  _ready = false
  _modelPath = null

  proc.kill('SIGTERM')

  await new Promise((resolve) => {
    const timer = setTimeout(() => {
      try {
        proc.kill('SIGKILL')
      } catch {
        /* already exited */
      }
      resolve()
    }, 5000)
    proc.on('exit', () => {
      clearTimeout(timer)
      resolve()
    })
  })
}
