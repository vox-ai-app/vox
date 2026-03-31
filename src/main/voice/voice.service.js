import { emitAll } from '../ipc/shared'
import { getLlmStatus } from '../ai/llm.bridge'
import { isReady as isSttReady } from './stt.service'
import { logger } from '../logger'
import {
  initVoiceService as _init,
  destroyVoiceService as _destroy,
  pauseWakeWord,
  resumeWakeWord,
  setOnError,
  setLogger as setVoiceLogger
} from '@vox-ai-app/voice'

setVoiceLogger(logger)

setOnError((err) => {
  logger.error('[voice] Wake word error:', err)
})

function canActivate() {
  return getLlmStatus().ready && isSttReady()
}

export async function initVoiceService() {
  await _init({
    onActivate: () => {
      if (!canActivate()) return false
      emitAll('voice:activate', { active: true })
      return true
    }
  })
}

export async function destroyVoiceService() {
  await _destroy()
}

export { pauseWakeWord, resumeWakeWord }
