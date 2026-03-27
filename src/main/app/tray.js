import { Tray, Menu, nativeImage, app } from 'electron'
import { join } from 'path'
import { emitAll } from '../ipc/shared'
import { toggleOverlay } from '../overlay/overlay.window'

let tray = null

export function createTray(getMainWindow, createMainWindow) {
  const imgPath = join(__dirname, '../../resources/vox-tray.png')
  const img = nativeImage.createFromPath(imgPath).resize({ width: 22, height: 22 })

  tray = new Tray(img)
  tray.setToolTip('Vox')

  const focusOrCreate = () => {
    const win = getMainWindow()
    if (win && !win.isDestroyed()) {
      if (win.isMinimized()) win.restore()
      win.show()
      win.focus()
    } else if (createMainWindow) {
      createMainWindow()
    }
  }

  const menu = Menu.buildFromTemplate([
    { label: 'Open Vox', click: focusOrCreate },
    { label: 'Start Voice Mode', click: () => emitAll('voice:activate', {}) },
    { label: 'Open Overlay', click: () => toggleOverlay() },
    { type: 'separator' },
    { label: 'Quit Vox', click: () => app.quit() }
  ])

  tray.setContextMenu(menu)
  tray.on('click', focusOrCreate)
}

export function destroyTray() {
  if (tray) {
    tray.destroy()
    tray = null
  }
}
