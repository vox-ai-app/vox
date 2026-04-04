import { useState, useEffect } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { Loader2, ExternalLink, AlertCircle, Check, Eye, EyeOff, Smartphone } from 'lucide-react'
import Drawer from '../../../shared/components/Drawer'
import ChannelIcon from './ChannelIcon'

function StepItem({ number, step }) {
  return (
    <div className="ch-setup-step">
      <span className="ch-setup-step-num">{number}</span>
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
  )
}

function WhatsAppSetup({ qrCode, connecting, connected, error, onConnect }) {
  if (connected) {
    return (
      <div className="ch-setup-content">
        <div className="ch-setup-success">
          <div className="ch-setup-success-icon">
            <Check size={20} />
          </div>
          <p className="ch-setup-success-title">You're all set</p>
          <p className="ch-setup-success-desc">
            Vox is now linked to your WhatsApp. Send any message and it will reply automatically.
          </p>
        </div>
      </div>
    )
  }

  const hasQr = !!qrCode
  const isWaiting = connecting && !hasQr

  return (
    <div className="ch-setup-content">
      {!connecting && !hasQr && !error && (
        <>
          <p className="ch-setup-intro">
            No passwords or tokens needed — just scan a QR code with your phone's camera.
          </p>
          <button
            className="ch-setup-connect-btn"
            onClick={() => onConnect('whatsapp', {})}
            type="button"
          >
            <Smartphone size={15} />
            <span>Start</span>
          </button>
        </>
      )}

      {isWaiting && (
        <div className="ch-setup-qr-loading">
          <Loader2 className="channel-btn-spin" size={28} />
          <p className="ch-setup-qr-loading-label">Preparing QR code…</p>
          <p className="ch-setup-qr-loading-hint">This usually takes a few seconds</p>
        </div>
      )}

      {hasQr && !error && (
        <div className="ch-setup-qr-wrap">
          <div className="ch-setup-qr-box">
            <QRCodeSVG bgColor="#ffffff" fgColor="#1a1918" level="M" size={200} value={qrCode} />
          </div>
          <div className="ch-setup-qr-instructions">
            <p className="ch-setup-qr-instructions-title">Scan with your phone</p>
            <ol className="ch-setup-qr-instructions-list">
              <li>Open WhatsApp on your phone</li>
              <li>Go to Settings → Linked Devices</li>
              <li>Tap "Link a Device"</li>
              <li>Point your camera at this QR code</li>
            </ol>
          </div>
        </div>
      )}

      {error && (
        <div className="ch-setup-error">
          <AlertCircle size={14} />
          <span>{error}</span>
        </div>
      )}

      {error && (
        <button
          className="ch-setup-connect-btn ch-setup-retry-btn"
          onClick={() => onConnect('whatsapp', {})}
          type="button"
        >
          Try again
        </button>
      )}
    </div>
  )
}

function TokenSetup({ def, connecting, connected, error, onConnect }) {
  const [config, setConfig] = useState({})
  const [revealed, setRevealed] = useState({})

  const allFilled = def.fields.every((f) => config[f.key]?.trim())

  const handleConnect = () => {
    if (!allFilled) return
    onConnect(def.id, config)
  }

  if (connected) {
    return (
      <div className="ch-setup-content">
        <div className="ch-setup-success">
          <div className="ch-setup-success-icon">
            <Check size={20} />
          </div>
          <p className="ch-setup-success-title">You're all set</p>
          <p className="ch-setup-success-desc">{def.connectedHint}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="ch-setup-content">
      <div className="ch-setup-fields">
        {def.fields.map((f) => (
          <div className="ch-setup-field" key={f.key}>
            <label className="ch-setup-field-label" htmlFor={`setup-${def.id}-${f.key}`}>
              {f.label}
            </label>
            <div className="ch-setup-field-input-wrap">
              <input
                autoComplete="off"
                className="ch-setup-field-input"
                id={`setup-${def.id}-${f.key}`}
                onChange={(e) => setConfig((prev) => ({ ...prev, [f.key]: e.target.value }))}
                onKeyDown={(e) => e.key === 'Enter' && handleConnect()}
                placeholder={f.placeholder || ''}
                type={revealed[f.key] ? 'text' : 'password'}
                value={config[f.key] || ''}
              />
              <button
                className="ch-setup-field-reveal"
                onClick={() => setRevealed((prev) => ({ ...prev, [f.key]: !prev[f.key] }))}
                type="button"
              >
                {revealed[f.key] ? <EyeOff size={13} /> : <Eye size={13} />}
              </button>
            </div>
          </div>
        ))}
      </div>

      {error && (
        <div className="ch-setup-error">
          <AlertCircle size={14} />
          <span>{error}</span>
        </div>
      )}

      <button
        className="ch-setup-connect-btn"
        disabled={!allFilled || connecting}
        onClick={handleConnect}
        type="button"
      >
        {connecting ? (
          <>
            <Loader2 className="channel-btn-spin" size={14} />
            <span>Connecting…</span>
          </>
        ) : (
          <span>Connect</span>
        )}
      </button>
    </div>
  )
}

function ChannelSetupDrawer({
  def,
  open,
  onClose,
  connecting,
  connected,
  error,
  qrCode,
  onConnect
}) {
  if (!def) return null

  const errorMsg = error?.channelId === def.id ? error.message : null

  return (
    <Drawer onClose={onClose} open={open} title={`Set up ${def.label}`} width="420px">
      <div className="ch-setup-drawer">
        <div className="ch-setup-platform-header">
          <span className="ch-setup-platform-icon">
            <ChannelIcon channel={def.id} size={22} />
          </span>
          <div>
            <h3 className="ch-setup-platform-name">{def.label}</h3>
            <p className="ch-setup-platform-desc">{def.description}</p>
          </div>
        </div>

        {def.id === 'whatsapp' ? (
          <WhatsAppSetup
            connected={!!connected}
            connecting={!!connecting}
            error={errorMsg}
            onConnect={onConnect}
            qrCode={qrCode}
          />
        ) : (
          <TokenSetup
            connected={!!connected}
            connecting={!!connecting}
            def={def}
            error={errorMsg}
            onConnect={onConnect}
          />
        )}
      </div>
    </Drawer>
  )
}

export default ChannelSetupDrawer
