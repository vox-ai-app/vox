import {
  createVoiceWindow as _create,
  destroyVoiceWindow as _destroy,
  getVoiceWindow as _getVoiceWindow
} from '@vox-ai-app/voice/window'

export { _destroy as destroyVoiceWindow }
export { _getVoiceWindow as getVoiceWindow }

export function createVoiceWindow() {
  return _create()
}
