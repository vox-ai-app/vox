import { useEffect, useRef, useState } from 'react'

export const useActivityCache = () => {
  const hasApi = Boolean(window.api?.tasks?.getCachedActivity)
  const [activity, setActivity] = useState([])
  const [isReady, setIsReady] = useState(!hasApi)
  const isReadyRef = useRef(isReady)

  useEffect(() => {
    isReadyRef.current = isReady
  }, [isReady])

  useEffect(() => {
    if (!hasApi) return
    let cancelled = false

    window.api.tasks
      .getCachedActivity()
      .then((data) => {
        if (cancelled) return
        setActivity(data?.activity || [])
        setIsReady(true)
      })
      .catch(() => {
        if (cancelled) return
        setActivity([])
        setIsReady(true)
      })

    if (!window.api?.chat?.onEvent) return

    const unsubEvent = window.api.chat.onEvent((event) => {
      const type = event?.type
      const data = event?.data

      switch (type) {
        case 'task:append':
        case 'task:updated':
        case 'task:activity':
          if (data?.activity) {
            setActivity((prev) => [data.activity, ...prev])
          }
          break

        case 'tasks:replace-all':
          if (Array.isArray(data?.activity)) {
            setActivity(data.activity)
            if (!isReadyRef.current) setIsReady(true)
          }
          break

        case 'tool_call':
        case 'tool_result':
        case 'agent.thinking':
        case 'task.progress':
          if (data?.taskId) {
            setActivity((prev) => [
              {
                id: `live-${Date.now()}-${Math.random().toString(36).slice(2)}`,
                taskId: data.taskId,
                type,
                name: data.name || null,
                rawResult: data.result || null,
                timestamp: new Date().toISOString(),
                data
              },
              ...prev
            ])
          }
          break
      }
    })

    return () => {
      cancelled = true
      unsubEvent?.()
    }
  }, [hasApi])

  return {
    activity,
    isReady
  }
}
