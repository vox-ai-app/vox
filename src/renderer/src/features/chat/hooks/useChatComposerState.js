import { useCallback, useRef, useState } from 'react'
import { useTextareaAutosize } from '../../../shared/hooks/useTextareaAutosize'

const CHAT_INPUT_MAX_HEIGHT = 160

export function useChatComposerState({ clearSendError, sendError, sendMessage }) {
  const inputRef = useRef(null)
  const [hasContent, setHasContent] = useState(false)
  const { resizeNow, scheduleResize } = useTextareaAutosize(CHAT_INPUT_MAX_HEIGHT)

  const syncHasContent = useCallback(() => {
    const nextHasContent = (inputRef.current?.value.trim().length ?? 0) > 0
    setHasContent((prev) => (prev === nextHasContent ? prev : nextHasContent))
  }, [])

  const handleSend = useCallback(async () => {
    const element = inputRef.current
    const content = element ? element.value.trim() : ''
    if (!content) return
    if (element) {
      element.value = ''
      resizeNow(element)
    }
    setHasContent(false)
    if (sendError) clearSendError()
    await sendMessage(content)
  }, [clearSendError, resizeNow, sendError, sendMessage])

  const handleKeyDown = useCallback(
    (event) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault()
        void handleSend()
      }
    },
    [handleSend]
  )

  const handleInput = useCallback(() => {
    const element = inputRef.current
    scheduleResize(element)
    syncHasContent()
  }, [scheduleResize, syncHasContent])

  const handleChip = useCallback(
    (chip) => {
      const value = chip.endsWith('...') ? chip.slice(0, -3) : chip
      if (inputRef.current) {
        inputRef.current.value = value
        resizeNow(inputRef.current)
        inputRef.current.focus()
      }
      setHasContent(value.length > 0)
    },
    [resizeNow]
  )

  return {
    inputRef,
    canSend: hasContent,
    handleSend,
    handleKeyDown,
    handleInput,
    handleChip
  }
}
