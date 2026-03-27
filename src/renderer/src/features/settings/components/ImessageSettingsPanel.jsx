import { useEffect, useState } from 'react'

export default function ImessageSettingsPanel() {
  const [passphrase, setPassphrase] = useState('')
  const [savedPassphrase, setSavedPassphrase] = useState(null)
  const [isActive, setIsActive] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)

  useEffect(() => {
    window.api.imessage
      ?.getStatus()
      .then((s) => {
        setIsActive(Boolean(s?.active))
        setSavedPassphrase(s?.passphrase || null)
      })
      .catch(() => {})
  }, [])

  const handleConnect = async () => {
    if (!passphrase.trim()) return
    setSaveError(null)
    setSaving(true)
    try {
      const result = await window.api.imessage?.start(passphrase.trim())
      setIsActive(Boolean(result?.active))
      setSavedPassphrase(result?.passphrase || passphrase.trim())
      setPassphrase('')
    } catch (err) {
      setSaveError(err?.message || 'Failed to connect.')
    } finally {
      setSaving(false)
    }
  }

  const handleDisconnect = async () => {
    setSaving(true)
    try {
      await window.api.imessage?.stop()
      setIsActive(false)
      setSavedPassphrase(null)
    } finally {
      setSaving(false)
    }
  }

  const handleReconnect = async () => {
    if (!savedPassphrase) return
    setSaveError(null)
    setSaving(true)
    try {
      const result = await window.api.imessage?.start(savedPassphrase)
      setIsActive(Boolean(result?.active))
      setSavedPassphrase(result?.passphrase || savedPassphrase)
    } catch (err) {
      setSaveError(err?.message || 'Failed to reconnect.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <article className="workspace-panel-card">
      <h2>iMessage</h2>
      <p className="imsg-description">
        Send any iMessage starting with your passphrase on the first line — Vox will reply. Works
        from any contact, including yourself.
      </p>

      {saveError && <p className="imsg-error">{saveError}</p>}

      {savedPassphrase ? (
        <div className="imsg-active-card">
          <span className="imsg-live-dot" />
          <div className="imsg-active-meta">
            <span className="imsg-active-tag">{isActive ? 'Active' : 'Saved'}</span>
            <span className="imsg-active-name">
              {isActive ? 'Passphrase set' : 'Passphrase saved'}
            </span>
            <span className="imsg-active-handle">{savedPassphrase}</span>
          </div>
          {!isActive ? (
            <button
              className="imsg-connect-btn"
              disabled={saving}
              onClick={handleReconnect}
              type="button"
            >
              {saving ? 'Reconnecting…' : 'Reconnect'}
            </button>
          ) : null}
          <button
            className="imsg-disconnect-btn"
            disabled={saving}
            onClick={handleDisconnect}
            type="button"
          >
            {saving ? 'Stopping…' : 'Disconnect'}
          </button>
        </div>
      ) : (
        <div className="imsg-setup">
          <div className="imsg-passphrase-row">
            <div className="imsg-search-field">
              <input
                autoComplete="off"
                className="imsg-search-input"
                onChange={(e) => {
                  setPassphrase(e.target.value)
                  setSaveError(null)
                }}
                onKeyDown={(e) => e.key === 'Enter' && handleConnect()}
                placeholder="Enter a secret passphrase…"
                type="text"
                value={passphrase}
              />
            </div>
            <button
              className="imsg-connect-btn"
              disabled={!passphrase.trim() || saving}
              onClick={handleConnect}
              type="button"
            >
              {saving ? 'Connecting…' : 'Connect'}
            </button>
          </div>
          <p className="imsg-hint">
            Send a message with the passphrase on line 1 and your request on line 2. Works from any
            contact, including yourself.
          </p>
        </div>
      )}
    </article>
  )
}
