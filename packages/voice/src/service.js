import { globalShortcut, systemPreferences, app } from 'electron'
import { join } from 'path'
import { Worker } from 'worker_threads'
import { is } from '@electron-toolkit/utils'
let _log = console
let _onDetected = () => {}
let _onError = () => {}
let _activateCallback = () => {}
let worker = null
let stoppingWorker = false
let registeredShortcut = null
export const setLogger = (logger) => {
  _log = logger
}
export const setOnWakeWordDetected = (fn) => {
  _onDetected = fn
}
export const setOnError = (fn) => {
  _onError = fn
}
const unpackedApp = () => app.getAppPath().replace('app.asar', 'app.asar.unpacked')
const modelBase = () =>
  is.dev ? join(app.getAppPath(), 'resources/voice') : join(unpackedApp(), 'resources/voice')
const workerPath = () => join(unpackedApp(), 'out/main/voice.worker.js')
const startWakeWord = async () => {
  try {
    stoppingWorker = false
    worker = new Worker(workerPath(), {
      workerData: {
        base: modelBase()
      }
    })
    worker.on('message', (msg) => {
      if (msg.type === 'detected') {
        if (_activateCallback() !== false) {
          worker?.postMessage({ type: 'pause' })
        }
      } else if (msg.type === 'error') {
        _onError(new Error(msg.message || 'Wake word worker error'))
        _log.error('[voice] worker error:', msg.message)
      }
    })
    worker.on('error', (err) => {
      _onError(err)
      _log.error('[voice] worker crash:', err)
    })
    worker.on('exit', (code) => {
      if (stoppingWorker || code === 0) return
      _onError(new Error(`Wake word worker exited with code ${code}`))
    })
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('worker ready timeout')), 15000)
      const onMsg = (msg) => {
        if (msg.type === 'ready') {
          clearTimeout(timer)
          worker.off('message', onMsg)
          resolve()
        } else if (msg.type === 'error') {
          clearTimeout(timer)
          worker.off('message', onMsg)
          reject(new Error(msg.message))
        }
      }
      worker.on('message', onMsg)
    })
  } catch (err) {
    _onError(err)
    _log.error('[voice] Wake word init failed — shortcut-only mode:', err)
  }
}
const initWakeWord = async () => {
  const status = systemPreferences.getMediaAccessStatus('microphone')
  if (status !== 'granted') {
    const granted = await systemPreferences.askForMediaAccess('microphone')
    if (!granted) {
      _log.warn('[voice] Microphone permission denied — wake word disabled')
      return
    }
  }
  await startWakeWord()
}
export const pauseWakeWord = () => {
  worker?.postMessage({
    type: 'pause'
  })
}
export const resumeWakeWord = () => {
  worker?.postMessage({
    type: 'resume'
  })
}
export const initVoiceService = async ({ onActivate } = {}) => {
  if (worker || registeredShortcut) {
    await destroyVoiceService()
  }
  const activate = onActivate ?? (() => _onDetected())
  _activateCallback = activate
  const registered = globalShortcut.register('CommandOrControl+Alt+V', activate)
  if (registered) {
    registeredShortcut = 'CommandOrControl+Alt+V'
  } else {
    const fallback = globalShortcut.register('CommandOrControl+Shift+Space', activate)
    if (fallback) registeredShortcut = 'CommandOrControl+Shift+Space'
  }
  try {
    await initWakeWord()
  } catch (err) {
    _onError(err)
    _log.error('[voice] Wake word init error:', err)
  }
}
export const destroyVoiceService = async () => {
  if (registeredShortcut) {
    globalShortcut.unregister(registeredShortcut)
    registeredShortcut = null
  }
  if (worker) {
    stoppingWorker = true
    worker.postMessage({
      type: 'stop'
    })
    await new Promise((resolve) => {
      const timeout = setTimeout(() => {
        worker?.terminate()
        resolve()
      }, 2000)
      worker.once('exit', () => {
        clearTimeout(timeout)
        resolve()
      })
    })
    worker = null
  }
}
