import { ArrowUp, Square, Loader } from 'lucide-react'
import { PHASE } from '../../state/chatStore'

export default function ChatScreenComposer({
  canSend,
  inputRef,
  phase,
  onAbort,
  onInput,
  onKeyDown,
  onSend
}) {
  const isActive = phase !== PHASE.IDLE
  const isAborting = phase === PHASE.ABORTING

  return (
    <div className="chat-bottom">
      <article className="chat-composer">
        <div className="chat-composer-row">
          <label className="chat-composer-label" htmlFor="chat-message-input">
            Ask anything
          </label>
          <textarea
            className="chat-composer-input"
            id="chat-message-input"
            name="chat-message-input"
            onInput={onInput}
            onKeyDown={onKeyDown}
            placeholder={isActive ? 'Working...' : 'Type your prompt...'}
            ref={inputRef}
            rows={1}
            disabled={isActive}
          />

          <div className="chat-composer-toolbar">
            <div className="chat-composer-group">
              {isActive ? (
                <button
                  aria-label={isAborting ? 'Stopping...' : 'Stop generating'}
                  className="workspace-icon-button workspace-stop-button"
                  disabled={isAborting}
                  onClick={onAbort}
                  type="button"
                >
                  {isAborting ? (
                    <Loader size={14} className="chat-tool-spinner" />
                  ) : (
                    <Square size={10} fill="currentColor" />
                  )}
                </button>
              ) : (
                <button
                  aria-label="Send message"
                  className="workspace-icon-button workspace-send-button"
                  disabled={!canSend}
                  onClick={() => void onSend()}
                  type="button"
                >
                  <ArrowUp size={16} />
                </button>
              )}
            </div>
          </div>
        </div>
      </article>
    </div>
  )
}
