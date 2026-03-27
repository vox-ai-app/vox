import { useCallback, useEffect, useRef, useState } from 'react'

export const useMessageCache = () => {
  const [messages, setMessages] = useState([])
  const [isReady, setIsReady] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [error, setError] = useState(null)

  const pendingDeltas = useRef({})
  const rafRef = useRef(null)
  const prependCountRef = useRef(0)

  const flushDeltas = useCallback(() => {
    rafRef.current = null
    const entries = Object.entries(pendingDeltas.current)
    if (entries.length === 0) return
    pendingDeltas.current = {}

    setMessages((prev) => {
      let next = prev
      for (const [streamId, text] of entries) {
        const idx = next.findLastIndex((m) => m.streamId === streamId)
        if (idx === -1) continue
        const updated = { ...next[idx], content: next[idx].content + text }
        next = [...next.slice(0, idx), updated, ...next.slice(idx + 1)]
      }
      return next
    })
  }, [])

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [])

  const initializeCache = useCallback(async () => {
    try {
      setError(null)
      const data = await window.api?.chat?.getMessages?.()
      if (data?.messages?.length) {
        setMessages(data.messages)
        if (typeof data.hasMore === 'boolean') setHasMore(data.hasMore)
        setIsReady(true)
      } else {
        setMessages([])
        setIsReady(true)
        window.api?.chat?.ensureConnected?.().catch(() => {})
      }
    } catch (err) {
      console.warn('[useMessageCache] Failed to load initial messages:', err)
      setError(err?.message || 'Failed to load messages')
      setMessages([])
      setIsReady(true)
    }
  }, [])

  useEffect(() => {
    if (!window.api?.chat?.onEvent) {
      console.warn('[useMessageCache] Chat API not available')
      setIsReady(true)
      return
    }

    const unsubEvent = window.api.chat.onEvent((event) => {
      const type = event?.type
      const data = event?.data

      switch (type) {
        case 'msg:append':
          if (data?.message) {
            setMessages((prev) => [...prev, data.message])
          }
          break

        case 'msg:stream-chunk':
          if (data?.streamId && data?.content) {
            pendingDeltas.current[data.streamId] =
              (pendingDeltas.current[data.streamId] || '') + data.content
            if (!rafRef.current) {
              rafRef.current = requestAnimationFrame(flushDeltas)
            }
          }
          break

        case 'msg:complete':
          if (data?.streamId) {
            if (pendingDeltas.current[data.streamId]) {
              if (rafRef.current) {
                cancelAnimationFrame(rafRef.current)
                rafRef.current = null
              }
              flushDeltas()
            }
            setMessages((prev) =>
              prev.map((m) =>
                m.streamId === data.streamId
                  ? { ...m, pending: false, streamId: null, dbId: data.dbId || m.dbId }
                  : m
              )
            )
          }
          break

        case 'msg:prepend':
          if (Array.isArray(data?.messages) && data.messages.length > 0) {
            prependCountRef.current += data.messages.length
            setMessages((prev) => [...data.messages, ...prev])
          }
          if (typeof data?.hasMore === 'boolean') setHasMore(data.hasMore)
          break

        case 'msg:replace-all':
          if (Array.isArray(data?.messages)) {
            prependCountRef.current = 0
            setMessages(data.messages)
            setIsReady(true)
          }
          if (typeof data?.hasMore === 'boolean') setHasMore(data.hasMore)
          break

        case 'abort_initiated':
          if (rafRef.current) {
            cancelAnimationFrame(rafRef.current)
            rafRef.current = null
          }
          flushDeltas()
          setMessages((prev) => {
            const hasPending = prev.some((m) => m.pending)
            if (!hasPending) return prev
            return prev.map((m) => (m.pending ? { ...m, pending: false, streamId: null } : m))
          })
          break
      }
    })

    initializeCache()

    const safetyTimer = setTimeout(() => {
      setIsReady((prev) => prev || true)
    }, 8000)

    return () => {
      clearTimeout(safetyTimer)
      unsubEvent?.()
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [initializeCache, flushDeltas])

  const loadOlder = useCallback(async () => {
    if (loadingOlder || !hasMore) return
    setLoadingOlder(true)

    try {
      const oldest = messages.find((m) => m.dbId)
      if (!oldest?.dbId) {
        setHasMore(false)
        return
      }

      await window.api?.chat?.loadOlder?.(oldest.dbId)
    } catch {
      setHasMore(false)
    } finally {
      setLoadingOlder(false)
    }
  }, [loadingOlder, hasMore, messages])

  return {
    messages,
    isReady,
    hasMore,
    loadingOlder,
    loadOlder,
    error,
    refresh: initializeCache,
    prependCount: prependCountRef.current
  }
}
