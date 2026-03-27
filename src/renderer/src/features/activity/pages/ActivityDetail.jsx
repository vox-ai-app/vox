import { useState } from 'react'
import { ArrowLeft, Loader, RefreshCw, Square, Zap } from 'lucide-react'
import { relativeTime } from '../utils/task.utils'
import { TimelineMarker, StepItem } from '../components/ActivityTimeline'
import { ActionItem } from '../components/ActionItem'
import { ActivityExpandableMarkdown } from '../components/ActivityExpandableMarkdown'
import { ActivityResultItem } from '../components/ActivityResultItem'
import { useActivityDetailState } from '../hooks/useActivityDetailState'

function ActivityDetail({ taskId, liveTask, onBack, onAbort, onResume, taskEvents }) {
  const {
    fetched,
    loading,
    error,
    finalResult,
    effectiveStatus,
    isRunning,
    canResume,
    instructions,
    createdAt,
    errorMsg,
    elapsed,
    steps,
    color,
    label,
    liveCurrentPlan,
    latestThought,
    groupedPairs
  } = useActivityDetailState({ taskId, liveTask, taskEvents })
  const [busy, setBusy] = useState(false)

  const handleAbort = async () => {
    if (busy || !onAbort) return
    setBusy(true)
    try {
      await onAbort(taskId)
    } finally {
      setBusy(false)
    }
  }

  const handleResume = async () => {
    if (busy || !onResume) return
    setBusy(true)
    try {
      await onResume(taskId)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="activity-detail">
      <div className="activity-detail-toolbar">
        <button className="activity-back-btn" onClick={onBack} type="button">
          <ArrowLeft size={13} />
          All agents
        </button>
        <div className="activity-detail-controls">
          {isRunning && onAbort && (
            <button
              className="chat-task-card-btn"
              disabled={busy}
              onClick={handleAbort}
              type="button"
            >
              <Square size={11} /> Stop
            </button>
          )}
          {canResume && onResume && (
            <button
              className="chat-task-card-btn chat-task-card-btn-resume"
              disabled={busy}
              onClick={handleResume}
              type="button"
            >
              <RefreshCw size={11} /> Resume
            </button>
          )}
        </div>
      </div>

      {loading && !liveTask && !fetched ? (
        <div className="activity-detail-skeleton">
          <div className="activity-skeleton-mission">
            <div className="activity-skeleton-line activity-skeleton-line-sm" />
            <div className="activity-skeleton-line activity-skeleton-line-lg" />
            <div className="activity-skeleton-line activity-skeleton-line-md" />
          </div>
          <div className="activity-skeleton-timeline">
            {[80, 60, 70].map((w, i) => (
              <div key={i} className="activity-skeleton-trow">
                <div className="activity-skeleton-dot" />
                <div className="activity-skeleton-line" style={{ width: `${w}%` }} />
              </div>
            ))}
          </div>
        </div>
      ) : error && !liveTask && !fetched ? (
        <div className="activity-detail-error">{error}</div>
      ) : (
        <div className="activity-detail-body">
          <div className="activity-mission">
            <div className="activity-mission-meta">
              <span
                className={`activity-list-dot activity-list-dot-${color}${isRunning ? ' activity-list-dot-pulse' : ''}`}
              />

              <span className={`activity-list-status activity-list-status-${color}`}>{label}</span>
              {elapsed && <span className="activity-mission-elapsed">· {elapsed}</span>}
              {createdAt && (
                <span className="activity-mission-time">{relativeTime(createdAt)}</span>
              )}
            </div>
            {instructions && (
              <ActivityExpandableMarkdown
                collapsedClassName="activity-mission-text-clamped"
                containerClassName="activity-mission-text"
                text={instructions}
              />
            )}
            {isRunning && latestThought && (
              <p className="activity-agent-thought">
                {latestThought.length > 120 ? `${latestThought.slice(0, 120)}…` : latestThought}
              </p>
            )}
          </div>
          <div className="activity-timeline">
            <TimelineMarker
              icon={Zap}
              iconClass="activity-timeline-icon-spawn"
              label="Agent started"
              sub={createdAt ? relativeTime(createdAt) : undefined}
            />

            {steps.map((step, i) => {
              const isLastStep =
                i === steps.length - 1 &&
                !finalResult &&
                !errorMsg &&
                !groupedPairs.length &&
                effectiveStatus !== 'running'
              return <StepItem key={step.step_id || i} step={step} isLast={isLastStep} />
            })}
            {groupedPairs.map((pair, idx) => (
              <ActionItem
                key={idx}
                call={pair.call}
                result={pair.result}
                isLast={false}
                repeatCount={pair.repeatCount}
              />
            ))}
            {isRunning && (
              <TimelineMarker
                icon={Loader}
                iconClass="activity-timeline-icon-working"
                label={liveCurrentPlan || latestThought || 'Working...'}
              />
            )}
            {finalResult && <ActivityResultItem result={finalResult} isError={false} />}
            {errorMsg && !finalResult && <ActivityResultItem result={errorMsg} isError />}
          </div>
        </div>
      )}
    </div>
  )
}

export default ActivityDetail
