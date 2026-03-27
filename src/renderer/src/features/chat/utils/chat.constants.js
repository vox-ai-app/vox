export const CHAT_STORAGE_KEY_PREFIX = 'vox.workspace.chat.messages.v1'
export const MAX_STORED_MESSAGES = 400
export const MAX_ACTIVITY_ITEMS = 180
export const MAX_TASK_ITEMS = 28
export const MAX_DETAIL_LENGTH = 260
export const MAX_TASK_HISTORY_ITEMS = 20
export const MAX_INSPECT_PAYLOAD_LENGTH = 12000

export const EMPTY_CHAT_STATUS = {
  state: 'idle',
  connected: false,
  sessionReady: false,
  mode: 'text',
  queuedMessages: 0,
  lastError: null
}
