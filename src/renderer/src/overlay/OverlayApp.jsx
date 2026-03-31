import { useCallback, useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import OverlayChatView from './components/OverlayChatView'
import OverlayActivityView from './components/OverlayActivityView'
import useChatStore from '../features/chat/state/chatStore'

export default function OverlayApp() {
  const [activeTab, setActiveTab] = useState('chat')

  useEffect(() => {
    useChatStore.getState().init()
    return () => useChatStore.getState().destroy()
  }, [])

  const handleClose = useCallback(() => {
    window.api?.overlay?.hide?.()
  }, [])

  const handleMouseEnter = useCallback(() => {
    window.api?.overlay?.setIgnoreMouseEvents?.(false)
  }, [])

  const handleHeaderMouseDown = useCallback(() => {
    window.api?.overlay?.setIgnoreMouseEvents?.(false)
  }, [])

  const resizeRef = useRef(null)

  const handleResizeStart = useCallback((e) => {
    e.preventDefault()
    const startY = e.screenY
    const startH = window.outerHeight
    const startWinY = window.screenY

    const onMove = (ev) => {
      const delta = startY - ev.screenY
      const newH = Math.max(300, Math.min(900, startH + delta))
      const heightDiff = newH - startH

      window.moveTo(window.screenX, startWinY - heightDiff)
      window.resizeTo(window.outerWidth, newH)
    }
    const onUp = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [])

  return (
    <div className="overlay-root">
      <div className="overlay-card" onMouseEnter={handleMouseEnter}>
        <div className="overlay-resize-handle" onMouseDown={handleResizeStart} ref={resizeRef} />
        <div className="overlay-header" onMouseDown={handleHeaderMouseDown}>
          <span className="overlay-title">VOX</span>
          <button
            className="overlay-close-btn"
            onClick={handleClose}
            type="button"
            title="Hide (Esc)"
          >
            <X size={14} />
          </button>
        </div>

        <div className="overlay-tabs">
          <button
            className={`overlay-tab ${activeTab === 'chat' ? 'overlay-tab-active' : ''}`}
            onClick={() => setActiveTab('chat')}
            type="button"
          >
            Chat
          </button>
          <button
            className={`overlay-tab ${activeTab === 'activity' ? 'overlay-tab-active' : ''}`}
            onClick={() => setActiveTab('activity')}
            type="button"
          >
            Activity
          </button>
        </div>

        {activeTab === 'chat' && <OverlayChatView />}

        {activeTab === 'activity' && <OverlayActivityView />}
      </div>
    </div>
  )
}
