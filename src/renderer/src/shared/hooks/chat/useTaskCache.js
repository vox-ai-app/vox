import { useCallback, useEffect, useRef, useState } from 'react'

export const useTaskCache = () => {
  const [tasks, setTasks] = useState([])
  const [isReady, setIsReady] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState(null)

  const tasksRef = useRef(tasks)
  const hasMoreRef = useRef(hasMore)
  const loadingMoreRef = useRef(false)

  useEffect(() => {
    tasksRef.current = tasks
  }, [tasks])
  useEffect(() => {
    hasMoreRef.current = hasMore
  }, [hasMore])

  const initializeCache = useCallback(async () => {
    try {
      setError(null)
      await window.api?.chat?.ensureConnected?.().catch(() => {})

      const data = await window.api?.tasks?.getCachedTasks?.()
      if (data?.tasks?.length) {
        setTasks(data.tasks)
        setIsReady(true)
      } else {
        try {
          await window.api?.tasks?.loadAndCache?.({ limit: 50 })
          const retryData = await window.api?.tasks?.getCachedTasks?.()
          setTasks(retryData?.tasks || [])
        } catch {
          setTasks([])
        }
        setIsReady(true)
      }
    } catch (err) {
      console.warn('[useTaskCache] Failed to load tasks:', err)
      setError(err?.message || 'Failed to load tasks')
      setTasks([])
      setIsReady(true)
    }
  }, [])

  useEffect(() => {
    if (!window.api?.chat?.onEvent) {
      console.warn('[useTaskCache] Chat API not available')
      setIsReady(true)
      return
    }

    const unsubEvent = window.api.chat.onEvent((event) => {
      const type = event?.type
      const data = event?.data

      switch (type) {
        case 'task:append':
          if (data?.task) {
            setTasks((prev) => [data.task, ...prev.filter((t) => t.taskId !== data.task.taskId)])
          }
          break

        case 'task:updated':
          if (data?.task) {
            setTasks((prev) => {
              const idx = prev.findIndex((t) => t.taskId === data.task.taskId)
              if (idx >= 0) {
                return [...prev.slice(0, idx), data.task, ...prev.slice(idx + 1)]
              }
              return [data.task, ...prev]
            })
          }
          break

        case 'tasks:replace-all':
          if (Array.isArray(data?.tasks)) {
            setTasks(data.tasks)
            setIsReady(true)
          }
          if (typeof data?.hasMore === 'boolean') setHasMore(data.hasMore)
          break

        case 'tasks:appended':
          if (Array.isArray(data?.tasks) && data.tasks.length > 0) {
            setTasks((prev) => {
              const existingIds = new Set(prev.map((t) => t.taskId))
              const fresh = data.tasks.filter((t) => !existingIds.has(t.taskId))
              return fresh.length > 0 ? [...prev, ...fresh] : prev
            })
          }
          if (typeof data?.hasMore === 'boolean') setHasMore(data.hasMore)
          break
      }
    })

    initializeCache()
    return unsubEvent
  }, [initializeCache])

  const loadMore = useCallback(async () => {
    if (loadingMoreRef.current || !hasMoreRef.current) return
    loadingMoreRef.current = true
    setLoadingMore(true)

    try {
      const currentTasks = tasksRef.current
      const lastTask = currentTasks[currentTasks.length - 1]
      const offsetId = lastTask?.taskId || lastTask?.id
      if (!offsetId) {
        setHasMore(false)
        return
      }

      await window.api?.tasks?.loadAndCache?.({ limit: 50, offset_id: offsetId })
    } catch (err) {
      setError(err?.message || 'Failed to load more tasks')
    } finally {
      loadingMoreRef.current = false
      setLoadingMore(false)
    }
  }, [])

  return {
    tasks,
    isReady,
    hasMore,
    loadingMore,
    error,
    refresh: initializeCache,
    loadMore
  }
}
