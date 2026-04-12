import { useEffect, useState, useCallback } from 'react'
import { TEMPERATURE, MAX_TOKENS } from '../../main/config/settings'

function formatBytes(bytes) {
  if (!bytes) return ''
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`
  return `${(bytes / 1e6).toFixed(0)} MB`
}

const SUGGESTED = [
  {
    label: 'Qwen 3 4B (recommended, ~2.5 GB)',
    hfRepo: 'Qwen/Qwen3-4B-GGUF',
    hfFile: 'Qwen3-4B-Q4_K_M.gguf'
  },
  {
    label: 'Qwen 3 8B (stronger, ~5 GB)',
    hfRepo: 'Qwen/Qwen3-8B-GGUF',
    hfFile: 'Qwen3-8B-Q4_K_M.gguf'
  },
  {
    label: 'Qwen 3 14B (high quality, ~9 GB)',
    hfRepo: 'Qwen/Qwen3-14B-GGUF',
    hfFile: 'Qwen3-14B-Q4_K_M.gguf'
  },
  {
    label: 'Qwen 3 32B (best local, ~20 GB)',
    hfRepo: 'Qwen/Qwen3-32B-GGUF',
    hfFile: 'Qwen3-32B-Q4_K_M.gguf'
  }
]

export default function ModelSettingsPanel() {
  const [models, setModels] = useState([])
  const [activeModel, setActiveModel] = useState(null)
  const [downloads, setDownloads] = useState({})
  const [feedback, setFeedback] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [modelLoading, setModelLoading] = useState(false)
  const [loadPercent, setLoadPercent] = useState(0)

  // Inference settings state
  const [temperature, setTemperature] = useState(TEMPERATURE.default)
  const [maxTokens, setMaxTokens] = useState(MAX_TOKENS.default)
  const [contextSize, setContextSize] = useState(null)

  const refresh = useCallback(async () => {
    try {
      const [list, active] = await Promise.all([
        window.api.models.list(),
        window.api.models.getActive()
      ])
      setModels(list || [])
      setActiveModel(active)
    } catch {
      // ignore
    }
  }, [])

  useEffect(() => {
    async function init() {
      await refresh()

      try {
        const storedTemp = await window.api.store.get(TEMPERATURE.key)
        const storedMax = await window.api.store.get(MAX_TOKENS.key)
        if (storedTemp != null) setTemperature(storedTemp)
        if (storedMax != null) setMaxTokens(storedMax)
      } catch {
        // ignore
      }

      try {
        const ctx = await window.api.models.getContextSize()
        setContextSize(ctx)
      } catch {
        // ignore
      }
    }
    init()

    window.api.models
      .getDownloads?.()
      .then((active) => {
        if (active && Object.keys(active).length > 0) {
          setDownloads((prev) => ({ ...active, ...prev }))
        }
      })
      .catch(() => {})

    const unsubProgress = window.api.models.onProgress?.((ev) => {
      const filename = ev.filename ?? ev.path?.split('/').pop()
      if (ev.percent === -1) {
        setDownloads((prev) => {
          const n = { ...prev }
          delete n[filename]
          return n
        })
        setFeedback({ type: 'error', text: ev.error || 'Download failed.' })
      } else if (ev.percent >= 100) {
        setDownloads((prev) => {
          const n = { ...prev }
          delete n[filename]
          return n
        })
        refresh()
      } else {
        setDownloads((prev) => ({
          ...prev,
          [filename]: {
            percent: ev.percent,
            path: ev.path,
            downloadedBytes: ev.downloadedBytes,
            totalBytes: ev.totalBytes
          }
        }))
      }
    })
    const unsubNoModel = window.api.models.onNoModel?.(() => {
      setActiveModel(null)
      setModels([])
    })
    const unsubReady = window.api.models.onReady?.((data) => {
      setModelLoading(false)
      setLoadPercent(0)
      if (data?.path) setActiveModel(data.path)
      refresh()
    })
    const unsubError = window.api.models.onError?.(() => {
      setModelLoading(false)
      setLoadPercent(0)
      refresh()
    })
    const unsubLoadProgress = window.api.models.onLoadProgress?.((data) => {
      if (data.percent != null) {
        setModelLoading(true)
        setLoadPercent(data.percent)
      }
    })
    return () => {
      unsubProgress?.()
      unsubNoModel?.()
      unsubReady?.()
      unsubError?.()
      unsubLoadProgress?.()
    }
  }, [refresh])

  const showFeedback = (type, text) => {
    setFeedback({ type, text })
    setTimeout(() => setFeedback(null), 3500)
  }

  const handleSetActive = async (path) => {
    try {
      setModelLoading(true)
      setLoadPercent(0)
      await window.api.models.setActive(path)
    } catch (e) {
      setModelLoading(false)
      showFeedback('error', e?.message || 'Failed to switch model.')
    }
  }

  const handleDeleteConfirm = async (path) => {
    setConfirmDelete(null)
    try {
      await window.api.models.delete(path)
      if (activeModel === path) setActiveModel(null)
      setModels((prev) => prev.filter((m) => m.path !== path))
      refresh()
    } catch (e) {
      showFeedback('error', e?.message || 'Failed to delete.')
    }
  }

  const handlePick = async () => {
    try {
      const result = await window.api.models.pickFile()
      if (result) refresh()
    } catch {
      // ignore
    }
  }

  const handleDownload = async ({ hfRepo, hfFile }) => {
    setDownloads((prev) => ({
      ...prev,
      [hfFile]: { percent: 0, path: null, downloadedBytes: 0, totalBytes: 0 }
    }))
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

  const handleCancel = async (hfFile) => {
    const dl = downloads[hfFile]
    if (dl?.path) {
      try {
        await window.api.models.cancelDownload(dl.path)
      } catch {
        // cancel may fail if download already finished
      }
    }
    setDownloads((prev) => {
      const n = { ...prev }
      delete n[hfFile]
      return n
    })
  }

  const handleTemperatureChange = async (e) => {
    const val = parseFloat(e.target.value)
    setTemperature(val)
    try {
      await window.api.store.set(TEMPERATURE.key, val)
    } catch {
      // ignore
    }
  }

  const handleMaxTokensChange = async (e) => {
    const val = parseInt(e.target.value, 10)
    setMaxTokens(val)
    try {
      await window.api.store.set(MAX_TOKENS.key, val)
    } catch {
      // ignore
    }
  }

  return (
    <>
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

        {modelLoading && (
          <div
            style={{
              marginBottom: '12px',
              padding: '10px 12px',
              borderRadius: '10px',
              border: '1px solid rgba(236,137,184,0.25)',
              background: 'rgba(236,137,184,0.04)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
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
              <span style={{ fontSize: '0.82rem', color: 'var(--vox-text-primary)' }}>
                Loading model… {loadPercent}%
              </span>
            </div>
            <div
              style={{
                height: '4px',
                borderRadius: '999px',
                background: 'var(--vox-border-soft)',
                overflow: 'hidden'
              }}
            >
              <div
                style={{
                  height: '100%',
                  borderRadius: '999px',
                  background: 'rgba(236,137,184,0.7)',
                  width: `${loadPercent}%`,
                  transition: 'width 0.3s ease'
                }}
              />
            </div>
          </div>
        )}

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
                    {confirmDelete === m.path ? (
                      <>
                        <button
                          className="chat-task-card-btn"
                          onClick={() => handleDeleteConfirm(m.path)}
                          style={{ color: 'rgba(255,100,100,0.9)', fontWeight: 600 }}
                          type="button"
                        >
                          Confirm
                        </button>
                        <button
                          className="chat-task-card-btn"
                          onClick={() => setConfirmDelete(null)}
                          type="button"
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <button
                        className="chat-task-card-btn"
                        onClick={() => setConfirmDelete(m.path)}
                        style={{ color: 'rgba(255,100,100,0.75)' }}
                        type="button"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {models.length === 0 && Object.keys(downloads).length === 0 && (
          <p
            style={{
              fontSize: '0.86rem',
              color: 'var(--vox-text-secondary)',
              marginBottom: '14px'
            }}
          >
            No models downloaded. Browse for a .gguf file or download one below.
          </p>
        )}

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
                      {inProgress && (
                        <button
                          className="chat-task-card-btn"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleCancel(s.hfFile)
                          }}
                          style={{
                            fontSize: '0.7rem',
                            color: 'rgba(255,100,100,0.8)',
                            padding: '2px 6px',
                            flexShrink: 0
                          }}
                          type="button"
                        >
                          Cancel
                        </button>
                      )}
                    </button>
                    {inProgress && dl.percent > 0 && (
                      <div style={{ marginTop: '4px' }}>
                        <div
                          style={{
                            height: '3px',
                            borderRadius: '999px',
                            background: 'var(--vox-border-soft)',
                            overflow: 'hidden'
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
                        {dl.totalBytes > 0 && (
                          <div
                            style={{
                              fontSize: '0.68rem',
                              color: 'var(--vox-text-muted)',
                              marginTop: '3px',
                              textAlign: 'right'
                            }}
                          >
                            {formatBytes(dl.downloadedBytes)} / {formatBytes(dl.totalBytes)}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </details>
        </div>
      </article>

      <article className="workspace-panel-card" style={{ marginTop: '12px' }}>
        <h2>Inference Settings</h2>

        {/* Temperature */}
        <div style={{ marginBottom: '16px' }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '6px'
            }}
          >
            <span
              style={{ fontSize: '0.86rem', color: 'var(--vox-text-primary)', fontWeight: 500 }}
            >
              Temperature
            </span>
            <span
              style={{
                fontSize: '0.82rem',
                color: 'rgba(236,137,184,0.9)',
                fontWeight: 600,
                minWidth: '32px',
                textAlign: 'right'
              }}
            >
              {temperature.toFixed(2)}
            </span>
          </div>
          <input
            max={TEMPERATURE.max}
            min={TEMPERATURE.min}
            onChange={handleTemperatureChange}
            step={0.05}
            style={{ width: '100%', accentColor: '#ec89b8' }}
            type="range"
            value={temperature}
          />
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              marginTop: '3px'
            }}
          >
            <span style={{ fontSize: '0.68rem', color: 'var(--vox-text-muted)' }}>
              {TEMPERATURE.min} · deterministic
            </span>
            <span style={{ fontSize: '0.68rem', color: 'var(--vox-text-muted)' }}>
              {TEMPERATURE.max} · creative
            </span>
          </div>
        </div>

        {/* Max Tokens */}
        <div style={{ marginBottom: '16px' }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '6px'
            }}
          >
            <span
              style={{ fontSize: '0.86rem', color: 'var(--vox-text-primary)', fontWeight: 500 }}
            >
              Max Tokens
            </span>
            <span
              style={{
                fontSize: '0.82rem',
                color: 'rgba(236,137,184,0.9)',
                fontWeight: 600,
                minWidth: '48px',
                textAlign: 'right'
              }}
            >
              {maxTokens.toLocaleString()}
            </span>
          </div>
          <input
            max={MAX_TOKENS.max}
            min={MAX_TOKENS.min}
            onChange={handleMaxTokensChange}
            step={256}
            style={{ width: '100%', accentColor: '#ec89b8' }}
            type="range"
            value={maxTokens}
          />
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              marginTop: '3px'
            }}
          >
            <span style={{ fontSize: '0.68rem', color: 'var(--vox-text-muted)' }}>
              {MAX_TOKENS.min.toLocaleString()}
            </span>
            <span style={{ fontSize: '0.68rem', color: 'var(--vox-text-muted)' }}>
              {MAX_TOKENS.max.toLocaleString()}
            </span>
          </div>
        </div>

        {/* Context Size (read-only) */}
        <div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}
          >
            <span
              style={{ fontSize: '0.86rem', color: 'var(--vox-text-primary)', fontWeight: 500 }}
            >
              Context Size
            </span>
            <span
              style={{
                fontSize: '0.82rem',
                color: 'var(--vox-text-secondary)',
                fontWeight: 500
              }}
            >
              {contextSize !== null ? `${contextSize.toLocaleString()} tokens` : 'Loading…'}
            </span>
          </div>
          <p
            style={{
              fontSize: '0.72rem',
              color: 'var(--vox-text-muted)',
              marginTop: '4px',
              marginBottom: 0
            }}
          >
            Auto-detected from the running model server. Load a model to see the value.
          </p>
        </div>
      </article>
    </>
  )
}
