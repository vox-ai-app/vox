import { EMPTY_CHAT_STATUS } from '../../utils/chat.constants'

export const toChatStatusState = (status) => ({
  ...EMPTY_CHAT_STATUS,
  ...(status || {})
})
