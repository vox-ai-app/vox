import { useMemo } from 'react'
import { useTaskDetail } from './useTaskDetail'
import {
  elapsedLabel,
  mergeSteps,
  computeEffectiveStatus,
  TASK_STATUS_COLOR,
  TASK_STATUS_LABEL
} from '../utils/task.utils'

function getLastProgressTime(taskEvents, isRunning) {
  if (!isRunning) return null
  const progressEvents = taskEvents.filter((event) => event.type === 'task.progress')
  if (!progressEvents.length) return null
  const lastEvent = progressEvents[progressEvents.length - 1]
  return lastEvent?.at || lastEvent?.timestamp || null
}

function getLatestThought(taskEvents, isRunning) {
  if (!isRunning) return ''
  return String(
    taskEvents.findLast((event) => event.type === 'agent.thinking')?.data?.thought || ''
  ).trim()
}

function buildGroupedPairs(taskEvents, lastProgressTime, isRunning) {
  if (!isRunning) return []

  const calls = taskEvents.filter((event) => {
    if (event.type !== 'tool_call' && event.type !== 'task.request') return false
    if (!lastProgressTime) return true
    const eventTime = event.at || event.timestamp
    return eventTime && eventTime > lastProgressTime
  })

  const results = taskEvents.filter((event) => {
    if (event.type !== 'tool_result') return false
    if (!lastProgressTime) return true
    const eventTime = event.at || event.timestamp
    return eventTime && eventTime > lastProgressTime
  })

  const usedResultIds = new Set()
  const groups = []

  for (const call of calls) {
    const callName = call.name || call.data?.name || ''
    const matchedResult = results.find(
      (result) => !usedResultIds.has(result.id) && (result.name || result.data?.name) === callName
    )
    if (matchedResult) usedResultIds.add(matchedResult.id)

    const pair = { call, result: matchedResult || null }
    const rawResult = pair.result?.rawResult
    const exitCode = rawResult && typeof rawResult === 'object' ? rawResult.exitCode : undefined
    const isFailing = exitCode !== undefined && exitCode !== 0

    const lastGroup = groups[groups.length - 1]
    const lastName = lastGroup?.call?.name || lastGroup?.call?.data?.name || ''
    const lastRawResult = lastGroup?.result?.rawResult
    const lastExitCode =
      lastRawResult && typeof lastRawResult === 'object' ? lastRawResult.exitCode : undefined
    const lastFailing = lastExitCode !== undefined && lastExitCode !== 0

    if (lastGroup && callName === lastName && isFailing && lastFailing) {
      lastGroup.repeatCount = (lastGroup.repeatCount || 1) + 1
      lastGroup.call = pair.call
      lastGroup.result = pair.result
      continue
    }

    groups.push({ ...pair, repeatCount: 1 })
  }

  return groups
}

export function useActivityDetailState({ taskId, liveTask, taskEvents }) {
  const { fetched, loading, error } = useTaskDetail(taskId, liveTask?.status)

  const dbTask = fetched
  const rawStatus = liveTask?.status || dbTask?.status || 'running'
  const effectiveStatus = computeEffectiveStatus(rawStatus, dbTask)
  const isRunning = effectiveStatus === 'running' || effectiveStatus === 'spawned'
  const canResume = effectiveStatus === 'failed' || effectiveStatus === 'incomplete'
  const finalResult = dbTask?.result || ''
  const instructions = liveTask?.spawnInstructions || dbTask?.instructions || ''
  const createdAt = liveTask?.spawnedAt || dbTask?.created_at || ''
  const completedAt = liveTask?.completedAt || dbTask?.completed_at || ''
  const errorMsg = dbTask?.error || dbTask?.abort_reason || liveTask?.message || ''
  const elapsed = elapsedLabel(createdAt, completedAt || (isRunning ? null : completedAt))
  const steps = mergeSteps(dbTask?.steps)
  const color = TASK_STATUS_COLOR[effectiveStatus] || 'muted'
  const label = TASK_STATUS_LABEL[effectiveStatus] || effectiveStatus
  const liveCurrentPlan = liveTask?.currentPlan || ''

  const latestThought = useMemo(
    () => getLatestThought(taskEvents, isRunning),
    [taskEvents, isRunning]
  )

  const lastProgressTime = useMemo(
    () => getLastProgressTime(taskEvents, isRunning),
    [taskEvents, isRunning]
  )

  const groupedPairs = useMemo(
    () => buildGroupedPairs(taskEvents, lastProgressTime, isRunning),
    [taskEvents, lastProgressTime, isRunning]
  )

  return {
    fetched,
    loading,
    error,
    dbTask,
    finalResult,
    effectiveStatus,
    isRunning,
    canResume,
    instructions,
    createdAt,
    completedAt,
    errorMsg,
    elapsed,
    steps,
    color,
    label,
    liveCurrentPlan,
    latestThought,
    groupedPairs
  }
}
