import { ipcMain, BrowserWindow } from 'electron'

export const createHandler =
  (fn) =>
  async (event, ...args) => {
    try {
      const data = await fn(event, ...args)
      return { success: true, data }
    } catch (error) {
      return {
        success: false,
        error: {
          code: error?.code || 'UNKNOWN_ERROR',
          message: error?.message || 'Unexpected error'
        }
      }
    }
  }

export const registerHandler = (channel, handler) => {
  ipcMain.removeHandler(channel)
  ipcMain.handle(channel, handler)
}

export const emitAll = (channel, payload) => {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(channel, payload)
  }
}
