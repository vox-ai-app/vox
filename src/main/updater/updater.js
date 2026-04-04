import { autoUpdater } from 'electron-updater'
import { is } from '@electron-toolkit/utils'
import { logger } from '../logger'
import { emitAll } from '../ipc/shared'

export function initUpdater() {
  if (is.dev) return

  autoUpdater.logger = logger
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('update-available', (info) => {
    logger.info('[updater] Update available:', info.version)
    emitAll('update:available', { version: info.version })
  })

  autoUpdater.on('update-downloaded', (info) => {
    logger.info('[updater] Update downloaded:', info.version)
    emitAll('update:downloaded', { version: info.version })
  })

  autoUpdater.on('error', (err) => {
    logger.warn('[updater] Error:', err.message)
  })

  setTimeout(() => {
    autoUpdater.checkForUpdates().catch((err) => {
      logger.warn('[updater] Check failed:', err.message)
    })
  }, 15_000)
}

export function installAndRestart() {
  autoUpdater.quitAndInstall()
}
