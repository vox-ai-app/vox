import { emitAll } from '../ipc/shared'
import { getLlmStatus } from '../ai/llm.bridge'
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
  return getLlmStatus().ready
}

export async function initVoiceService() {
  await _init({
    onActivate: () => {
      if (!canActivate()) {
        logger.info('[voice] Activation ignored — model not ready')
        return false
      }
      emitAll('voice:activate', { active: true })
      return true
    }
  })
}

export async function destroyVoiceService() {
  await _destroy()
}

export { pauseWakeWord, resumeWakeWord }
