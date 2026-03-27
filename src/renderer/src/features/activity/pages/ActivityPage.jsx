import { useCallback, useMemo, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import useChatStore from '../../chat/state/chatStore'
import { useTaskCache, useActivityCache } from '../../../shared/hooks/useChat'
import { useTaskHistory } from '../hooks/useTaskHistory'
import { useIntersectionObserver } from '../../../shared/hooks/useIntersectionObserver'
import ActivityListRow from '../components/ActivityListRow'
import ActivityDetail from './ActivityDetail'

function ActivityPage({ focusedTaskId, onClearFocus, userId }) {
  const { abortTask, resumeTask, sendMessage } = useChatStore(
    useShallow((s) => ({
      abortTask: s.abortTask,
      resumeTask: s.resumeTask,
      sendMessage: s.sendMessage
    }))
  )
  const { tasks: taskRecords } = useTaskCache()
  const { activity: activityFeed } = useActivityCache()
  const { tasks: allTasks, hasMore, loading: historyLoading, loadMore } = useTaskHistory(userId)
  const [localFocusedId, setLocalFocusedId] = useState(null)
  const activeFocusedId = focusedTaskId ?? localFocusedId

  const clearFocus = useCallback(() => {
    setLocalFocusedId(null)
    onClearFocus?.()
  }, [onClearFocus])

  const handleSelect = useCallback((taskId) => {
    setLocalFocusedId(taskId)
  }, [])

  const liveTask = useMemo(
    () => taskRecords.find((t) => t.taskId === activeFocusedId) || null,
    [taskRecords, activeFocusedId]
  )

  const taskEvents = useMemo(
    () => (activeFocusedId ? activityFeed.filter((e) => e.taskId === activeFocusedId) : []),
    [activityFeed, activeFocusedId]
  )

  const runningCount = useMemo(
    () => allTasks.filter((t) => t.status === 'running' || t.status === 'spawned').length,
    [allTasks]
  )

  const rerunTask = useCallback(
    (instructions) => {
      sendMessage(instructions)
    },
    [sendMessage]
  )

  const sentinelCallbackRef = useIntersectionObserver(loadMore, { threshold: 0.1 })

  return (
    <section className="activity-page">
      {activeFocusedId ? (
        <ActivityDetail
          key={activeFocusedId}
          taskId={activeFocusedId}
          liveTask={liveTask}
          taskEvents={taskEvents}
          onBack={clearFocus}
          onAbort={abortTask}
          onResume={resumeTask}
        />
      ) : (
        <div className="activity-list-view">
          <header className="activity-list-header">
            <h2>Activity</h2>
            {runningCount > 0 && (
              <div className="activity-live-badge">
                <span className="activity-live-badge-dot" />
                {runningCount} running
              </div>
            )}
          </header>

          {allTasks.length === 0 && historyLoading ? (
            <div className="activity-list activity-list-skeleton">
              {[100, 75, 90, 60, 85].map((w, i) => (
                <div key={i} className="activity-skeleton-row">
                  <div className="activity-skeleton-dot" />
                  <div className="activity-skeleton-row-body">
                    <div className="activity-skeleton-line" style={{ width: `${w}%` }} />
                    <div
                      className="activity-skeleton-line activity-skeleton-line-sm"
                      style={{ width: '45%' }}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : allTasks.length === 0 && !historyLoading ? (
            <p className="activity-empty">No agents have run yet.</p>
          ) : (
            <div className="activity-list">
              {allTasks.map((task) => (
                <ActivityListRow
                  key={task.taskId}
                  task={task}
                  onClick={handleSelect}
                  onAbort={abortTask}
                  onResume={resumeTask}
                  onRerun={rerunTask}
                />
              ))}
              {historyLoading && (
                <div className="activity-list-skeleton">
                  {[80, 60].map((w, i) => (
                    <div key={i} className="activity-skeleton-row">
                      <div className="activity-skeleton-dot" />
                      <div className="activity-skeleton-row-body">
                        <div className="activity-skeleton-line" style={{ width: `${w}%` }} />
                        <div
                          className="activity-skeleton-line activity-skeleton-line-sm"
                          style={{ width: '45%' }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {hasMore && (
                <div
                  className="activity-sentinel"
                  ref={sentinelCallbackRef}
                  style={historyLoading ? { pointerEvents: 'none' } : undefined}
                />
              )}
            </div>
          )}
        </div>
      )}
    </section>
  )
}

export default ActivityPage
