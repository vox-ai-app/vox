function ChatSkeleton() {
  return (
    <div className="chat-skeleton">
      <div className="chat-skeleton-row chat-skeleton-row-user">
        <div className="chat-skeleton-bubble" style={{ width: '38%' }} />
      </div>
      <div className="chat-skeleton-row chat-skeleton-row-assistant">
        <div className="chat-skeleton-lines">
          <div className="chat-skeleton-line" style={{ width: '82%' }} />
          <div className="chat-skeleton-line" style={{ width: '65%' }} />
          <div className="chat-skeleton-line" style={{ width: '48%' }} />
        </div>
      </div>
      <div className="chat-skeleton-row chat-skeleton-row-user">
        <div className="chat-skeleton-bubble" style={{ width: '28%' }} />
      </div>
      <div className="chat-skeleton-row chat-skeleton-row-assistant">
        <div className="chat-skeleton-lines">
          <div className="chat-skeleton-line" style={{ width: '70%' }} />
          <div className="chat-skeleton-line" style={{ width: '55%' }} />
        </div>
      </div>
    </div>
  )
}

export default ChatSkeleton
