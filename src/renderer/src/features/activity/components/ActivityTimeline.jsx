import { Clock } from 'lucide-react'
import { STEP_STATUS_ICON } from '../utils/task.utils'

export function TimelineMarker({ icon: Icon, iconClass = '', label, sub, isLast = false }) {
  return (
    <div className={`activity-timeline-item${isLast ? ' activity-timeline-item-last' : ''}`}>
      <div className="activity-timeline-node">
        <span className={`activity-timeline-icon ${iconClass}`}>
          <Icon size={12} />
        </span>
        {!isLast && <span className="activity-timeline-line" />}
      </div>
      <div className="activity-timeline-content">
        <p className="activity-timeline-label">{label}</p>
        {sub && <p className="activity-timeline-sub">{sub}</p>}
      </div>
    </div>
  )
}

export function StepItem({ step, isLast }) {
  const Icon = STEP_STATUS_ICON[step.status] || Clock
  const iconClass = `activity-step-icon-${step.status}`

  return (
    <div
      className={`activity-timeline-item activity-step-item${isLast ? ' activity-timeline-item-last' : ''}`}
    >
      <div className="activity-timeline-node">
        <span className={`activity-timeline-icon activity-step-icon ${iconClass}`}>
          <Icon size={12} />
        </span>
        {!isLast && <span className="activity-timeline-line" />}
      </div>
      <div className="activity-timeline-content">
        <p className="activity-timeline-label activity-step-label">{step.instruction}</p>
        {step.status === 'running' && (
          <p className="activity-timeline-sub activity-step-running">Working on this…</p>
        )}
        {step.status === 'pending' && <p className="activity-timeline-sub">Up next</p>}
      </div>
    </div>
  )
}
