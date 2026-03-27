import { memo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { ChevronDown } from 'lucide-react'
import useChatStore from '../state/chatStore'
import { useMessageCache } from '../../../shared/hooks/useChat'
import ChatScreenComposer from './screen/ChatScreenComposer'
import ChatScreenMessages from './screen/ChatScreenMessages'
import { useChatComposerState } from '../hooks/useChatComposerState'
import { useChatStageState } from '../hooks/useChatStageState'

function ChatScreen({ user }) {
  const { messages, isReady, loadingOlder, loadOlder, prependCount } = useMessageCache()
  const { phase, sendError } = useChatStore(
    useShallow((s) => ({
      phase: s.phase,
      sendError: s.sendError
    }))
  )
  const isConnecting = !isReady && messages.length === 0

  const sendMessage = useChatStore((s) => s.sendMessage)
  const clearSendError = useChatStore((s) => s.clearSendError)
  const abortCurrentTask = useChatStore((s) => s.abortCurrentTask)

  const { inputRef, canSend, handleSend, handleKeyDown, handleInput, handleChip } =
    useChatComposerState({ clearSendError, sendError, sendMessage })
  const { virtuosoRef, firstItemIndex, isAtBottom, setIsAtBottom, scrollToBottom } =
    useChatStageState(messages, prependCount)

  return (
    <section className="chat-screen">
      <div className="chat-stage-wrap">
        <ChatScreenMessages
          allMessages={messages}
          isConnecting={isConnecting}
          loadingOlder={loadingOlder}
          onChip={handleChip}
          user={user}
          virtuosoRef={virtuosoRef}
          firstItemIndex={firstItemIndex}
          onStartReached={loadOlder}
          onAtBottomChange={setIsAtBottom}
          historyReady={isReady}
        />

        {!isAtBottom && (
          <button
            aria-label="Scroll to bottom"
            className="chat-scroll-fab"
            onClick={scrollToBottom}
            type="button"
          >
            <ChevronDown size={18} />
          </button>
        )}
      </div>
      <ChatScreenComposer
        canSend={canSend}
        inputRef={inputRef}
        phase={phase}
        onAbort={abortCurrentTask}
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        onSend={handleSend}
      />
    </section>
  )
}

export default memo(ChatScreen)
