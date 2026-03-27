import { memo, useCallback, useState } from 'react'
import { ArrowRight, RefreshCw, RotateCcw, Square } from 'lucide-react'
import { relativeTime, TASK_STATUS_COLOR, TASK_STATUS_LABEL } from '../utils/task.utils'

const ActivityListRow = memo(function ActivityListRow({
  task,
  onClick,
  onAbort,
  onResume,
  onRerun
}) {
  const {
    taskId,
    status,
    spawnInstructions,
    instructions,
    completedCount,
    currentPlan,
    spawnedAt
  } = task
  const [busy, setBusy] = useState(false)
  const isRunning = status === 'running' || status === 'spawned'
  const canResume = status === 'failed' || status === 'incomplete'
  const canRerun = !isRunning && !canResume && Boolean(spawnInstructions)
  const doneCount = completedCount || 0
  const color = TASK_STATUS_COLOR[status] || 'muted'
  const label = TASK_STATUS_LABEL[status] || status
  const preview = String(spawnInstructions || instructions || currentPlan || '').trim()

  const handleAbort = useCallback(
    async (e) => {
      e.stopPropagation()
      if (busy || !onAbort) return
      setBusy(true)
      try {
        await onAbort(taskId)
      } finally {
        setBusy(false)
      }
    },
    [busy, onAbort, taskId]
  )

  const handleResume = useCallback(
    async (e) => {
      e.stopPropagation()
      if (busy || !onResume) return
      setBusy(true)
      try {
        await onResume(taskId)
      } finally {
        setBusy(false)
      }
    },
    [busy, onResume, taskId]
  )

  const handleRerun = useCallback(
    (e) => {
      e.stopPropagation()
      if (busy || !onRerun || !spawnInstructions) return
      onRerun(spawnInstructions)
    },
    [busy, onRerun, spawnInstructions]
  )

  return (
    <div
      className="activity-list-row"
      onClick={() => onClick(taskId)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onClick(taskId)}
    >
      <div className="activity-list-row-left">
        <span
          className={`activity-list-dot activity-list-dot-${color}${isRunning ? ' activity-list-dot-pulse' : ''}`}
        />
      </div>
      <div className="activity-list-row-body">
        <p className="activity-list-row-instructions">
          {preview.length > 120
            ? `${preview.slice(0, 120)}…`
            : preview || `Agent ${taskId.slice(0, 8)}…`}
        </p>
        <div className="activity-list-row-meta">
          <span className={`activity-list-status activity-list-status-${color}`}>{label}</span>
          {doneCount > 0 && (
            <span className="activity-list-steps">
              {doneCount} action{doneCount === 1 ? '' : 's'} done
            </span>
          )}
        </div>
      </div>
      <div className="activity-list-row-actions" onClick={(e) => e.stopPropagation()}>
        {spawnedAt && <span className="activity-list-time">{relativeTime(spawnedAt)}</span>}
        {isRunning && (
          <button
            className="activity-row-btn activity-row-btn-stop"
            disabled={busy}
            onClick={handleAbort}
            title="Stop agent"
            type="button"
          >
            <Square size={11} />
            Stop
          </button>
        )}
        {canResume && (
          <button
            className="activity-row-btn activity-row-btn-resume"
            disabled={busy}
            onClick={handleResume}
            title="Resume agent"
            type="button"
          >
            <RefreshCw size={11} />
            Resume
          </button>
        )}
        {canRerun && (
          <button
            className="activity-row-btn activity-row-btn-rerun"
            disabled={busy}
            onClick={handleRerun}
            title="Re-run this agent"
            type="button"
          >
            <RotateCcw size={11} />
            Re-run
          </button>
        )}
        {!isRunning && !canResume && !canRerun && (
          <ArrowRight className="activity-list-row-arrow" size={13} />
        )}
      </div>
    </div>
  )
})

export default ActivityListRow
