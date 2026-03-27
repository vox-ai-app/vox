import { useEffect, useState } from 'react'

export const useChatConnection = () => {
  const [status, setStatus] = useState({
    connected: false,
    sessionReady: false,
    state: 'idle',
    lastError: null
  })

  useEffect(() => {
    window.api?.chat
      ?.getStatus?.()
      .then((data) => {
        if (data?.status) {
          setStatus(data.status)
        }
      })
      .catch(() => {})

    if (!window.api?.chat?.onStatus) return

    const unsub = window.api.chat.onStatus((s) => {
      if (s) setStatus(s)
    })

    return unsub
  }, [])

  return status
}
