import { useCallback, useState } from 'react'

let _seq = 0
const nextId = () => `toast-${++_seq}`

export function useToast() {
  const [toasts, setToasts] = useState([])

  const push = useCallback((message, type = 'error') => {
    const id = nextId()
    setToasts((current) => [...current, { id, type, message }])
  }, [])

  const dismiss = useCallback((id) => {
    setToasts((current) => current.filter((t) => t.id !== id))
  }, [])

  return { toasts, push, dismiss }
}
