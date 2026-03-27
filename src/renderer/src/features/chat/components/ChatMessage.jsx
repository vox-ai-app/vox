import { memo, useState, useCallback } from 'react'
import { CheckCircle, CircleAlert, ChevronRight, ChevronDown, Copy, Check } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

const REMARK_PLUGINS = [remarkGfm]

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      void 0
    }
  }, [text])

  return (
    <button
      className={`chat-copy-btn${copied ? ' chat-copy-btn-copied' : ''}`}
      onClick={handleCopy}
      type="button"
    >
      {copied ? <Check size={11} /> : <Copy size={11} />}
      <span>{copied ? 'Copied' : 'Copy'}</span>
    </button>
  )
}

const NotificationMessage = memo(function NotificationMessage({ message }) {
  const isOk = message.status === 'completed'
  const Icon = isOk ? CheckCircle : CircleAlert
  const label = isOk ? 'Completed' : message.status === 'aborted' ? 'Stopped' : 'Failed'
  return (
    <div className="chat-notification-row">
      <span className={`chat-notification-pill chat-notification-pill-${message.status}`}>
        <Icon aria-hidden="true" size={11} />
        <span>{message.content ? `${label} · ${message.content}` : label}</span>
      </span>
    </div>
  )
})

const UserMessage = memo(function UserMessage({ message }) {
  return (
    <div className="chat-message-row chat-message-row-user">
      <article className={`chat-message-bubble${message.pending ? ' is-pending' : ''}`}>
        <p className="chat-message-content">{message.content}</p>
      </article>
    </div>
  )
})

const AssistantMessage = memo(
  function AssistantMessage({ message }) {
    const isPending = message.pending
    const isEmpty = isPending && !message.content?.trim()

    return (
      <div className="chat-message-row chat-message-row-assistant">
        <article className="chat-message-bubble">
          {isEmpty ? (
            <div className="chat-thinking-container">
              <div className="chat-thinking-dots">
                <span />
                <span />
                <span />
              </div>
              <span className="chat-thinking-text">Thinking</span>
            </div>
          ) : isPending ? (
            <p className="chat-message-content is-pending">{message.content}</p>
          ) : (
            <div className="chat-message-content chat-message-content-md">
              <ReactMarkdown remarkPlugins={REMARK_PLUGINS}>{message.content}</ReactMarkdown>
            </div>
          )}
          {!isPending && message.content?.trim() && <CopyButton text={message.content} />}
        </article>
      </div>
    )
  },
  (prev, next) =>
    prev.message.content === next.message.content && prev.message.pending === next.message.pending
)

const ChatMessage = memo(function ChatMessage({ message }) {
  if (message.role === 'notification') return <NotificationMessage message={message} />
  if (message.role === 'user') return <UserMessage message={message} />
  if (message.role === 'assistant') return <AssistantMessage message={message} />
  return null
})

export default ChatMessage

export function ToolGroup({ tools }) {
  const hasRunning = tools.some((t) => t.status === 'running')
  const [expanded, setExpanded] = useState(false)

  const isOpen = expanded || hasRunning

  const summary = tools.length === 1 ? tools[0].name || 'Tool' : `Used ${tools.length} tools`

  if (!isOpen) {
    return (
      <div className="chat-tool-group">
        <div className="chat-tool-group-header" onClick={() => setExpanded(true)}>
          <ChevronRight size={12} />
          <span>{summary}</span>
        </div>
      </div>
    )
  }

  return (
    <div className="chat-tool-group">
      {!hasRunning && (
        <div className="chat-tool-group-header" onClick={() => setExpanded(false)}>
          <ChevronDown size={12} />
          <span>
            Used {tools.length} tool{tools.length !== 1 ? 's' : ''}
          </span>
        </div>
      )}
      <div className="chat-tool-timeline">
        <div className="chat-tool-timeline-line" />
        {tools.map((tool, i) => {
          const isRunning = tool.status === 'running'
          return (
            <div className="chat-tool-timeline-item" key={tool.id || i}>
              <div
                className={`chat-tool-timeline-node${isRunning ? ' chat-tool-timeline-node-running' : ''}`}
              >
                {isRunning ? <span className="chat-tool-spinner" /> : null}
              </div>
              <div
                className={`chat-tool-timeline-desc${isRunning ? ' chat-tool-timeline-desc-running' : ''}`}
              >
                {tool.name || 'Tool'}
              </div>
              {!isRunning && (
                <span className="chat-tool-result-badge">
                  <Check size={8} /> Done
                </span>
              )}
              {isRunning && (
                <span className="chat-tool-running-badge">
                  <span className="chat-tool-spinner" /> Running
                </span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
