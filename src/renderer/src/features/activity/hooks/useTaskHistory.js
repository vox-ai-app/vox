import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTaskCache } from '../../../shared/hooks/useChat'
import { computeEffectiveStatus, TERMINAL_STATUSES, RUNNING_STATUSES } from '../utils/task.utils'
import {
  clearLegacyTaskHistoryCache,
  getTaskHistoryStorageKey,
  readTaskHistoryCache,
  writeTaskHistoryCache
} from '../utils/activity.storage'

const PAGE_SIZE = 20
const HISTORICAL_POLL_MS = 30000

function normalizeHistoricalTask(row) {
  const ts = row.created_at || new Date().toISOString()
  const doneAt = row.completed_at || ''
  const isFailed = row.status === 'failed' || row.status === 'aborted'

  return {
    taskId: String(row.id || ''),
    status: String(row.status || 'running'),
    completedCount: 0,
    currentPlan: row.current_plan || '',
    message: row.abort_reason || '',
    resultPreview: '',
    spawnRequestedAt: ts,
    spawnedAt: ts,
    startedAt: ts,
    completedAt: isFailed ? '' : doneAt,
    failedAt: isFailed ? doneAt : '',
    spawnInstructions: row.instructions || '',
    instructions: row.instructions || '',
    spawnContext: '',
    spawnArgsPreview: '',
    history: [],
    updatedAt: doneAt || ts
  }
}

export function useTaskHistory(userId) {
  const { tasks: taskRecords } = useTaskCache()
  const historyCacheKey = getTaskHistoryStorageKey(userId)

  const [historical, setHistorical] = useState(() => readTaskHistoryCache(historyCacheKey))
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(false)

  const loadingRef = useRef(false)
  const nextOffsetIdRef = useRef(null)
  const hasMoreRef = useRef(false)
  const initialLoadDone = useRef(false)
  const historicalRef = useRef(historical)
  const taskRecordsRef = useRef(taskRecords)
  const prevTaskStatusesRef = useRef({})

  useEffect(() => {
    historicalRef.current = historical
  }, [historical])
  useEffect(() => {
    taskRecordsRef.current = taskRecords
  }, [taskRecords])

  const fetchPage = useCallback(
    async (offsetId) => {
      if (loadingRef.current) return
      loadingRef.current = true
      setLoading(true)
      try {
        const params = { limit: PAGE_SIZE }
        if (offsetId) params.offset_id = offsetId
        const res = await window.api.tasks.list(params)
        const { tasks: rows = [], has_more, next_offset_id } = res || {}
        const normalized = rows.map(normalizeHistoricalTask)

        let next
        if (offsetId) {
          const existingIds = new Set(historicalRef.current.map((t) => t.taskId))
          const fresh = normalized.filter((t) => !existingIds.has(t.taskId))
          next = [...historicalRef.current, ...fresh]
        } else {
          const freshIds = new Set(normalized.map((t) => t.taskId))
          const kept = historicalRef.current.filter((t) => !freshIds.has(t.taskId))
          next = [...normalized, ...kept]
        }

        setHistorical(next)
        if (!offsetId) writeTaskHistoryCache(historyCacheKey, next)
        setHasMore(!!has_more)
        hasMoreRef.current = !!has_more
        if (offsetId || !nextOffsetIdRef.current) {
          nextOffsetIdRef.current = next_offset_id || null
        }
        // eslint-disable-next-line no-empty
      } catch {
      } finally {
        loadingRef.current = false
        setLoading(false)
      }
    },
    [historyCacheKey]
  )

  useEffect(() => {
    clearLegacyTaskHistoryCache()

    const cached = readTaskHistoryCache(historyCacheKey)
    setHistorical(cached)
    historicalRef.current = cached
    setHasMore(false)
    hasMoreRef.current = false
    nextOffsetIdRef.current = null
    loadingRef.current = false
    setLoading(false)
    initialLoadDone.current = false
    prevTaskStatusesRef.current = {}
  }, [historyCacheKey])

  useEffect(() => {
    if (initialLoadDone.current) return
    initialLoadDone.current = true
    fetchPage(null)
  }, [fetchPage, historyCacheKey])

  const loadMore = useCallback(() => {
    if (hasMoreRef.current && nextOffsetIdRef.current) fetchPage(nextOffsetIdRef.current)
  }, [fetchPage])

  const refresh = useCallback(() => fetchPage(null), [fetchPage])

  useEffect(() => {
    const prev = prevTaskStatusesRef.current
    const next = {}
    let anyBecameTerminal = false
    for (const t of taskRecords) {
      next[t.taskId] = t.status
      const wasRunning = !prev[t.taskId] || RUNNING_STATUSES.has(prev[t.taskId])
      if (wasRunning && TERMINAL_STATUSES.has(t.status)) anyBecameTerminal = true
    }
    prevTaskStatusesRef.current = next
    if (anyBecameTerminal) {
      const timer = setTimeout(() => fetchPage(null), 1500)
      return () => clearTimeout(timer)
    }
  }, [taskRecords, fetchPage])

  useEffect(() => {
    const poll = () => {
      const liveIds = new Set(taskRecordsRef.current.map((t) => t.taskId))
      const hasStaleRunning = historicalRef.current.some(
        (t) => RUNNING_STATUSES.has(t.status) && !liveIds.has(t.taskId)
      )
      if (hasStaleRunning) fetchPage(null)
    }
    const t = setInterval(poll, HISTORICAL_POLL_MS)
    return () => clearInterval(t)
  }, [fetchPage])

  const tasks = useMemo(() => {
    const historicalMap = new Map(historical.map((t) => [t.taskId, t]))
    const liveIds = new Set(taskRecords.map((t) => t.taskId))
    const uniqueHistorical = historical.filter((t) => !liveIds.has(t.taskId))
    const mergedLive = taskRecords.map((live) => {
      const dbTask = historicalMap.get(live.taskId)
      if (!dbTask) return live
      const backfilledInstructions =
        live.spawnInstructions || live.instructions || dbTask.spawnInstructions
      const merged = {
        ...live,
        spawnInstructions: backfilledInstructions,
        instructions: backfilledInstructions,
        currentPlan: live.currentPlan || dbTask.currentPlan,
        spawnedAt: live.spawnedAt || dbTask.spawnedAt,
        completedAt: live.completedAt || dbTask.completedAt,
        failedAt: live.failedAt || dbTask.failedAt
      }
      const effectiveStatus = computeEffectiveStatus(merged.status, dbTask)
      if (effectiveStatus !== merged.status) merged.status = effectiveStatus
      return merged
    })

    return [...mergedLive, ...uniqueHistorical]
  }, [taskRecords, historical])

  return { tasks, hasMore, loading, loadMore, refresh }
}
