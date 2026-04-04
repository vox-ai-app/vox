import { useEffect, useRef, useState } from 'react'
import voxLogo from '../../assets/vox.svg'

const SLOW_TIMEOUT_MS = 90_000

function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return '0 MB'
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`
  return `${(bytes / 1e6).toFixed(0)} MB`
}

function StepIndicator({ number, label, status, percent, detail }) {
  const isDone = status === 'done'
  const isActive = status === 'active'

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: '12px',
        opacity: isDone ? 0.5 : isActive ? 1 : 0.35,
        transition: 'opacity 0.3s ease'
      }}
    >
      <div
        style={{
          width: '24px',
          height: '24px',
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '0.7rem',
          fontWeight: 700,
          flexShrink: 0,
          background: isDone
            ? 'rgba(140, 220, 140, 0.15)'
            : isActive
              ? 'rgba(236, 137, 184, 0.15)'
              : 'rgba(255, 255, 255, 0.05)',
          color: isDone ? 'rgba(140, 220, 140, 0.9)' : isActive ? '#ec89b8' : '#5c5a56',
          border: `1px solid ${isDone ? 'rgba(140, 220, 140, 0.25)' : isActive ? 'rgba(236, 137, 184, 0.3)' : 'rgba(255, 255, 255, 0.06)'}`
        }}
      >
        {isDone ? '✓' : number}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: '0.82rem',
            fontWeight: 500,
            color: isDone ? '#6b6965' : isActive ? '#f0ece6' : '#4e4c48',
            marginBottom: isActive && percent != null ? '8px' : '0'
          }}
        >
          {label}
          {detail && (
            <span style={{ fontWeight: 400, color: '#5c5a56', marginLeft: '6px' }}>{detail}</span>
          )}
        </div>
        {isActive && percent != null && (
          <div style={{ width: '100%' }}>
            <div
              style={{
                width: '100%',
                height: '6px',
                background: 'rgba(255, 255, 255, 0.06)',
                borderRadius: '999px',
                overflow: 'hidden'
              }}
            >
              <div
                style={{
                  height: '100%',
                  background: '#ec89b8',
                  borderRadius: '999px',
                  width: `${percent}%`,
                  transition: 'width 0.4s ease'
                }}
              />
            </div>
            <div
              style={{
                fontSize: '0.7rem',
                color: '#5c5a56',
                marginTop: '4px',
                textAlign: 'right'
              }}
            >
              {percent}%
            </div>
          </div>
        )}
        {isActive && percent == null && (
          <div
            style={{
              width: '100%',
              height: '6px',
              background: 'rgba(255, 255, 255, 0.06)',
              borderRadius: '999px',
              overflow: 'hidden',
              marginTop: '8px'
            }}
          >
            <div
              className="setup-progress-fill setup-progress-indeterminate"
              style={{ height: '100%', background: '#ec89b8', borderRadius: '999px' }}
            />
          </div>
        )}
      </div>
    </div>
  )
}

export default function SetupScreen({ setupPhase, noModel }) {
  const [sttStatus, setSttStatus] = useState('pending')
  const [sttProgress, setSttProgress] = useState(0)
  const [sttHasProgress, setSttHasProgress] = useState(false)
  const [engineStatus, setEngineStatus] = useState('pending')
  const [enginePercent, setEnginePercent] = useState(null)
  const [llmPhase, setLlmPhase] = useState('pending')
  const [llmPercent, setLlmPercent] = useState(0)
  const [llmDownloaded, setLlmDownloaded] = useState(0)
  const [llmTotal, setLlmTotal] = useState(0)
  const [errorMsg, setErrorMsg] = useState('')
  const [slow, setSlow] = useState(false)
  const [loadPercent, setLoadPercent] = useState(0)
  const targetRef = useRef(null)
  const slowTimerRef = useRef(null)
  const llmStartedRef = useRef(false)

  const sttDone = sttStatus === 'done' || setupPhase === 'loading-llm' || setupPhase === 'done'
  const engineDone = engineStatus === 'ready' || engineStatus === 'skipped'

  const startLlmDownload = async () => {
    setLlmPhase('downloading')
    setLlmPercent(0)
    setLlmDownloaded(0)
    setLlmTotal(0)
    setErrorMsg('')
    setSlow(false)
    clearTimeout(slowTimerRef.current)
    slowTimerRef.current = setTimeout(() => setSlow(true), SLOW_TIMEOUT_MS)

    try {
      const target = await window.api.models.getRecommended()
      targetRef.current = target
      await window.api.models.pull(target.hfRepo, target.hfFile)
    } catch (err) {
      clearTimeout(slowTimerRef.current)
      setLlmPhase('error')
      setErrorMsg(err?.message || 'Setup failed. Check your connection and try again.')
    }
  }

  useEffect(() => {
    const unsubSttStatus = window.api?.models?.onSttStatus?.((data) => {
      if (data.status === 'ready') {
        setSttStatus('done')
      } else if (data.status === 'error') {
        setSttStatus('error')
        setErrorMsg(data.message || 'Voice engine failed to initialize. Please restart the app.')
      }
    })

    const unsubSttProgress = window.api?.models?.onSttProgress?.((data) => {
      if (data.total) {
        setSttHasProgress(true)
        setSttProgress((prev) => Math.max(prev, Math.round((data.loaded / data.total) * 100)))
      }
    })

    const unsubLlmProgress = window.api.models.onProgress((data) => {
      if (!targetRef.current || data.filename !== targetRef.current.hfFile) return
      const p = data.percent ?? 0
      if (data.percent === -1) {
        setLlmPhase('error')
        setErrorMsg(data.error || 'Download failed.')
        return
      }
      setLlmPercent(p)
      if (data.downloadedBytes) setLlmDownloaded(data.downloadedBytes)
      if (data.totalBytes) setLlmTotal(data.totalBytes)
      if (p >= 100) {
        clearTimeout(slowTimerRef.current)
        setSlow(false)
        setLlmPhase('loading')
        setLoadPercent(0)
        window.api.models.reload().catch(() => {})
      }
    })

    const unsubLoadProgress = window.api.models.onLoadProgress?.((data) => {
      if (data.percent != null) setLoadPercent(data.percent)
    })

    const unsubEngineStatus = window.api?.models?.onEngineStatus?.((data) => {
      if (data.status === 'downloading') {
        setEngineStatus('downloading')
      } else if (data.status === 'ready') {
        setEngineStatus('ready')
        setEnginePercent(100)
      } else if (data.status === 'error') {
        setEngineStatus('error')
        setErrorMsg(data.error || 'Failed to install inference engine.')
      }
    })

    const unsubEngineProgress = window.api?.models?.onEngineProgress?.((data) => {
      if (data.percent != null) setEnginePercent(data.percent)
    })

    return () => {
      unsubSttStatus?.()
      unsubSttProgress?.()
      unsubLlmProgress?.()
      unsubLoadProgress?.()
      unsubEngineStatus?.()
      unsubEngineProgress?.()
      clearTimeout(slowTimerRef.current)
    }
  }, [])

  useEffect(() => {
    if (!noModel || llmStartedRef.current) return
    llmStartedRef.current = true
    const t = setTimeout(() => startLlmDownload(), 0)
    return () => clearTimeout(t)
  }, [noModel])

  useEffect(() => {
    if (sttDone && setupPhase === 'loading-llm' && engineStatus === 'pending') {
      const timer = setTimeout(() => {
        if (engineStatus === 'pending') setEngineStatus('skipped')
      }, 2000)
      return () => clearTimeout(timer)
    }
  }, [sttDone, setupPhase, engineStatus])

  const isError = llmPhase === 'error' || engineStatus === 'error' || sttStatus === 'error'

  const sttStepStatus = sttDone ? 'done' : 'active'
  const sttStepPercent = sttHasProgress ? sttProgress : null

  const engineStepStatus = (() => {
    if (!sttDone) return 'pending'
    if (engineDone) return 'done'
    if (engineStatus === 'downloading') return 'active'
    if (setupPhase === 'loading-llm') return 'active'
    return 'pending'
  })()

  const engineStepPercent = engineStatus === 'downloading' ? enginePercent : null

  const llmStepStatus = (() => {
    if (!sttDone || (!engineDone && engineStatus !== 'pending')) return 'pending'
    if (llmPhase === 'downloading' || llmPhase === 'loading') return 'active'
    if (
      llmPhase === 'pending' &&
      (setupPhase === 'loading-llm' || setupPhase === 'done') &&
      engineDone
    )
      return 'active'
    if (llmPhase === 'pending') return 'pending'
    return 'pending'
  })()

  const llmStepPercent = (() => {
    if (llmPhase === 'downloading') return llmPercent
    if (llmPhase === 'loading') return loadPercent
    if (llmStepStatus === 'active' && loadPercent > 0) return loadPercent
    if (llmStepStatus === 'active' && noModel) return 0
    if (llmStepStatus === 'active') return null
    return null
  })()

  const llmDetail = (() => {
    if (llmPhase === 'downloading' && llmDownloaded > 0 && llmTotal > 0)
      return `${formatBytes(llmDownloaded)} / ${formatBytes(llmTotal)}`
    if (llmPhase === 'downloading' && llmDownloaded > 0)
      return `${formatBytes(llmDownloaded)} downloaded`
    if (llmPhase === 'downloading') return 'Starting download\u2026'
    if (llmPhase === 'loading') return `Initializing model\u2026 ${loadPercent}%`
    if (llmStepStatus === 'active' && llmPhase === 'pending' && loadPercent > 0)
      return `Loading model\u2026 ${loadPercent}%`
    if (llmStepStatus === 'active' && llmPhase === 'pending' && noModel)
      return 'Preparing download\u2026'
    if (llmStepStatus === 'active' && llmPhase === 'pending') return 'Loading\u2026'
    return null
  })()

  return (
    <section className="setup-screen">
      <div className="setup-card">
        <img alt="Vox" className="setup-logo" src={voxLogo} />
        <h1 className="setup-title">Getting Vox ready</h1>
        <p className="setup-subtitle">This only takes a minute the first time.</p>

        {isError ? (
          <>
            <p className="setup-error-msg">{errorMsg}</p>
            <button
              className="secondary-button"
              onClick={() => window.location.reload()}
              type="button"
            >
              Try again
            </button>
          </>
        ) : (
          <div
            style={{
              width: '100%',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
              marginTop: '8px'
            }}
          >
            <StepIndicator
              number={1}
              label="Voice engine"
              status={sttStepStatus}
              percent={sttStepPercent}
            />
            <StepIndicator
              number={2}
              label="Inference engine"
              status={engineStepStatus}
              percent={engineStepPercent}
            />
            <StepIndicator
              number={3}
              label="AI model"
              status={llmStepStatus}
              percent={llmStepPercent}
              detail={llmDetail}
            />
          </div>
        )}

        {slow && llmPhase === 'downloading' && (
          <p className="setup-slow">Taking longer than usual \u2014 check your connection.</p>
        )}
      </div>
    </section>
  )
}
