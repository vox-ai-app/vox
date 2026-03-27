import { useCallback, useRef, useState } from 'react'

const START_INDEX = 100_000

export function useChatStageState(messages, prependCount) {
  const virtuosoRef = useRef(null)
  const [isAtBottom, setIsAtBottom] = useState(true)

  const firstItemIndex = START_INDEX - prependCount

  const scrollToBottom = useCallback(() => {
    virtuosoRef.current?.scrollToIndex({
      index: 'LAST',
      behavior: 'smooth'
    })
  }, [])

  return {
    virtuosoRef,
    firstItemIndex,
    isAtBottom,
    setIsAtBottom,
    scrollToBottom
  }
}
