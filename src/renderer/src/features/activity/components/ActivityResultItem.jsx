import { CheckCircle, CircleAlert } from 'lucide-react'
import { ActivityExpandableMarkdown } from './ActivityExpandableMarkdown'

export function ActivityResultItem({ result, isError }) {
  const Icon = isError ? CircleAlert : CheckCircle

  return (
    <div className="activity-timeline-item activity-timeline-item-last">
      <div className="activity-timeline-node">
        <span
          className={`activity-timeline-icon ${isError ? 'activity-step-icon-failed' : 'activity-step-icon-completed'}`}
        >
          <Icon size={12} />
        </span>
      </div>
      <div className="activity-timeline-content">
        <p className="activity-timeline-label">{isError ? 'What went wrong' : 'Result'}</p>
        <ActivityExpandableMarkdown
          collapsedClassName="activity-final-result-clamped"
          containerClassName={`activity-final-result${isError ? ' activity-final-result-error' : ''}`}
          text={result}
        />
      </div>
    </div>
  )
}
