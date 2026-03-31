import { useEffect, useState, useCallback } from 'react'

function formatBytes(bytes) {
  if (!bytes) return ''
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`
  return `${(bytes / 1e6).toFixed(0)} MB`
}

const SUGGESTED = [
  {
    label: 'Qwen 2.5 3B (fast, ~2 GB)',
    hfRepo: 'Qwen/Qwen2.5-3B-Instruct-GGUF',
    hfFile: 'qwen2.5-3b-instruct-q4_k_m.gguf'
  },
  {
    label: 'Llama 3.2 3B (~2 GB)',
    hfRepo: 'bartowski/Llama-3.2-3B-Instruct-GGUF',
    hfFile: 'Llama-3.2-3B-Instruct-Q4_K_M.gguf'
  },
  {
    label: 'Mistral 7B (~4 GB)',
    hfRepo: 'TheBloke/Mistral-7B-Instruct-v0.2-GGUF',
    hfFile: 'mistral-7b-instruct-v0.2.Q4_K_M.gguf'
  }
]

export default function ModelSettingsPanel() {
  const [models, setModels] = useState([])
  const [activeModel, setActiveModel] = useState(null)
  const [downloads, setDownloads] = useState({})
  const [feedback, setFeedback] = useState(null)

  const refresh = useCallback(async () => {
    try {
      const [list, active] = await Promise.all([
        window.api.models.list(),
        window.api.models.getActive()
      ])
      setModels(list || [])
      setActiveModel(active)
      // eslint-disable-next-line no-empty
    } catch {}
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh()

    window.api.models
      .getDownloads?.()
      .then((active) => {
        if (active && Object.keys(active).length > 0) {
          setDownloads((prev) => ({ ...active, ...prev }))
        }
      })
      .catch(() => {})

    const unsub = window.api.models.onProgress?.((ev) => {
      const filename = ev.path?.split('/').pop() ?? ev.filename
      if (ev.percent >= 100) {
        setDownloads((prev) => {
          const n = { ...prev }
          delete n[filename]
          return n
        })
        refresh()
      } else {
        setDownloads((prev) => ({ ...prev, [filename]: { percent: ev.percent, path: ev.path } }))
      }
    })
    return () => unsub?.()
  }, [refresh])

  const showFeedback = (type, text) => {
    setFeedback({ type, text })
    setTimeout(() => setFeedback(null), 3500)
  }

  const handleSetActive = async (path) => {
    try {
      await window.api.models.setActive(path)
      setActiveModel(path)
      showFeedback('success', 'Model switched — applies on next message.')
    } catch (e) {
      showFeedback('error', e?.message || 'Failed to switch model.')
    }
  }

  const handleDelete = async (path) => {
    try {
      await window.api.models.delete(path)
      if (activeModel === path) setActiveModel(null)
      setModels((prev) => prev.filter((m) => m.path !== path))
    } catch (e) {
      showFeedback('error', e?.message || 'Failed to delete.')
    }
  }

  const handlePick = async () => {
    try {
      const result = await window.api.models.pickFile()
      if (result) refresh()
      // eslint-disable-next-line no-empty
    } catch {}
  }

  const handleDownload = async ({ hfRepo, hfFile }) => {
    setDownloads((prev) => ({ ...prev, [hfFile]: { percent: 0, path: null } }))
    try {
      await window.api.models.pull(hfRepo, hfFile)
    } catch (e) {
      setDownloads((prev) => {
        const n = { ...prev }
        delete n[hfFile]
        return n
      })
      showFeedback('error', e?.message || 'Download failed.')
    }
  }

  return (
    <article className="workspace-panel-card">
      <h2>Models</h2>

      {feedback && (
        <p
          className={`knowledge-rail-feedback knowledge-rail-feedback-${feedback.type}`}
          style={{ marginBottom: '10px' }}
        >
          {feedback.text}
        </p>
      )}

      {}
      {models.length > 0 && (
        <div style={{ display: 'grid', gap: '6px', marginBottom: '14px' }}>
          {models.map((m) => {
            const isActive = m.path === activeModel
            return (
              <div
                key={m.path}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '8px 10px',
                  borderRadius: '10px',
                  border: `1px solid ${isActive ? 'rgba(236,137,184,0.35)' : 'var(--vox-border-soft)'}`,
                  background: isActive ? 'rgba(236,137,184,0.06)' : 'rgba(255,255,255,0.02)'
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: '0.86rem',
                      fontWeight: 500,
                      color: 'var(--vox-text-primary)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    {m.filename}
                  </div>
                  <div
                    style={{
                      fontSize: '0.72rem',
                      color: 'var(--vox-text-muted)',
                      marginTop: '2px'
                    }}
                  >
                    {formatBytes(m.size)}
                    {m.hfRepo ? ` · ${m.hfRepo}` : ''}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '6px', flexShrink: 0, alignItems: 'center' }}>
                  {isActive ? (
                    <span
                      style={{
                        fontSize: '0.72rem',
                        color: 'rgba(236,137,184,0.9)',
                        fontWeight: 600,
                        padding: '2px 8px'
                      }}
                    >
                      Active
                    </span>
                  ) : (
                    <button
                      className="chat-task-card-btn"
                      onClick={() => handleSetActive(m.path)}
                      type="button"
                    >
                      Use
                    </button>
                  )}
                  <button
                    className="chat-task-card-btn"
                    onClick={() => handleDelete(m.path)}
                    style={{ color: 'rgba(255,100,100,0.75)' }}
                    type="button"
                  >
                    Delete
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {models.length === 0 && Object.keys(downloads).length === 0 && (
        <p
          style={{ fontSize: '0.86rem', color: 'var(--vox-text-secondary)', marginBottom: '14px' }}
        >
          No models downloaded. Browse for a .gguf file or download one below.
        </p>
      )}

      {}
      <div style={{ display: 'grid', gap: '6px' }}>
        <button className="knowledge-rail-add" onClick={handlePick} type="button">
          Browse for .gguf file…
        </button>

        <details open={models.length === 0} style={{ marginTop: '4px' }}>
          <summary
            style={{
              fontSize: '0.8rem',
              color: 'var(--vox-text-secondary)',
              cursor: 'pointer',
              userSelect: 'none',
              padding: '4px 0'
            }}
          >
            Download from HuggingFace
          </summary>
          <div style={{ display: 'grid', gap: '8px', marginTop: '8px' }}>
            {SUGGESTED.map((s) => {
              const dl = downloads[s.hfFile]
              const inProgress = dl !== undefined
              const exists = models.some((m) => m.filename === s.hfFile)
              return (
                <div key={s.hfFile}>
                  <button
                    className="knowledge-rail-add"
                    disabled={inProgress || exists}
                    onClick={() => handleDownload(s)}
                    style={{ justifyContent: 'flex-start', gap: '8px' }}
                    type="button"
                  >
                    {exists ? (
                      <span style={{ color: 'rgba(140,220,140,0.9)' }}>✓</span>
                    ) : inProgress ? (
                      <span
                        style={{
                          width: '12px',
                          height: '12px',
                          borderRadius: '50%',
                          border: '2px solid rgba(236,137,184,0.2)',
                          borderTopColor: '#ec89b8',
                          display: 'inline-block',
                          animation: 'workspaceButtonSpin 0.8s linear infinite',
                          flexShrink: 0
                        }}
                      />
                    ) : null}
                    <span style={{ flex: 1, textAlign: 'left' }}>
                      {inProgress
                        ? `Downloading… ${dl.percent > 0 ? `${dl.percent}%` : ''}`
                        : s.label}
                    </span>
                  </button>
                  {inProgress && dl.percent > 0 && (
                    <div
                      style={{
                        height: '3px',
                        borderRadius: '999px',
                        background: 'var(--vox-border-soft)',
                        overflow: 'hidden',
                        marginTop: '4px'
                      }}
                    >
                      <div
                        style={{
                          height: '100%',
                          borderRadius: '999px',
                          background: 'rgba(236,137,184,0.7)',
                          width: `${dl.percent}%`,
                          transition: 'width 0.3s ease'
                        }}
                      />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </details>
      </div>
    </article>
  )
}
