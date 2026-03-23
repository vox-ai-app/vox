import { useCallback, useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'

let _seq = 0
const nextId = () => `toast-${++_seq}`

function SingleToast({ toast, onDismiss }) {
  const [exiting, setExiting] = useState(false)
  const timerRef = useRef(null)

  const dismiss = useCallback(() => {
    clearTimeout(timerRef.current)
    setExiting(true)
    setTimeout(() => onDismiss(toast.id), 300)
  }, [onDismiss, toast.id])

  useEffect(() => {
    timerRef.current = setTimeout(dismiss, 5500)
    return () => clearTimeout(timerRef.current)
  }, [dismiss])

  return (
    <div className={`app-toast app-toast-${toast.type}${exiting ? ' app-toast-exit' : ''}`}>
      <p className="app-toast-msg">{toast.message}</p>
      <button aria-label="Dismiss" className="app-toast-close" onClick={dismiss} type="button">
        <X size={11} />
      </button>
      <span className="app-toast-bar" />
    </div>
  )
}

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

export default function ToastLayer({ toasts = [], onDismiss }) {
  if (toasts.length === 0) return null

  return (
    <div className="app-toast-layer">
      {toasts.map((t) => (
        <SingleToast key={t.id} onDismiss={onDismiss} toast={t} />
      ))}
    </div>
  )
}
