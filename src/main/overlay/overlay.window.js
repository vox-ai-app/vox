import { BrowserWindow, globalShortcut, screen } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { getLlmStatus } from '../ai/llm.bridge'

let overlayWindow = null
const OVERLAY_WIDTH = 480
const OVERLAY_HEIGHT = 520

export function createOverlayWindow() {
  if (overlayWindow && !overlayWindow.isDestroyed()) return overlayWindow

  const { width: screenWidth, height: screenHeight } = screen.getPrimaryDisplay().workAreaSize
  const x = Math.round((screenWidth - OVERLAY_WIDTH) / 2)
  const y = Math.round(screenHeight - OVERLAY_HEIGHT - 40)

  overlayWindow = new BrowserWindow({
    width: OVERLAY_WIDTH,
    height: OVERLAY_HEIGHT,
    minWidth: 360,
    minHeight: 300,
    maxWidth: 720,
    maxHeight: 900,
    x,
    y,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: true,
    movable: true,
    minimizable: false,
    maximizable: false,
    closable: false,
    hasShadow: false,
    focusable: true,
    show: false,
    roundedCorners: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      backgroundThrottling: false
    }
  })

  overlayWindow.setAlwaysOnTop(true, 'floating')
  overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  overlayWindow.setIgnoreMouseEvents(true, { forward: true })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    const baseUrl = process.env['ELECTRON_RENDERER_URL'].replace(/\/[^/]*\.html$/, '')
    overlayWindow.loadURL(`${baseUrl}/overlay.html`)
  } else {
    overlayWindow.loadFile(join(__dirname, '../renderer/overlay.html'))
  }

  return overlayWindow
}

export function ensureOverlayReady() {
  if (!overlayWindow || overlayWindow.isDestroyed()) {
    createOverlayWindow()
  }
}

export function toggleOverlay() {
  if (!getLlmStatus().ready) return

  if (!overlayWindow || overlayWindow.isDestroyed()) {
    createOverlayWindow()
  }

  if (overlayWindow.isVisible()) {
    hideOverlay()
  } else {
    showOverlay()
  }
}

function showOverlay() {
  if (!overlayWindow || overlayWindow.isDestroyed()) return
  overlayWindow.setIgnoreMouseEvents(false, { forward: true })
  overlayWindow.show()
  overlayWindow.focus()
}

function hideOverlay() {
  if (!overlayWindow || overlayWindow.isDestroyed()) return
  overlayWindow.setIgnoreMouseEvents(true, { forward: true })
  overlayWindow.hide()
}

export function registerOverlayShortcut() {
  globalShortcut.register('Alt+Space', () => {
    toggleOverlay()
  })
}

export function unregisterOverlayShortcut() {
  globalShortcut.unregister('Alt+Space')
}

export function getOverlayWindow() {
  return overlayWindow
}

export function destroyOverlayWindow() {
  unregisterOverlayShortcut()
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.destroy()
    overlayWindow = null
  }
}
