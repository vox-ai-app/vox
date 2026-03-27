import { memo, useState } from 'react'
import {
  BookOpen,
  ChevronDown,
  ChevronRight,
  FileText,
  Globe,
  Monitor,
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

function ExecuteCodeDetails({ argsObj, rawResult }) {
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
            {stdout.length > 600 ? `${stdout.slice(0, 600)}\u2026` : stdout}
          </pre>
        </div>
      )}
      {stderr && (
        <div className="activity-code-stream activity-code-stream-err">
          <span className="activity-code-stream-label">stderr</span>
          <pre className="activity-code-stream-pre">
            {stderr.length > 600 ? `${stderr.slice(0, 600)}\u2026` : stderr}
          </pre>
        </div>
      )}
    </div>
  )
}

function GenericDetails({ argEntries, rawResult }) {
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
              {s.length > 400 ? `${s.slice(0, 400)}\u2026` : s}
            </span>
          </div>
        )
      })}
      {resultStr && (
        <div className="activity-action-result">
          <span className="activity-tool-result-text">
            {resultStr.length > 500 ? `${resultStr.slice(0, 500)}\u2026` : resultStr}
          </span>
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
  const label = isDesktop
    ? toolName
      ? `Desktop · ${toolName}`
      : 'Desktop action'
    : toolLabel(toolName)

  const argsObj = call?.args ?? parseToolArgs(call?.data?.payload ?? call?.data?.args ?? null)
  const argEntries = Object.entries(argsObj || {})
  const primaryEntry =
    argEntries.find(([k]) => PRIMARY_ARG_KEYS.includes(k)) || argEntries[0] || null

  const toolSub = getToolSub(toolName, argsObj)
  const sub =
    toolSub ??
    (primaryEntry
      ? (() => {
          const s =
            typeof primaryEntry[1] === 'string' ? primaryEntry[1] : JSON.stringify(primaryEntry[1])
          return s.length > 90 ? `${s.slice(0, 90)}\u2026` : s
        })()
      : null)

  const rawResult = call?.type === 'task.request' ? null : result?.rawResult
  const outcome = getOutcomeBadge(toolName, rawResult)
  const isFailure = outcome?.type === 'error' || outcome?.type === 'timeout'
  const hasDetails = isExecute
    ? true
    : argEntries.length > (primaryEntry ? 1 : 0) ||
      (rawResult != null && typeof rawResult === 'string'
        ? rawResult
        : JSON.stringify(rawResult ?? ''))

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
          (isExecute ? (
            <ExecuteCodeDetails argsObj={argsObj} rawResult={rawResult} />
          ) : (
            <GenericDetails argEntries={argEntries} rawResult={rawResult} />
          ))}
      </div>
    </div>
  )
})
