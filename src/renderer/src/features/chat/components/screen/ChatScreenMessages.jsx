import { memo, useCallback, useMemo } from 'react'
import { Virtuoso } from 'react-virtuoso'
import ChatMessage, { ToolGroup } from '../ChatMessage'
import ChatSkeleton from '../ChatSkeleton'
import ChatScreenEmptyState from './ChatScreenEmptyState'

function groupMessages(messages) {
  const result = []
  let toolBuf = []

  const flushTools = () => {
    if (toolBuf.length > 0) {
      result.push({ kind: 'tool-group', tools: [...toolBuf] })
      toolBuf = []
    }
  }

  for (const msg of messages) {
    if (msg.role === 'tool') {
      toolBuf.push({
        id: msg.id,
        name: msg.toolName || 'Tool',
        status: msg.toolStatus || 'completed',
        input: msg.toolInput || ''
      })
    } else {
      flushTools()
      result.push({ kind: 'message', message: msg })
    }
  }
  flushTools()
  return result
}

export default memo(function ChatScreenMessages({
  allMessages,
  isConnecting,
  loadingOlder,
  user,
  onChip,
  virtuosoRef,
  firstItemIndex,
  onStartReached,
  onAtBottomChange
}) {
  const grouped = useMemo(() => groupMessages(allMessages), [allMessages])

  const followOutput = useCallback((isAtBottom) => (isAtBottom ? 'smooth' : false), [])

  const itemContent = useCallback((_index, item) => {
    if (item.kind === 'tool-group') {
      return <ToolGroup tools={item.tools} />
    }
    return <ChatMessage message={item.message} />
  }, [])

  if (isConnecting) {
    return <ChatSkeleton />
  }

  if (allMessages.length === 0) {
    return <ChatScreenEmptyState user={user} onChip={onChip} />
  }

  return (
    <>
      {loadingOlder && <ChatSkeleton />}
      <Virtuoso
        ref={virtuosoRef}
        data={grouped}
        firstItemIndex={firstItemIndex}
        initialTopMostItemIndex={grouped.length - 1}
        followOutput={followOutput}
        atBottomStateChange={onAtBottomChange}
        startReached={onStartReached}
        atBottomThreshold={80}
        overscan={600}
        increaseViewportBy={200}
        itemContent={itemContent}
        className="chat-virtuoso"
      />
    </>
  )
})
