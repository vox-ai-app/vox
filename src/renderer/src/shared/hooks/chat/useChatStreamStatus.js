import { useEffect, useRef, useState } from 'react'

const ABORT_TIMEOUT_MS = 5000

export const useChatStreamStatus = () => {
  const [phase, setPhase] = useState('idle')
  const [streamStatus, setStreamStatus] = useState(null)
  const phaseRef = useRef('idle')
  const abortTimerRef = useRef(null)

  useEffect(() => {
    phaseRef.current = phase
  }, [phase])

  useEffect(() => {
    if (!window.api?.chat?.onEvent) return

    const clearAbortTimer = () => {
      if (abortTimerRef.current) {
        clearTimeout(abortTimerRef.current)
        abortTimerRef.current = null
      }
    }

    const unsubStatus = window.api.chat.onStatus?.((status) => {
      if (status?.state === 'error' || status?.state === 'idle') {
        if (phaseRef.current !== 'idle') {
          clearAbortTimer()
          setPhase('idle')
          setStreamStatus(null)
        }
      }
    })

    const unsubEvent = window.api.chat.onEvent((event) => {
      const type = event?.type
      const data = event?.data

      switch (type) {
        case 'msg:append':
          if (data?.message?.role === 'assistant' && data?.message?.pending) {
            setPhase('streaming')
            setStreamStatus('streaming')
          }
          break
        case 'msg:stream-chunk':
          setPhase('streaming')
          setStreamStatus('streaming')
          break
        case 'msg:complete':
          clearAbortTimer()
          setPhase('idle')
          setStreamStatus('complete')
          break
        case 'user_message':
          setPhase('sending')
          setStreamStatus('sending')
          break
        case 'abort_initiated':
          setPhase('aborting')
          setStreamStatus('aborting')
          clearAbortTimer()
          abortTimerRef.current = setTimeout(() => {
            abortTimerRef.current = null
            if (phaseRef.current === 'aborting') {
              setPhase('idle')
              setStreamStatus(null)
            }
          }, ABORT_TIMEOUT_MS)
          break
        case 'chunk_start':
          setPhase('streaming')
          setStreamStatus('streaming')
          break
        case 'chunk_end':
          clearAbortTimer()
          setPhase('idle')
          setStreamStatus('complete')
          break
        case 'task_spawn':
          if (phaseRef.current === 'streaming' || phaseRef.current === 'sending') {
            setStreamStatus('task-running')
          }
          break
        case 'task.status': {
          const status = String(data?.status || '').toLowerCase()
          const isTerminal = ['completed', 'failed', 'aborted', 'incomplete'].includes(status)
          if (isTerminal) {
            clearAbortTimer()
            setPhase('idle')
            setStreamStatus('complete')
          }
          break
        }
        case 'error':
          clearAbortTimer()
          setPhase('idle')
          setStreamStatus('error')
          break
        case 'tool_call':
          if (!data?.taskId && phaseRef.current === 'idle') {
            setPhase('streaming')
            setStreamStatus('streaming')
          }
          break
      }
    })

    return () => {
      clearAbortTimer()
      unsubEvent?.()
      unsubStatus?.()
    }
  }, [])

  return { phase, streamStatus }
}
