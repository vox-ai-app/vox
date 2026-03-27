import './shared/theme'
import { useEffect, useState } from 'react'
import voxLogo from './assets/vox.svg'
import LocalApp from './app/LocalApp'

const IS_MAC_OS = navigator.userAgent.toUpperCase().includes('MAC')

function App() {
  const [modelState, setModelState] = useState('booting')
  const [errorMsg, setErrorMsg] = useState('')

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
    }
  }, [])

  const renderBody = () => {
    if (modelState === 'booting' || modelState === 'loading') {
      return (
        <section className="boot-splash">
          <img alt="Vox" className="boot-splash-logo" src={voxLogo} />
          <span aria-hidden="true" className="boot-splash-ring" />
        </section>
      )
    }

    if (modelState === 'no_model') {
      return (
        <section className="screen-shell workspace-status-shell">
          <article className="status-card">
            <p className="status-badge status-badge-pending">No model configured</p>
            <h1>Select a model to get started</h1>
            <p className="status-copy">
              Download a model from the Settings page to start using Vox locally.
            </p>
            <button
              className="secondary-button"
              onClick={() => setModelState('ready')}
              type="button"
            >
              Continue anyway
            </button>
          </article>
        </section>
      )
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
