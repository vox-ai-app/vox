import { useCallback, useEffect, useReducer, useRef } from 'react'
import { TERMINAL_STATUSES, RUNNING_STATUSES } from '../utils/task.utils'

const RUNNING_POLL_MS = 5000

const initialState = { fetched: null, loading: false, error: '' }

function reducer(state, action) {
  switch (action.type) {
    case 'start':
      return { fetched: null, loading: true, error: '' }
    case 'success':
      return { fetched: action.payload, loading: false, error: '' }
    case 'error':
      return { ...state, loading: false, error: action.error }
    case 'silent_success':
      return { ...state, fetched: action.payload }
    default:
      return state
  }
}

export function useTaskDetail(taskId, liveStatus) {
  const [state, dispatch] = useReducer(reducer, initialState)

  const doFetch = useCallback(
    (id, { silent = false } = {}) => {
      if (!id) return () => {}
      let cancelled = false
      if (!silent) dispatch({ type: 'start' })
      window.api.tasks
        .get(id)
        .then((data) => {
          if (cancelled) return
          dispatch({
            type: silent ? 'silent_success' : 'success',
            payload: data?.task || null
          })
        })
        .catch((err) => {
          if (cancelled) return
          if (!silent) dispatch({ type: 'error', error: err?.message || 'Could not load task.' })
        })
      return () => {
        cancelled = true
      }
    },
    [dispatch]
  )

  useEffect(() => {
    return doFetch(taskId)
  }, [taskId, doFetch])

  useEffect(() => {
    const effectiveStatus = liveStatus || state.fetched?.status
    if (!taskId || !RUNNING_STATUSES.has(effectiveStatus)) return
    const t = setInterval(() => doFetch(taskId, { silent: true }), RUNNING_POLL_MS)
    return () => clearInterval(t)
  }, [liveStatus, state.fetched?.status, taskId, doFetch])

  const prevStatus = useRef(null)
  useEffect(() => {
    const prev = prevStatus.current
    prevStatus.current = liveStatus
    const wasRunning = !prev || prev === 'running' || prev === 'spawned'
    const isNowTerminal = TERMINAL_STATUSES.has(liveStatus)
    if (wasRunning && isNowTerminal && taskId) {
      const t = setTimeout(() => doFetch(taskId, { silent: true }), 800)
      return () => clearTimeout(t)
    }
  }, [liveStatus, taskId, doFetch])

  return state
}
