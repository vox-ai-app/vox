import { useCallback, useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import useChatStore from '../../features/chat/state/chatStore'

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

export default function ToastLayer() {
  const sendError = useChatStore((s) => s.sendError)
  const chatStatus = useChatStore((s) => s.chatStatus)
  const clearSendError = useChatStore((s) => s.clearSendError)
  const [toasts, setToasts] = useState([])
  const prevSendErrorRef = useRef('')
  const prevLastErrorRef = useRef(null)

  const push = useCallback((message, type = 'error') => {
    const id = nextId()
    setToasts((current) => [...current, { id, type, message }])
  }, [])

  const dismiss = useCallback(
    (id) => {
      setToasts((current) => current.filter((t) => t.id !== id))
      if (id === prevSendErrorRef.current) clearSendError()
    },
    [clearSendError]
  )

  useEffect(() => {
    if (!sendError) {
      prevSendErrorRef.current = ''
      return
    }
    if (sendError === prevSendErrorRef.current) return
    prevSendErrorRef.current = sendError
    setTimeout(() => push(sendError, 'error'), 0)
  }, [sendError, push])

  useEffect(() => {
    const err = chatStatus?.lastError
    if (!err?.message) return
    const prev = prevLastErrorRef.current
    if (prev && prev.message === err.message && prev.code === err.code) return
    prevLastErrorRef.current = err
    setTimeout(() => push(err.message, 'error'), 0)
  }, [chatStatus?.lastError, push])

  if (toasts.length === 0) return null

  return (
    <div className="app-toast-layer">
      {toasts.map((t) => (
        <SingleToast key={t.id} onDismiss={dismiss} toast={t} />
      ))}
    </div>
  )
}
