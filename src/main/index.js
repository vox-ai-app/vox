import { app, BrowserWindow, shell, ipcMain } from 'electron'

app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')
import { join } from 'path'
import { promisify } from 'util'
import { exec } from 'child_process'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'

import { addMainBreadcrumb, captureMainException, initMainSentry } from './telemetry/sentry'
import { logger } from './core/logger'
import { emitAll } from './ipc/shared'
import { getDb, closeDb } from './storage/db'
import { getSetting, SETTINGS_KEYS } from './config/settings'
import { registerStoreIpc } from './ipc/store.ipc'
import { registerIndexingIpc, initIndexingStatusPush } from './ipc/indexing.ipc'
import { registerChatIpc } from './ipc/chat.ipc'
import { registerToolsIpc } from './ipc/tools.ipc'
import { registerModelsIpc } from './ai/models/ipc'
import { registerMcpIpc } from './mcp/mcp.ipc'
import { registerImessageIpc } from './imessage/imessage.ipc'
import { registerChannelsIpc } from './channels/channels.ipc'
import { registerVoiceIpc } from './voice/voice.ipc'
import { registerPowerIpc, setKeepAwake } from './power/power.ipc'
import { loadModel, destroyWorker, prewarmChat, setPrewarmProviders } from './ai/llm/bridge'
import { ensureBinary } from './ai/llm/server'
import { getActiveModelPath, cleanupPartialDownloads } from './ai/models/registry'
import { connectAllMcpServers, closeAllMcp, setToolInvalidationCallback } from './mcp/mcp.service'
import {
  invalidateToolDefinitions,
  getToolDefinitions,
  getSystemPrompt,
  sendMessageAndWait
} from './chat/chat.session'
import { setToolDefinitionProvider } from './chat/task.queue'
import { startWatching, stopWatching } from './imessage/imessage.service'
import { initVoiceService, destroyVoiceService } from './voice/voice.service'
import { initStt, waitSttReady } from './voice/stt.service'
import { initEmbeddings, destroyEmbeddings } from './ai/embeddings/embed'
import { createVoiceWindow, destroyVoiceWindow } from './voice/voice.window'
import {
  createOverlayWindow,
  destroyOverlayWindow,
  registerOverlayShortcut
} from './overlay/overlay.window'
import { registerOverlayIpc } from './overlay/overlay.ipc'
import { initVoiceOrchestrator, destroyVoiceOrchestrator } from './voice/voice.orchestrator'
import {
  bootIndexingRuntime,
  shutdownIndexingRuntime,
  setSentryCapture
} from '@vox-ai-app/indexing'
import { createTray, destroyTray } from './app/tray'
import { loadSkills } from './chat/skills.service'
import {
  initScheduler,
  setSchedulerAgentHandler,
  destroyScheduler
} from './scheduler/scheduler.service'
import {
  setChannelMessageHandler,
  destroyChannels,
  sendToChannel,
  initChannel,
  hasWhatsAppAuth
} from './channels/channels.service'
import { handleChannelMessage } from './channels/channels.sessions'
import { setChannelQueueHandler, enqueueChannelMessage } from './channels/channels.queue'
import { initUpdater, installAndRestart } from './updater/updater'

const execAsync = promisify(exec)

initMainSentry()
setSentryCapture(captureMainException)

logger.hooks.push((message) => {
  if (message.level === 'error' || message.level === 'warn') {
    addMainBreadcrumb(message.data, message.level)
  }
  return message
})

const SHUTDOWN_TIMEOUT_MS = 5000

let quitting = false
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

  mainWindow.on('close', (e) => {
    if (!quitting) {
      e.preventDefault()
      mainWindow.hide()
    }
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
  registerChannelsIpc()
  registerVoiceIpc()
  registerPowerIpc()
  registerIndexingIpc()
  registerOverlayIpc()
  initIndexingStatusPush()
  ipcMain.handle('setup:get-phase', () => _setupPhase)
  ipcMain.handle('update:install', () => installAndRestart())
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

  try {
    loadSkills()
  } catch (err) {
    logger.warn('[main] Skills load failed:', err)
  }

  try {
    initScheduler()
  } catch (err) {
    logger.warn('[main] Scheduler init failed:', err)
  }

  setSchedulerAgentHandler(async ({ scheduleId, prompt, channel }) => {
    try {
      const reply = await sendMessageAndWait({ content: prompt })
      if (channel) await sendToChannel(channel, null, reply).catch(() => {})
    } catch (err) {
      logger.warn(`[scheduler] Agent run failed for ${scheduleId}:`, err)
    }
  })

  setChannelQueueHandler(async ({ channel, peerId, text, senderName }) => {
    try {
      const { reply, activityEntry } = await handleChannelMessage({
        channel,
        peerId,
        text,
        senderName
      })
      if (reply) await sendToChannel(channel, peerId, reply)
      emitAll('channels:activity', activityEntry)
    } catch (err) {
      logger.warn(`[channels] Reply failed for ${channel}/${peerId}:`, err)
    }
  })

  setChannelMessageHandler(({ channel, peerId, text, senderName }) => {
    enqueueChannelMessage({ channel, peerId, text, senderName })
  })

  setPrewarmProviders(getToolDefinitions, getSystemPrompt)
  void prewarmChat()

  if (hasWhatsAppAuth()) {
    initChannel('whatsapp').catch((err) =>
      logger.warn('[channels] WhatsApp auto-connect failed:', err)
    )
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

    if (process.platform === 'darwin' && app.dock) {
      app.dock.show()
    }

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
    cleanupPartialDownloads()
    try {
      await ensureBinary()
    } catch (err) {
      logger.error('[main] Engine install failed:', err)
    }
    try {
      await initLlm()
    } catch (err) {
      logger.error('[main] LLM init failed:', err)
    }

    emitSetupPhase('loading-embeddings')
    try {
      await initEmbeddings()
    } catch (err) {
      logger.warn('[main] Embedding init failed:', err)
    }

    try {
      await initVoiceService()
    } catch (err) {
      logger.warn('[main] Voice init failed:', err)
    }

    emitSetupPhase('done')

    initUpdater()

    void bootBackgroundServices()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
      else if (mainWindow && !mainWindow.isDestroyed()) mainWindow.show()
    })
  })
  .catch((err) => {
    logger.error('[main] App startup failed:', err)
    try {
      if (!mainWindow) createMainWindow()
      emitAll('setup:phase', { phase: 'error', message: err.message })
    } catch (windowErr) {
      logger.error('[main] Failed to create fallback window:', windowErr)
    }
  })

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
      .catch((err) => logger.warn('[main] iMessage stop failed:', err)),
    destroyScheduler().catch((err) => logger.warn('[main] Scheduler shutdown failed:', err)),
    destroyChannels().catch((err) => logger.warn('[main] Channels shutdown failed:', err))
  ]).finally(() => {
    clearTimeout(shutdownTimer)
    forceCleanup()
    app.quit()
  })
})

let _cleanedUp = false
function forceCleanup() {
  if (_cleanedUp) return
  _cleanedUp = true
  destroyEmbeddings()
  destroyVoiceOrchestrator()
  destroyWorker()
  closeDb()
  destroyVoiceWindow()
  destroyOverlayWindow()
  destroyTray()
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
