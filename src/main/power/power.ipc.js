import { powerSaveBlocker } from 'electron'
import { registerHandler, createHandler } from '../ipc/shared'
import { getSetting, setSetting, SETTINGS_KEYS } from '../config/settings'

let blockerId = null

export function isKeepAwakeActive() {
  return blockerId !== null && powerSaveBlocker.isStarted(blockerId)
}

export function setKeepAwake(enabled) {
  if (enabled && !isKeepAwakeActive()) {
    blockerId = powerSaveBlocker.start('prevent-app-suspension')
  } else if (!enabled && blockerId !== null) {
    if (powerSaveBlocker.isStarted(blockerId)) {
      powerSaveBlocker.stop(blockerId)
    }
    blockerId = null
  }
}

export function registerPowerIpc() {
  registerHandler(
    'power:get-keep-awake',
    createHandler(() => ({
      active: isKeepAwakeActive() || Boolean(getSetting(SETTINGS_KEYS.KEEP_AWAKE))
    }))
  )

  registerHandler(
    'power:set-keep-awake',
    createHandler((_e, { enabled }) => {
      const requested = Boolean(enabled)
      setSetting(SETTINGS_KEYS.KEEP_AWAKE, requested)
      setKeepAwake(requested)
      return { active: isKeepAwakeActive() || requested }
    })
  )
}
