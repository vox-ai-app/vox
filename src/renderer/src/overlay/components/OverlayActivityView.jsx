import { useCallback, useEffect, useRef, useState } from 'react'
import { getTaskStatusColor } from '../helpers'
import { useTaskHistory } from '../../features/activity/hooks/useTaskHistory'

export default function OverlayActivityView() {
  const { tasks, loading, loadMore } = useTaskHistory('local')
  const tasksReady = !loading || tasks.length > 0
  const [selectedTask, setSelectedTask] = useState(null)
  const activityScrollRef = useRef(null)

  const handleActivityScroll = useCallback(() => {
    const el = activityScrollRef.current
    if (!el) return
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60
    if (nearBottom) {
      loadMore()
    }
  }, [loadMore])

  useEffect(() => {
    if (loading) return
    const el = activityScrollRef.current
    if (!el) return
    if (el.scrollHeight <= el.clientHeight && tasks.length > 0) {
      loadMore()
    }
  }, [loading, tasks.length, loadMore])

  return (
    <div className="overlay-messages" ref={activityScrollRef} onScroll={handleActivityScroll}>
      {!tasksReady ? (
        <div className="overlay-skeleton">
          {[85, 60, 75, 50].map((w, i) => (
            <div className="overlay-skeleton-task" key={i}>
              <div className="overlay-skeleton-dot" />
              <div className="overlay-skeleton-task-body">
                <div className="overlay-skeleton-task-label" style={{ width: `${w}%` }} />
                <div className="overlay-skeleton-task-meta" />
              </div>
            </div>
          ))}
        </div>
      ) : selectedTask ? (
        <div className="overlay-task-detail">
          <button className="overlay-task-back" onClick={() => setSelectedTask(null)} type="button">
            &larr; Back
          </button>
          {(() => {
            const taskId = String(selectedTask.taskId || selectedTask.id || '').trim()
            const preview = String(
              selectedTask.spawnInstructions ||
                selectedTask.instructions ||
                selectedTask.currentPlan ||
                ''
            ).trim()
            return (
              <>
                <p className="overlay-task-detail-label">
                  {preview || `Agent ${taskId.slice(0, 8) || 'task'}`}
                </p>
                <span
                  className="overlay-task-status"
                  style={{
                    color: getTaskStatusColor(selectedTask.status)
                  }}
                >
                  {selectedTask.status}
                  {selectedTask.completedCount > 0
                    ? ` · ${selectedTask.completedCount} actions`
                    : ''}
                </span>
                <p className="overlay-task-id">ID: {taskId || 'unknown'}</p>
              </>
            )
          })()}
        </div>
      ) : tasks.length === 0 ? (
        <div className="overlay-empty">
          <span className="overlay-empty-title">No activity yet</span>
          <span className="overlay-empty-subtitle">Agent tasks will appear here</span>
        </div>
      ) : (
        <>
          {tasks.map((task, index) => {
            const id = String(task.taskId || task.id || '').trim()
            const isRunning = task.status === 'running' || task.status === 'spawned'
            const statusColor = getTaskStatusColor(task.status)
            const preview = String(
              task.spawnInstructions || task.instructions || task.currentPlan || ''
            ).trim()
            return (
              <div
                key={id || `task-${index}`}
                className="overlay-task-row"
                onClick={() => setSelectedTask(task)}
                role="button"
                tabIndex={0}
              >
                <span
                  className="overlay-task-dot"
                  style={{
                    background: statusColor,
                    animation: isRunning ? 'overlayPulse 1.5s ease-in-out infinite' : 'none'
                  }}
                />

                <div className="overlay-task-body">
                  <p className="overlay-task-label">
                    {preview.length > 80
                      ? `${preview.slice(0, 80)}…`
                      : preview || `Agent ${id.slice(0, 8) || 'task'}`}
                  </p>
                  <span className="overlay-task-status" style={{ color: statusColor }}>
                    {task.status}
                    {task.completedCount > 0 ? ` · ${task.completedCount} actions` : ''}
                  </span>
                </div>
              </div>
            )
          })}
          {loading && (
            <div className="overlay-skeleton" style={{ padding: '0', gap: '8px' }}>
              {[70, 55].map((w, i) => (
                <div className="overlay-skeleton-task" key={i}>
                  <div className="overlay-skeleton-dot" />
                  <div className="overlay-skeleton-task-body">
                    <div className="overlay-skeleton-task-label" style={{ width: `${w}%` }} />
                    <div className="overlay-skeleton-task-meta" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
