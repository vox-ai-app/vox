import { useEffect } from 'react'
import { X, ExternalLink } from 'lucide-react'
import ChannelIcon from './ChannelIcon'

function SetupGuideModal({ def, open, onClose }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!def) return null

  return (
    <>
      <div
        aria-hidden="true"
        className={`ch-modal-backdrop${open ? ' ch-modal-backdrop-open' : ''}`}
        onClick={onClose}
      />
      <div
        aria-label={`How to set up ${def.label}`}
        className={`ch-modal-panel${open ? ' ch-modal-panel-open' : ''}`}
        role="dialog"
      >
        <div className="ch-modal-header">
          <div className="ch-modal-header-left">
            <span className="ch-modal-header-icon">
              <ChannelIcon channel={def.id} size={18} />
            </span>
            <span className="ch-modal-header-title">How to set up {def.label}</span>
          </div>
          <button className="ch-modal-close" onClick={onClose} type="button">
            <X size={14} />
          </button>
        </div>
        <div className="ch-modal-body">
          <div className="ch-modal-steps">
            {def.steps.map((step, i) => (
              <div className="ch-setup-step" key={i}>
                <span className="ch-setup-step-num">{i + 1}</span>
                <div className="ch-setup-step-body">
                  <span className="ch-setup-step-text">{step.title}</span>
                  {step.link && (
                    <a
                      className="ch-setup-step-link"
                      href={step.link}
                      onClick={(e) => {
                        e.preventDefault()
                        window.open(step.link, '_blank')
                      }}
                      rel="noopener noreferrer"
                    >
                      Open <ExternalLink size={11} />
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}

export default SetupGuideModal
