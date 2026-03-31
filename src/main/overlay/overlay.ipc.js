import { ipcMain } from 'electron'
import { exec } from 'child_process'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import { getOverlayWindow } from './overlay.window'

export function registerOverlayIpc() {
  ipcMain.handle('overlay:hide', () => {
    const win = getOverlayWindow()
    if (win && !win.isDestroyed()) {
      win.hide()
    }
    return { success: true }
  })

  ipcMain.handle('overlay:capture-region', async () => {
    const win = getOverlayWindow()

    if (win && !win.isDestroyed()) {
      win.hide()
    }

    await new Promise((r) => setTimeout(r, 350))

    const tmpFile = path.join(os.tmpdir(), `vox_overlay_capture_${Date.now()}.jpg`)
    try {
      await new Promise((resolve, reject) => {
        let settled = false
        const settle = (fn, val) => {
          if (settled) return
          settled = true
          fn(val)
        }
        exec(`screencapture -i -t jpg "${tmpFile}"`, { timeout: 60_000 }, (error) => {
          if (error) settle(reject, error)
          else settle(resolve)
        })
      })

      let buffer
      try {
        buffer = await fs.readFile(tmpFile)
      } catch {
        return { success: false, cancelled: true }
      }

      const base64 = buffer.toString('base64')
      return { success: true, imageBase64: base64, mimeType: 'image/jpeg' }
    } catch (err) {
      return { success: false, error: err?.message || 'Screenshot capture failed' }
    } finally {
      await fs.unlink(tmpFile).catch(() => {})

      if (win && !win.isDestroyed()) {
        win.show()
      }
    }
  })

  ipcMain.on('overlay:mouse-ignore', (_event, ignore) => {
    const win = getOverlayWindow()
    if (win && !win.isDestroyed()) {
      win.setIgnoreMouseEvents(ignore, { forward: true })
    }
  })
}
