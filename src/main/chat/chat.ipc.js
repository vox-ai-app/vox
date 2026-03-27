import { registerHandler, createHandler } from '../ipc/shared'
import {
  sendMessage,
  abort,
  clearConversation,
  getStoredMessages,
  getChatStatus
} from './chat.session'
import { getAllTasks, abortTask, getTask } from './task.queue'

export function registerChatIpc() {
  registerHandler(
    'chat:send-message',
    createHandler(async (_e, payload) => sendMessage(payload || {}))
  )

  registerHandler(
    'chat:abort',
    createHandler(() => {
      abort()
      return { aborted: true }
    })
  )

  registerHandler(
    'chat:clear',
    createHandler(async () => clearConversation())
  )

  registerHandler(
    'chat:get-messages',
    createHandler(() => ({ messages: getStoredMessages() }))
  )

  registerHandler(
    'chat:get-status',
    createHandler(() => getChatStatus())
  )

  registerHandler(
    'tasks:list',
    createHandler(() => getAllTasks())
  )

  registerHandler(
    'tasks:get',
    createHandler((_e, { taskId }) => getTask(taskId))
  )

  registerHandler(
    'tasks:abort',
    createHandler((_e, { taskId }) => {
      abortTask(taskId)
      return { aborted: true }
    })
  )
}
