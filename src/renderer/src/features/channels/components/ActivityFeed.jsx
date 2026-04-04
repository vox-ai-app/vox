import { MessageSquare, ChevronRight, Inbox } from 'lucide-react'
import { CHANNEL_META, timeAgo } from '../hooks/useChannelsStore'
import ChannelIcon from './ChannelIcon'

function ActivityCard({ entry, onOpenThread }) {
  const meta = CHANNEL_META[entry.channel] || {}
  const preview = entry.reply
    ? entry.reply.length > 80
      ? entry.reply.slice(0, 80) + '…'
      : entry.reply
    : 'Thinking…'

  return (
    <button
      className="activity-card"
      onClick={() => onOpenThread(entry.channel, entry.peerId)}
      type="button"
    >
      <div className="activity-card-avatar">
        <ChannelIcon channel={entry.channel} size={18} />
      </div>
      <div className="activity-card-body">
        <div className="activity-card-top">
          <span className="activity-card-name">{entry.senderName || entry.peerId}</span>
          <span className="activity-card-badge" style={{ color: meta.color || '#888' }}>
            {meta.label || entry.channel}
          </span>
          <span className="activity-card-time">{timeAgo(entry.timestamp)}</span>
        </div>
        <p className="activity-card-inbound">{entry.inbound}</p>
        <p className="activity-card-reply">
          <span className="activity-card-reply-tag">Vox</span>
          {preview}
        </p>
      </div>
      <ChevronRight className="activity-card-arrow" size={14} />
    </button>
  )
}

function ActivityFeed({ activity, onOpenThread }) {
  if (!activity || activity.length === 0) {
    return (
      <div className="activity-empty">
        <div className="activity-empty-icon">
          <Inbox size={28} />
        </div>
        <p className="activity-empty-title">No conversations yet</p>
        <p className="activity-empty-hint">
          Connect a channel above and send a message — Vox will handle the rest
        </p>
      </div>
    )
  }

  return (
    <div className="activity-feed">
      <div className="activity-feed-header">
        <MessageSquare size={14} />
        <span>Recent conversations</span>
        <span className="activity-feed-count">{activity.length}</span>
      </div>
      <div className="activity-feed-list">
        {activity.map((entry) => (
          <ActivityCard entry={entry} key={entry.id} onOpenThread={onOpenThread} />
        ))}
      </div>
    </div>
  )
}

export default ActivityFeed
