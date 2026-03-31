import { ipcMain } from 'electron'
import { createHandler, registerHandler } from '../ipc/shared'
import { pauseWakeWord, resumeWakeWord } from './voice.service'
import { getVoiceWindow } from './voice.window'
import {
  activateVoiceMode,
  deactivateVoiceMode,
  handleAudioChunk,
  isVoiceModeActive
} from './voice.orchestrator'

export function registerVoiceIpc() {
  registerHandler(
    'voice:send-audio',
    createHandler((_e, arrayBuffer) => {
      if (!isVoiceModeActive()) return { accepted: false }
      handleAudioChunk(arrayBuffer)
      return { accepted: true }
    })
  )

  registerHandler(
    'voice:session-start',
    createHandler(() => {
      pauseWakeWord()
      activateVoiceMode()
      return { started: true }
    })
  )

  registerHandler(
    'voice:session-end',
    createHandler(() => {
      deactivateVoiceMode()
      resumeWakeWord()
      return { ended: true }
    })
  )

  ipcMain.removeAllListeners('voice:mouse-ignore')
  ipcMain.on('voice:mouse-ignore', (_event, ignore) => {
    const win = getVoiceWindow()
    if (win && !win.isDestroyed()) {
      win.setIgnoreMouseEvents(Boolean(ignore), { forward: true })
    }
  })
}
