import { useEffect } from 'react'
import { X } from 'lucide-react'

function Drawer({ open, onClose, title, width = '400px', children }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  return (
    <>
      <div
        aria-hidden="true"
        className={`drawer-backdrop${open ? ' drawer-backdrop-open' : ''}`}
        onClick={onClose}
      />

      <aside
        aria-label={title}
        className={`drawer-panel${open ? ' drawer-panel-open' : ''}`}
        role="dialog"
        style={{ width }}
      >
        <div className="drawer-header">
          <span className="drawer-title">{title}</span>
          <button className="drawer-close-btn" onClick={onClose} type="button">
            <X size={15} />
          </button>
        </div>
        <div className="drawer-body">{children}</div>
      </aside>
    </>
  )
}

export default Drawer
