import { useEffect, useRef } from 'react'
import Drawer from '../../../shared/components/Drawer'
import { CHANNEL_META, timeAgo } from '../hooks/useChannelsStore'

function ThreadDrawer({ target, data, open, onClose }) {
  const bottomRef = useRef(null)
  const meta = target ? CHANNEL_META[target.channel] || {} : {}

  useEffect(() => {
    if (open && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [open, data?.messages?.length])

  if (!target || !data) return null

  const title = data.senderName || target.peerId

  return (
    <Drawer onClose={onClose} open={open} title={title} width="440px">
      <div className="thread-drawer">
        <div className="thread-meta">
          <span className="thread-meta-badge" style={{ color: meta.color || '#888' }}>
            {meta.label || target.channel}
          </span>
          <span className="thread-meta-id">{target.peerId}</span>
        </div>

        {data.messages.length === 0 ? (
          <div className="thread-empty">
            <p>No messages yet</p>
          </div>
        ) : (
          <div className="thread-messages">
            {data.messages.map((msg, i) => (
              <div className={`thread-bubble thread-bubble-${msg.role}`} key={i}>
                <div className="thread-bubble-header">
                  <span className="thread-bubble-sender">
                    {msg.role === 'user' ? data.senderName || target.peerId : 'Vox'}
                  </span>
                  {msg.timestamp && (
                    <span className="thread-bubble-time">{timeAgo(msg.timestamp)}</span>
                  )}
                </div>
                <p className="thread-bubble-text">{msg.content}</p>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>
        )}
      </div>
    </Drawer>
  )
}

export default ThreadDrawer
