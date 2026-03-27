import { useCallback } from 'react'

export const useChatActions = () => {
  const sendMessage = useCallback(async (message) => {
    try {
      await window.api?.chat?.sendMessage?.(message)
    } catch (err) {
      console.error('Failed to send message:', err)
    }
  }, [])

  return { sendMessage }
}
