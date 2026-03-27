import { useEffect, useState } from 'react'

function SystemSettingsPanel() {
  const [keepAwake, setKeepAwake] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    window.api.power
      .getKeepAwake()
      .then(setKeepAwake)
      .catch(() => {})
  }, [])

  const handleToggle = async () => {
    const next = !keepAwake
    setSaving(true)
    try {
      const result = await window.api.power.setKeepAwake(next)
      setKeepAwake(result?.active ?? next)
    } finally {
      setSaving(false)
    }
  }

  return (
    <article className="workspace-panel-card">
      <h2>System</h2>
      <p className="workspace-panel-subtitle">Control how Vox runs in the background.</p>

      <div className="settings-toggle-row">
        <div className="settings-toggle-info">
          <span className="settings-toggle-label">Always on</span>
          <span className="settings-toggle-description">
            Prevent your Mac from sleeping so Vox can execute background tasks uninterrupted.
          </span>
        </div>
        <button
          aria-pressed={keepAwake}
          className={`settings-toggle-btn${keepAwake ? ' settings-toggle-btn--on' : ''}`}
          disabled={saving}
          onClick={handleToggle}
          type="button"
        >
          <span className="settings-toggle-knob" />
        </button>
      </div>
    </article>
  )
}

export default SystemSettingsPanel
