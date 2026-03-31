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
    let _safetyTimer = null

    const msgBatch = {
      pendingDeltas: {},
      rafId: null
    }

    const flushDeltas = () => {
      msgBatch.rafId = null
      const entries = Object.entries(msgBatch.pendingDeltas)
      if (entries.length === 0) return
      msgBatch.pendingDeltas = {}

      set((state) => {
        let next = state.messages
        for (const [streamId, text] of entries) {
          const idx = next.findLastIndex((m) => m.streamId === streamId)
          if (idx === -1) continue
          const updated = { ...next[idx], content: next[idx].content + text }
          next = [...next.slice(0, idx), updated, ...next.slice(idx + 1)]
        }
        return { messages: next }
      })
    }

    const handleMessageEvent = (event) => {
      const type = event?.type
      const data = event?.data

      switch (type) {
        case 'msg:append':
          if (data?.message) {
            set((state) => ({ messages: [...state.messages, data.message] }))
          }
          break

        case 'msg:stream-chunk':
          if (data?.streamId && data?.content) {
            msgBatch.pendingDeltas[data.streamId] =
              (msgBatch.pendingDeltas[data.streamId] || '') + data.content
            if (!msgBatch.rafId) {
              msgBatch.rafId = requestAnimationFrame(flushDeltas)
            }
          }
          break

        case 'msg:complete':
          if (data?.streamId) {
            if (msgBatch.pendingDeltas[data.streamId]) {
              if (msgBatch.rafId) {
                cancelAnimationFrame(msgBatch.rafId)
                msgBatch.rafId = null
              }
              flushDeltas()
            }
            set((state) => {
              const hasMatch = state.messages.some((m) => m.streamId === data.streamId)
              if (hasMatch) {
                return {
                  messages: state.messages.map((m) =>
                    m.streamId === data.streamId
                      ? { ...m, pending: false, streamId: null, dbId: data.dbId || m.dbId }
                      : m
                  )
                }
              }
              if (data.recovery && !state.messages.some((m) => m.dbId === data.recovery.dbId)) {
                return { messages: [...state.messages, data.recovery] }
              }
              return {}
            })
          }
          break

        case 'msg:prepend':
          if (Array.isArray(data?.messages) && data.messages.length > 0) {
            set((state) => ({
              messages: [...data.messages, ...state.messages],
              prependCount: state.prependCount + data.messages.length,
              ...(typeof data.hasMore === 'boolean' ? { hasMore: data.hasMore } : {})
            }))
          } else if (typeof data?.hasMore === 'boolean') {
            set({ hasMore: data.hasMore })
          }
          break

        case 'msg:replace-all':
          if (Array.isArray(data?.messages)) {
            set({
              messages: data.messages,
              prependCount: 0,
              isReady: true,
              ...(typeof data.hasMore === 'boolean' ? { hasMore: data.hasMore } : {})
            })
          }
          break

        case 'abort_initiated':
          if (msgBatch.rafId) {
            cancelAnimationFrame(msgBatch.rafId)
            msgBatch.rafId = null
          }
          flushDeltas()
          set((state) => {
            if (!state.messages.some((m) => m.pending)) return {}
            return {
              messages: state.messages.map((m) =>
                m.pending ? { ...m, pending: false, streamId: null } : m
              )
            }
          })
          break
      }
    }

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
      messages: [],
      hasMore: true,
      isReady: false,
      prependCount: 0,
      loadingOlder: false,

      clearSendError: () => set({ sendError: '' }),

      loadOlder: async () => {
        const state = get()
        if (state.loadingOlder || !state.hasMore) return
        set({ loadingOlder: true })
        try {
          const oldest = state.messages.find((m) => m.dbId)
          if (!oldest?.dbId) {
            set({ hasMore: false, loadingOlder: false })
            return
          }
          await window.api?.chat?.loadOlder?.(oldest.dbId)
        } catch {
          set({ hasMore: false })
        } finally {
          set({ loadingOlder: false })
        }
      },

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
          handleMessageEvent(event)
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
          const data = await window.api?.chat?.getMessages?.()
          if (data?.messages?.length) {
            set({
              messages: data.messages,
              hasMore: typeof data.hasMore === 'boolean' ? data.hasMore : true,
              isReady: true
            })
          } else {
            set({ messages: [], isReady: true })
            window.api?.chat?.ensureConnected?.().catch(() => {})
          }
        } catch {
          set({ messages: [], isReady: true })
        }

        _safetyTimer = setTimeout(() => {
          if (!get().isReady) set({ isReady: true })
          _safetyTimer = null
        }, 8000)

        try {
          const statusData = await window.api.chat.getStatus()
          set({ chatStatus: toChatStatusState(statusData?.status) })
        } catch {
          /* status check is best-effort */
        }

        try {
          const connectData = await window.api.chat.ensureConnected()
          const nextStatus = toChatStatusState(connectData?.status)
          set({ chatStatus: nextStatus })
          if (nextStatus.sessionReady) set({ streamStatus: '' })
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
        if (_safetyTimer) {
          clearTimeout(_safetyTimer)
          _safetyTimer = null
        }
        if (msgBatch.rafId) {
          cancelAnimationFrame(msgBatch.rafId)
          msgBatch.rafId = null
        }
        msgBatch.pendingDeltas = {}

        session.activeTaskId = null
        session.activeStreamId = null
        session.abortTimeout = null

        set({
          phase: PHASE.IDLE,
          chatStatus: EMPTY_CHAT_STATUS,
          streamStatus: '',
          sendError: '',
          messages: [],
          hasMore: true,
          isReady: false,
          prependCount: 0,
          loadingOlder: false
        })
      }
    }
  })
)

export { PHASE }

export default useChatStore
