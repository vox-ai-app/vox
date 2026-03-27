import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import { EMPTY_CHAT_STATUS } from '../utils/chat.constants'
import { toChatStatusState } from './runtime/chat.runtime'
import { PHASE } from './store/constants'
import { toolLabel } from '../../activity/utils/task.utils'

const useChatStore = create(
  subscribeWithSelector((set, get) => {
    const session = {
      activeTaskId: null,
      activeStreamId: null,
      abortTimeout: null
    }
    let _unsubs = []

    const handlePhaseEvent = (event) => {
      if (!event || typeof event !== 'object') return
      const type = event.type
      const data = event?.data

      if (type === 'abort_initiated') {
        if (get().phase !== PHASE.IDLE) {
          set({ phase: PHASE.ABORTING })
          if (session.abortTimeout) clearTimeout(session.abortTimeout)
          session.abortTimeout = setTimeout(() => {
            if (get().phase === PHASE.ABORTING) {
              set({ phase: PHASE.IDLE, streamStatus: '' })
              session.activeStreamId = null
            }
            session.abortTimeout = null
          }, 5000)
        }
        return
      }

      if (type === 'transcript' && data?.content) {
        if (String(data.content).trim() && get().phase === PHASE.IDLE) {
          set({ phase: PHASE.SENDING, streamStatus: 'Thinking...', sendError: '' })
        }
        return
      }

      if (type === 'chunk_start') {
        session.activeStreamId = event?.streamId || data?.id
        if (get().phase !== PHASE.ABORTING) {
          set({ streamStatus: 'Thinking...', phase: PHASE.STREAMING })
        }
        return
      }

      if (type === 'chunk_end') {
        const streamId = event?.streamId || data?.id
        if (streamId !== session.activeStreamId) return
        session.activeStreamId = null
        if (session.abortTimeout) {
          clearTimeout(session.abortTimeout)
          session.abortTimeout = null
        }
        set({ phase: PHASE.IDLE, streamStatus: '' })
        return
      }

      if (type === 'tool_call' && !data?.taskId) {
        set({ streamStatus: `${toolLabel(data?.name)}...` })
        if (get().phase === PHASE.IDLE) {
          set({ phase: PHASE.STREAMING })
        }
        return
      }

      if (type === 'task.status') {
        const rawTaskId = data?.taskId
        const status = String(data?.status || 'updated').toLowerCase()
        const isTerminal = ['completed', 'failed', 'aborted', 'incomplete'].includes(status)

        if (rawTaskId && !isTerminal) {
          session.activeTaskId = rawTaskId
        }

        if (isTerminal) {
          const wasActiveTask = session.activeTaskId === rawTaskId
          if (wasActiveTask) session.activeTaskId = null
          set({ streamStatus: '' })
          if (wasActiveTask) {
            const isAborted = status === 'aborted'
            if (isAborted || !session.activeStreamId) {
              if (isAborted) session.activeStreamId = null
              if (session.abortTimeout) {
                clearTimeout(session.abortTimeout)
                session.abortTimeout = null
              }
              set({ phase: PHASE.IDLE })
            }
          }
        }
        return
      }

      if (type === 'error') {
        set({
          sendError: data?.message || 'Chat request failed.',
          phase: PHASE.IDLE,
          streamStatus: ''
        })
        session.activeStreamId = null
        if (session.abortTimeout) {
          clearTimeout(session.abortTimeout)
          session.abortTimeout = null
        }
      }
    }

    return {
      phase: PHASE.IDLE,
      chatStatus: EMPTY_CHAT_STATUS,
      streamStatus: '',
      sendError: '',

      clearSendError: () => set({ sendError: '' }),

      sendMessage: async (rawContent) => {
        const content = String(rawContent || '').trim()
        if (!content) return { success: false }

        const s = get()
        if (s.phase !== PHASE.IDLE) {
          await get().abortCurrentTask()
        }

        if (session.abortTimeout) {
          clearTimeout(session.abortTimeout)
          session.abortTimeout = null
        }

        set({ phase: PHASE.SENDING, streamStatus: 'Thinking...', sendError: '' })
        session.activeStreamId = null
        session.activeTaskId = null

        try {
          await window.api.chat.sendMessage(content)
        } catch (error) {
          set({
            sendError: error?.message || 'Failed to send message.',
            phase: PHASE.IDLE,
            streamStatus: ''
          })
        }
      },

      abortTask: async (taskId) => {
        const id = String(taskId || '').trim()
        if (!id) return { success: false }
        return window.api.tasks.abort(id)
      },

      abortCurrentTask: async () => {
        if (get().phase === PHASE.IDLE) return { success: true }

        set({ phase: PHASE.ABORTING })

        if (session.abortTimeout) clearTimeout(session.abortTimeout)
        session.abortTimeout = setTimeout(() => {
          if (get().phase === PHASE.ABORTING) {
            set({ phase: PHASE.IDLE, streamStatus: '' })
            session.activeStreamId = null
          }
          session.abortTimeout = null
        }, 5000)

        window.api.chat.abort().catch(() => {})
        const id = session.activeTaskId
        if (!id) return { success: true }
        return get().abortTask(id)
      },

      resumeTask: async (taskId) => {
        const id = String(taskId || '').trim()
        if (!id) return { success: false }
        return window.api.tasks.resume(id)
      },

      init: async () => {
        if (_unsubs.length > 0) return

        const unsubEvent = window.api.chat.onEvent((event) => {
          handlePhaseEvent(event)
        })
        _unsubs.push(unsubEvent)

        const unsubStatus = window.api.chat.onStatus((status) => {
          const nextStatus = toChatStatusState(status)
          set({ chatStatus: nextStatus })

          if (nextStatus.state === 'error' || nextStatus.state === 'idle') {
            if (get().phase !== PHASE.IDLE) {
              set({ phase: PHASE.IDLE, streamStatus: '' })
            }
            return
          }

          if (nextStatus.sessionReady) {
            set({ streamStatus: '' })
          }
        })
        _unsubs.push(unsubStatus)

        try {
          const statusData = await window.api.chat.getStatus()
          set({ chatStatus: toChatStatusState(statusData?.status) })
          // eslint-disable-next-line no-empty
        } catch {}

        try {
          const connectData = await window.api.chat.ensureConnected()
          const nextStatus = toChatStatusState(connectData?.status)
          set({ chatStatus: nextStatus })

          if (nextStatus.sessionReady) {
            set({ streamStatus: '' })
          }
        } catch (error) {
          set({ sendError: error?.message || 'Unable to connect to chat.' })
        }
      },

      destroy: () => {
        for (const unsub of _unsubs) {
          if (typeof unsub === 'function') unsub()
        }
        _unsubs = []
        if (session.abortTimeout) clearTimeout(session.abortTimeout)

        session.activeTaskId = null
        session.activeStreamId = null
        session.abortTimeout = null

        set({
          phase: PHASE.IDLE,
          chatStatus: EMPTY_CHAT_STATUS,
          streamStatus: '',
          sendError: ''
        })
      }
    }
  })
)

export { PHASE }

export default useChatStore
