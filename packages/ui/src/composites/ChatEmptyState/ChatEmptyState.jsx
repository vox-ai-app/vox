const DEFAULT_CHIPS = [
  'Summarize my recent documents',
  'Draft an email for me',
  'Search my files for...',
  'Create a to-do list for...'
]

function getGreeting() {
  const hour = new Date().getHours()
  if (hour < 5) return 'Good night'
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  if (hour < 21) return 'Good evening'
  return 'Good night'
}

export default function ChatEmptyState({ user, onChip, chips = DEFAULT_CHIPS }) {
  return (
    <div className="chat-stage-empty">
      <p>
        {getGreeting()}, {String(user?.firstName || '').trim() || 'there'}.
      </p>
      <div className="chat-suggestion-chips">
        {chips.map((chip) => (
          <button
            className="chat-suggestion-chip"
            key={chip}
            onClick={() => onChip(chip)}
            type="button"
          >
            {chip}
          </button>
        ))}
      </div>
    </div>
  )
}
