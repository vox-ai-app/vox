import { memo, useState } from 'react'
import {
  BookOpen,
  Check,
  ChevronDown,
  ChevronRight,
  FileText,
  Globe,
  Lightbulb,
  Monitor,
  OctagonAlert,
  PenLine,
  Search,
  Terminal,
  Wrench,
  Zap
} from 'lucide-react'
import { parseToolArgs, toolLabel } from '../utils/task.utils'
import { PRIMARY_ARG_KEYS, getToolSub, getOutcomeBadge } from '../utils/timeline.utils'

function ActionToolIcon({ name, isDesktop, size }) {
  if (isDesktop) return <Monitor size={size} />
  const n = String(name || '').toLowerCase()
  if (n.includes('read') || n.includes('list')) return <FileText size={size} />
  if (n.includes('write')) return <PenLine size={size} />
  if (n.includes('execute') || n.includes('run_code') || n.includes('code'))
    return <Terminal size={size} />
  if (n.includes('context') || n.includes('memory') || n.includes('search'))
    return <Search size={size} />
  if (n.includes('fetch') || n.includes('http')) return <Globe size={size} />
  if (n.includes('spawn')) return <Zap size={size} />
  if (n.includes('journal')) return <BookOpen size={size} />
  return <Wrench size={size} />
}

function ExpandChevron({ expanded, size }) {
  if (expanded) return <ChevronDown size={size} />
  return <ChevronRight size={size} />
}

function ExecuteCodeDetails({ argsObj, result: rawResult }) {
  const commands = Array.isArray(argsObj?.commands) ? argsObj.commands : []
  const r = rawResult && typeof rawResult === 'object' ? rawResult : null
  const stdout = String(r?.stdout || '').trim()
  const stderr = String(r?.stderr || '').trim()
  return (
    <div className="activity-action-details">
      {commands.length > 0 && (
        <div className="activity-code-commands">
          {commands.map((cmd, i) => (
            <code key={i} className="activity-code-cmd">
              {String(cmd)}
            </code>
          ))}
        </div>
      )}
      {stdout && (
        <div className="activity-code-stream">
          <span className="activity-code-stream-label">stdout</span>
          <pre className="activity-code-stream-pre">
            {stdout.length > 600 ? `${stdout.slice(0, 600)}…` : stdout}
          </pre>
        </div>
      )}
      {stderr && (
        <div className="activity-code-stream activity-code-stream-err">
          <span className="activity-code-stream-label">stderr</span>
          <pre className="activity-code-stream-pre">
            {stderr.length > 600 ? `${stderr.slice(0, 600)}…` : stderr}
          </pre>
        </div>
      )}
    </div>
  )
}

function GenericDetails({ argEntries, result: rawResult }) {
  const resultStr =
    rawResult != null ? (typeof rawResult === 'string' ? rawResult : JSON.stringify(rawResult)) : ''
  return (
    <div className="activity-action-details">
      {argEntries.map(([k, v]) => {
        const s = typeof v === 'string' ? v : JSON.stringify(v)
        return (
          <div key={k} className="activity-tool-arg-row">
            <span className="activity-tool-arg-key">{k}</span>
            <span className="activity-tool-arg-val">
              {s.length > 400 ? `${s.slice(0, 400)}…` : s}
            </span>
          </div>
        )
      })}
      {resultStr && (
        <div className="activity-action-result">
          <span className="activity-tool-result-text">
            {resultStr.length > 500 ? `${resultStr.slice(0, 500)}…` : resultStr}
          </span>
        </div>
      )}
    </div>
  )
}

function JournalDetails({ argsObj }) {
  const understanding = typeof argsObj.understanding === 'string' ? argsObj.understanding : ''
  const plan = typeof argsObj.currentPlan === 'string' ? argsObj.currentPlan : ''
  const completed = Array.isArray(argsObj.completed) ? argsObj.completed : []
  const blockers = Array.isArray(argsObj.blockers) ? argsObj.blockers : []
  const discoveries = Array.isArray(argsObj.discoveries) ? argsObj.discoveries : []
  const done = argsObj.done === true
  const doneReason = typeof argsObj.doneReason === 'string' ? argsObj.doneReason : ''

  return (
    <div className="activity-action-details activity-journal-details">
      {understanding && (
        <div className="activity-journal-section">
          <span className="activity-journal-section-label">Understanding</span>
          <p className="activity-journal-section-text">{understanding}</p>
        </div>
      )}
      {plan && (
        <div className="activity-journal-section">
          <span className="activity-journal-section-label">Plan</span>
          <p className="activity-journal-section-text">{plan}</p>
        </div>
      )}
      {completed.length > 0 && (
        <div className="activity-journal-section">
          <span className="activity-journal-section-label">Completed</span>
          <ul className="activity-journal-list">
            {completed.map((item, i) => (
              <li key={i} className="activity-journal-list-item activity-journal-list-done">
                <Check size={10} /> {String(item)}
              </li>
            ))}
          </ul>
        </div>
      )}
      {blockers.length > 0 && (
        <div className="activity-journal-section">
          <span className="activity-journal-section-label activity-journal-label-blocker">
            Blockers
          </span>
          <ul className="activity-journal-list">
            {blockers.map((item, i) => (
              <li key={i} className="activity-journal-list-item activity-journal-list-blocker">
                <OctagonAlert size={10} /> {String(item)}
              </li>
            ))}
          </ul>
        </div>
      )}
      {discoveries.length > 0 && (
        <div className="activity-journal-section">
          <span className="activity-journal-section-label">Discoveries</span>
          <ul className="activity-journal-list">
            {discoveries.map((item, i) => (
              <li key={i} className="activity-journal-list-item">
                <Lightbulb size={10} /> {String(item)}
              </li>
            ))}
          </ul>
        </div>
      )}
      {done && doneReason && (
        <div className="activity-journal-section activity-journal-done">
          <span className="activity-journal-section-label">Done</span>
          <p className="activity-journal-section-text">{doneReason}</p>
        </div>
      )}
    </div>
  )
}

