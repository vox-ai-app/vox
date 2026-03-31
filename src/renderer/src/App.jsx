import './shared/theme'
import { useEffect, useState } from 'react'
import LocalApp from './app/LocalApp'
import SetupScreen from './features/setup/SetupScreen'

const IS_MAC_OS = navigator.userAgent.toUpperCase().includes('MAC')

function App() {
  const [modelState, setModelState] = useState('booting')
  const [errorMsg, setErrorMsg] = useState('')
  const [setupPhase, setSetupPhase] = useState('checking')

  useEffect(() => {
    const unsubReady = window.api?.models?.onReady?.(() => {
      setModelState('ready')
      setErrorMsg('')
    })

    const unsubNoModel = window.api?.models?.onNoModel?.(() => {
      setModelState('no_model')
    })

    const unsubError = window.api?.models?.onError?.((err) => {
      setModelState('error')
      setErrorMsg(typeof err === 'string' ? err : err?.message || 'Model failed to load.')
    })

    const unsubSetup = window.api?.setup?.onPhase?.((data) => {
      setSetupPhase(data.phase)
    })

    window.api?.setup
      ?.getPhase?.()
      .then((phase) => {
        if (phase) setSetupPhase(phase)
      })
      .catch(() => {})

    window.api?.models
      ?.isReady?.()
      .then((ready) => {
        if (ready) setModelState('ready')
        else setModelState('loading')
      })
      .catch(() => setModelState('loading'))

    return () => {
      unsubReady?.()
      unsubNoModel?.()
      unsubError?.()
      unsubSetup?.()
    }
  }, [])

  const renderBody = () => {
    if (modelState === 'booting' || modelState === 'loading' || modelState === 'no_model') {
      return <SetupScreen setupPhase={setupPhase} noModel={modelState === 'no_model'} />
    }

    if (modelState === 'error') {
      return (
        <section className="screen-shell workspace-status-shell">
          <article className="status-card">
            <p className="status-badge status-badge-pending">Model error</p>
            <h1>Could not load model</h1>
            <p className="status-copy">{errorMsg}</p>
            <button
              className="secondary-button"
              onClick={() => {
                setModelState('loading')
                window.api?.models?.reload?.().catch(() => {})
              }}
              type="button"
            >
              Retry
            </button>
          </article>
        </section>
      )
    }

    return <LocalApp />
  }

  return (
    <>
      {IS_MAC_OS ? <div className="window-drag-region" /> : null}
      {renderBody()}
    </>
  )
}

export default App
