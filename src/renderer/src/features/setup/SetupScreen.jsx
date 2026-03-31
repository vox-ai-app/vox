import { useEffect, useRef, useState } from 'react'
import voxLogo from '../../assets/vox.svg'

const SLOW_TIMEOUT_MS = 90_000

export default function SetupScreen({ setupPhase, noModel }) {
  const [sttStatus, setSttStatus] = useState('pending')
  const [sttProgress, setSttProgress] = useState(0)
  const [sttHasProgress, setSttHasProgress] = useState(false)
  const [llmPhase, setLlmPhase] = useState('pending')
  const [llmPercent, setLlmPercent] = useState(0)
  const [errorMsg, setErrorMsg] = useState('')
  const [slow, setSlow] = useState(false)
  const targetRef = useRef(null)
  const slowTimerRef = useRef(null)
  const llmStartedRef = useRef(false)

  const sttDone = sttStatus === 'done' || setupPhase === 'loading-llm' || setupPhase === 'done'

  const startLlmDownload = async () => {
    setLlmPhase('downloading')
    setLlmPercent(0)
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
        setLlmPhase('error')
        setErrorMsg('Something went wrong during setup. Please restart the app.')
      }
    })

    const unsubSttProgress = window.api?.models?.onSttProgress?.((data) => {
      if (data.total) {
        setSttHasProgress(true)
        setSttProgress(Math.round((data.loaded / data.total) * 100))
      }
    })

    const unsubLlmProgress = window.api.models.onProgress((data) => {
      if (!targetRef.current || data.filename !== targetRef.current.hfFile) return
      const p = data.percent ?? 0
      setLlmPercent(p)
      if (p >= 100) {
        clearTimeout(slowTimerRef.current)
        setSlow(false)
        setLlmPhase('loading')
        window.api.models.reload().catch(() => {})
      }
    })

    return () => {
      unsubSttStatus?.()
      unsubSttProgress?.()
      unsubLlmProgress?.()
      clearTimeout(slowTimerRef.current)
    }
  }, [])

  useEffect(() => {
    if (!noModel || llmStartedRef.current) return
    llmStartedRef.current = true
    const t = setTimeout(() => startLlmDownload(), 0)
    return () => clearTimeout(t)
  }, [noModel])

  const isError = llmPhase === 'error'

  const overallPercent = (() => {
    if (sttDone && llmPhase === 'loading') return 98
    if (sttDone && llmPhase === 'downloading') return 50 + Math.round(llmPercent / 2)
    if (sttHasProgress && !sttDone) return Math.round(sttProgress / 2)
    return null
  })()

  const isIndeterminate = overallPercent === null

  const statusLabel = (() => {
    if (isError) return null
    if (llmPhase === 'loading') return 'Almost ready\u2026'
    if (llmPhase === 'downloading') return `Downloading\u2026 ${overallPercent ?? ''}%`
    if (sttDone && (llmPhase === 'active' || setupPhase === 'loading-llm'))
      return 'Getting the AI ready\u2026'
    return 'Setting up\u2026'
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
          <div className="setup-progress-wrap">
            <div className="setup-progress-track">
              <div
                className={`setup-progress-fill${isIndeterminate ? ' setup-progress-indeterminate' : ''}`}
                style={isIndeterminate ? undefined : { width: `${overallPercent}%` }}
              />
            </div>
            <p className="setup-status-label">{statusLabel}</p>
          </div>
        )}

        {slow && llmPhase === 'downloading' && (
          <p className="setup-slow">Taking longer than usual \u2014 check your connection.</p>
        )}
      </div>
    </section>
  )
}
