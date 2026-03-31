import { app, BrowserWindow, shell, ipcMain } from 'electron'

app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')
import { join } from 'path'
import { promisify } from 'util'
import { exec } from 'child_process'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'

import { logger } from './logger'
import { emitAll } from './ipc/shared'
import { getDb, closeDb } from './storage/db'
import { getSetting, SETTINGS_KEYS } from './config/settings'
import { registerStoreIpc } from './ipc/store.ipc'
import { registerIndexingIpc, initIndexingStatusPush } from './ipc/indexing.ipc'
import { registerChatIpc } from './ipc/chat.ipc'
import { registerToolsIpc } from './ipc/tools.ipc'
import { registerModelsIpc } from './ai/models.ipc'
import { registerMcpIpc } from './mcp/mcp.ipc'
import { registerImessageIpc } from './imessage/imessage.ipc'
import { registerVoiceIpc } from './voice/voice.ipc'
import { registerPowerIpc, setKeepAwake } from './power/power.ipc'
import { loadModel, destroyWorker, prewarmChat } from './ai/llm.bridge'
import { getActiveModelPath } from './ai/models'
import { connectAllMcpServers, closeAllMcp, setToolInvalidationCallback } from './mcp/mcp.service'
import { invalidateToolDefinitions, getToolDefinitions } from './chat/chat.session'
import { setToolDefinitionProvider } from './chat/task.queue'
import { startWatching, stopWatching } from './imessage/imessage.service'
import { initVoiceService, destroyVoiceService } from './voice/voice.service'
import { initStt, destroyStt, waitSttReady } from './voice/stt.service'
import { createVoiceWindow, destroyVoiceWindow } from './voice/voice.window'
import {
  createOverlayWindow,
  destroyOverlayWindow,
  registerOverlayShortcut
} from './overlay/overlay.window'
import { registerOverlayIpc } from './overlay/overlay.ipc'
import { initVoiceOrchestrator, destroyVoiceOrchestrator } from './voice/voice.orchestrator'
import { bootIndexingRuntime, shutdownIndexingRuntime } from '@vox-ai-app/indexing'
import { createTray, destroyTray } from './app/tray'

const execAsync = promisify(exec)

const SHUTDOWN_TIMEOUT_MS = 5000

let mainWindow = null
let _setupPhase = 'checking'

function emitSetupPhase(phase) {
  _setupPhase = phase
  emitAll('setup:phase', { phase })
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    show: false,
    title: 'Vox',
    icon: join(__dirname, '../../resources/icon.png'),
    titleBarStyle: 'hiddenInset',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true
    }
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  mainWindow.once('ready-to-show', () => mainWindow.show())

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return mainWindow
}

export function getMainWindow() {
  return mainWindow
}

function registerAllIpc() {
  registerStoreIpc()
  registerChatIpc()
  registerToolsIpc()
  registerModelsIpc()
  registerMcpIpc()
  registerImessageIpc()
  registerVoiceIpc()
  registerPowerIpc()
  registerIndexingIpc()
  registerOverlayIpc()
  initIndexingStatusPush()
  ipcMain.handle('setup:get-phase', () => _setupPhase)
}

async function bootBackgroundServices() {
  try {
    await bootIndexingRuntime()
    logger.info('[main] Indexing runtime ready')
  } catch (err) {
    logger.error('[main] Indexing boot failed:', err)
  }

  try {
    await connectAllMcpServers()
  } catch (err) {
    logger.warn('[main] MCP connect error:', err)
  }
}

async function initLlm() {
  const modelPath = getActiveModelPath()

  if (!modelPath) {
    logger.info('[main] No model found — showing onboarding')
    emitAll('models:no-model', {})
    return
  }

  try {
    await loadModel(modelPath)
    void prewarmChat()
  } catch (err) {
    logger.error('[main] Model load failed:', err)
    emitAll('models:load-error', { message: err.message })
  }
}

app
  .whenReady()
  .then(async () => {
    try {
      const loginShell = process.env.SHELL || '/bin/sh'
      const { stdout } = await execAsync(`${loginShell} -l -c 'echo $PATH'`)
      if (stdout.trim()) process.env.PATH = stdout.trim()
    } catch {
      logger.warn('[main] Failed to inherit shell PATH')
    }

    process.env.VOX_USER_DATA_PATH = app.getPath('userData')
    process.env.VOX_APP_PATH = app.getAppPath()
    process.env.VOX_IS_DEV = is.dev ? '1' : '0'

    electronApp.setAppUserModelId('com.vox.local')

    app.on('browser-window-created', (_, window) => {
      optimizer.watchWindowShortcuts(window)
    })

    getDb()

    const { session: electronSession } = await import('electron')
    electronSession.defaultSession.setPermissionRequestHandler(
      (_webContents, permission, callback) => {
        callback(permission === 'media')
      }
    )
    electronSession.defaultSession.setPermissionCheckHandler((_webContents, permission) => {
      return permission === 'media'
    })

    registerAllIpc()
    setToolInvalidationCallback(invalidateToolDefinitions)
    setToolDefinitionProvider(getToolDefinitions)

    if (getSetting(SETTINGS_KEYS.KEEP_AWAKE)) setKeepAwake(true)
    const imessagePassphrase = getSetting(SETTINGS_KEYS.IMESSAGE_PASSPHRASE)
    if (imessagePassphrase) {
      try {
        startWatching(imessagePassphrase)
      } catch (err) {
        logger.warn('[main] iMessage restore failed:', err)
      }
    }

    createMainWindow()
    createVoiceWindow()
    createOverlayWindow()
    registerOverlayShortcut()
    createTray(getMainWindow, createMainWindow)

    initVoiceOrchestrator()

    emitSetupPhase('checking')

    initStt()
    emitSetupPhase('loading-stt')
    await waitSttReady().catch((err) => logger.warn('[main] STT preload failed:', err))

    emitSetupPhase('loading-llm')
    try {
      await initLlm()
    } catch (err) {
      logger.error('[main] LLM init failed:', err)
    }

    try {
      await initVoiceService()
    } catch (err) {
      logger.warn('[main] Voice init failed:', err)
    }

    emitSetupPhase('done')

    void bootBackgroundServices()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
      else mainWindow?.show()
    })
  })
  .catch((err) => {
    logger.error('[main] App startup failed:', err)
    try {
      createMainWindow()
    } catch {
      logger.error('[main] Failed to create fallback window')
    }
  })

let quitting = false

app.on('before-quit', (e) => {
  if (quitting) return
  quitting = true
  e.preventDefault()

  const shutdownTimer = setTimeout(() => {
    logger.warn('[main] Shutdown timeout — forcing quit')
    forceCleanup()
    app.quit()
  }, SHUTDOWN_TIMEOUT_MS)

  Promise.allSettled([
    shutdownIndexingRuntime().catch((err) => logger.warn('[main] Indexing shutdown failed:', err)),
    destroyVoiceService().catch((err) => logger.warn('[main] Voice shutdown failed:', err)),
    closeAllMcp().catch((err) => logger.warn('[main] MCP shutdown failed:', err)),
    Promise.resolve()
      .then(() => stopWatching())
      .catch((err) => logger.warn('[main] iMessage stop failed:', err))
  ]).finally(() => {
    clearTimeout(shutdownTimer)
    forceCleanup()
    app.quit()
  })
})

function forceCleanup() {
  destroyVoiceOrchestrator()
  destroyStt()
  destroyWorker()
  closeDb()
  destroyVoiceWindow()
  destroyOverlayWindow()
  destroyTray()
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