export const ActionItem = memo(function ActionItem({ call, result, isLast, repeatCount = 1 }) {
  const [expanded, setExpanded] = useState(false)
  const isDesktop = call?.type === 'task.request'
  const toolName = call?.name || call?.data?.name || call?.data?.tool || 'tool'
  const isJournal = toolName.toLowerCase().includes('journal')
  const isExecute =
    toolName === 'execute_code' || toolName.includes('execute') || toolName === 'run_code'
  let label
  if (isJournal) {
    const done = call?.args?.done === true
    label = done ? 'Task complete' : 'Plan updated'
  } else if (isDesktop) {
    label = toolName ? `Desktop · ${toolName}` : 'Desktop action'
  } else {
    label = toolLabel(toolName)
  }

  const argsObj = call?.args ?? parseToolArgs(call?.data?.payload ?? call?.data?.args ?? null)
  const argEntries = Object.entries(argsObj || {})
  const primaryEntry =
    argEntries.find(([k]) => PRIMARY_ARG_KEYS.includes(k)) || argEntries[0] || null

  let sub = null
  if (isJournal) {
    const plan = typeof argsObj?.currentPlan === 'string' ? argsObj.currentPlan : ''
    if (plan) sub = plan.length > 90 ? `${plan.slice(0, 90)}…` : plan
  } else {
    const toolSub = getToolSub(toolName, argsObj)
    sub =
      toolSub ??
      (primaryEntry
        ? (() => {
            const s =
              typeof primaryEntry[1] === 'string'
                ? primaryEntry[1]
                : JSON.stringify(primaryEntry[1])
            return s.length > 90 ? `${s.slice(0, 90)}…` : s
          })()
        : null)
  }

  const toolResult = call?.type === 'task.request' ? null : result?.result
  const outcome = isJournal ? null : getOutcomeBadge(toolName, toolResult)
  const isFailure = outcome?.type === 'error' || outcome?.type === 'timeout'
  const hasDetails = isJournal
    ? true
    : isExecute
      ? true
      : argEntries.length > (primaryEntry ? 1 : 0) ||
        (toolResult != null && typeof toolResult === 'string'
          ? toolResult
          : JSON.stringify(toolResult ?? ''))

  return (
    <div
      className={[
        'activity-timeline-item',
        isLast ? 'activity-timeline-item-last' : '',
        isJournal ? 'activity-action-journal' : '',
        isFailure ? 'activity-action-failure' : ''
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="activity-timeline-node">
        <span
          className={[
            'activity-timeline-icon activity-action-icon',
            isJournal ? 'activity-action-icon-journal' : '',
            isFailure ? 'activity-action-icon-failure' : ''
          ]
            .filter(Boolean)
            .join(' ')}
        >
          <ActionToolIcon name={toolName} isDesktop={isDesktop} size={12} />
        </span>
        {!isLast && <span className="activity-timeline-line" />}
      </div>
      <div className="activity-timeline-content">
        <div
          className={`activity-action-header${hasDetails ? ' activity-action-header-expandable' : ''}`}
          onClick={hasDetails ? () => setExpanded((v) => !v) : undefined}
          role={hasDetails ? 'button' : undefined}
          tabIndex={hasDetails ? 0 : undefined}
          onKeyDown={hasDetails ? (e) => e.key === 'Enter' && setExpanded((v) => !v) : undefined}
        >
          <p
            className={['activity-timeline-label', isJournal ? 'activity-action-label-journal' : '']
              .filter(Boolean)
              .join(' ')}
          >
            {label}
          </p>
          {repeatCount > 1 && <span className="activity-repeat-badge">&times;{repeatCount}</span>}
          {outcome && (
            <span className={`activity-outcome-badge activity-outcome-badge-${outcome.type}`}>
              {outcome.label}
            </span>
          )}
          {hasDetails && (
            <span className="activity-action-chevron">
              <ExpandChevron expanded={expanded} size={13} />
            </span>
          )}
        </div>
        {sub && !expanded && <p className="activity-timeline-sub">{sub}</p>}
        {expanded &&
          (isJournal ? (
            <JournalDetails argsObj={argsObj} />
          ) : isExecute ? (
            <ExecuteCodeDetails argsObj={argsObj} result={toolResult} />
          ) : (
            <GenericDetails argEntries={argEntries} result={toolResult} />
          ))}
      </div>
    </div>
  )
})
