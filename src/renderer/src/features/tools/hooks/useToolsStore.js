import { useCallback, useEffect, useRef, useState } from 'react'

const ipc = window.electron?.ipcRenderer

const invoke = (channel, payload) => {
  if (!ipc) return Promise.resolve(null)
  return ipc.invoke(channel, payload).then((r) => {
    if (r && r.success === false) throw new Error(r.error?.message || 'Request failed')
    return r.data
  })
}

export function useToolsStore() {
  const [tools, setTools] = useState([])
  const [hasMore, setHasMore] = useState(false)
  const [cursor, setCursor] = useState(null)
  const [loading, setLoading] = useState(false)
  const [searching, setSearching] = useState(false)
  const [query, setQuery] = useState('')
  const [error, setError] = useState(null)
  const debounceRef = useRef(null)

  const fetchPage = useCallback(async (nextCursor = null, replace = false) => {
    setLoading(true)
    setError(null)
    try {
      const res = await invoke('tools:list', { cursor: nextCursor, limit: 20 })
      const items = res?.tools ?? []
      setTools((prev) => (replace ? items : [...prev, ...items]))
      setHasMore(res?.has_more ?? false)
      setCursor(res?.next_cursor ?? null)
    } catch (e) {
      setError(e?.message || 'Failed to load tools')
    } finally {
      setLoading(false)
    }
  }, [])

  const search = useCallback(
    async (q) => {
      if (!q) {
        fetchPage(null, true)
        setSearching(false)
        return
      }
      setSearching(true)
      setError(null)
      try {
        const res = await invoke('tools:search', { query: q })
        setTools(res?.tools ?? [])
        setHasMore(false)
      } catch (e) {
        setError(e?.message || 'Search failed')
      } finally {
        setSearching(false)
      }
    },
    [fetchPage]
  )

  const handleQueryChange = useCallback(
    (q) => {
      setQuery(q)
      clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => search(q), 350)
    },
    [search]
  )

  const loadMore = useCallback(() => {
    if (loading || !hasMore || query) return
    fetchPage(cursor)
  }, [loading, hasMore, cursor, query, fetchPage])

  const createTool = useCallback(async (data) => {
    const tool = await invoke('tools:create', data)
    if (!tool?.id) throw new Error('Server did not return a valid tool')
    setTools((prev) => [tool, ...prev])
    return tool
  }, [])

  const deleteTool = useCallback(async (id) => {
    let snapshot
    setTools((prev) => {
      snapshot = prev
      return prev.filter((t) => t.id !== id)
    })
    try {
      await invoke('tools:delete', { id })
    } catch (e) {
      setTools(snapshot)
      setError(e?.message || 'Failed to delete tool')
    }
  }, [])

  const toggleTool = useCallback(async (id, is_enabled) => {
    setTools((prev) => prev.map((t) => (t.id === id ? { ...t, is_enabled } : t)))
    try {
      await invoke('tools:update', { id, data: { is_enabled } })
    } catch (e) {
      setTools((prev) => prev.map((t) => (t.id === id ? { ...t, is_enabled: !is_enabled } : t)))
      setError(e?.message || 'Failed to update tool')
    }
  }, [])

  const updateTool = useCallback(async (id, data) => {
    const tool = await invoke('tools:update', { id, data })
    setTools((prev) => prev.map((t) => (t.id === id ? { ...t, ...tool } : t)))
    return tool
  }, [])

  useEffect(() => {
    fetchPage(null, true)
  }, [fetchPage])

  return {
    tools,
    hasMore,
    loading,
    searching,
    query,
    error,
    handleQueryChange,
    loadMore,
    fetchPage,
    createTool,
    updateTool,
    deleteTool,
    toggleTool
  }
}

export function useMcpStore() {
  const [servers, setServers] = useState([])
  const [loading, setLoading] = useState(false)
  const [syncing, setSyncing] = useState(null)
  const [error, setError] = useState(null)
  const [syncErrors, setSyncErrors] = useState({})

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await invoke('mcp:list')
      setServers(res?.servers ?? [])
    } catch (e) {
      setError(e?.message || 'Failed to load MCP servers')
    } finally {
      setLoading(false)
    }
  }, [])

  const create = useCallback(async (data) => {
    const s = await invoke('mcp:create', data)
    setServers((prev) => [...prev, s])
    return s
  }, [])

  const remove = useCallback(async (id) => {
    let snapshot
    setServers((prev) => {
      snapshot = prev
      return prev.filter((s) => s.id !== id)
    })
    try {
      await invoke('mcp:delete', { id })
    } catch (e) {
      setServers(snapshot)
      setError(e?.message || 'Failed to remove server')
    }
  }, [])

  const update = useCallback(async (id, data) => {
    const s = await invoke('mcp:update', { id, data })
    setServers((prev) => prev.map((srv) => (srv.id === id ? s : srv)))
    return s
  }, [])

  const sync = useCallback(
    async (id, onSynced) => {
      setSyncing(id)
      setSyncErrors((prev) => {
        const next = { ...prev }
        delete next[id]
        return next
      })
      try {
        await invoke('mcp:sync', { id })
        onSynced?.()
      } catch (e) {
        setSyncErrors((prev) => ({ ...prev, [id]: e?.message || 'Sync failed' }))
      } finally {
        setSyncing(null)
        load()
      }
    },
    [load]
  )

  useEffect(() => {
    load()
  }, [load])

  return { servers, loading, syncing, error, syncErrors, create, remove, update, sync }
}
