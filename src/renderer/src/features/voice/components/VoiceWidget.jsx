import VoiceOrb from './VoiceOrb'
import { useVoiceMode } from '../hooks/useVoiceMode'
import { getVoicePrimaryText, getVoiceSecondaryText } from '../utils/voice.copy'

function CloseIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}

export default function VoiceWidget() {
  const { phase, transcript, responseText, isActive, dismiss } = useVoiceMode()

  if (!isActive) return null

  const primaryText = getVoicePrimaryText({ phase, responseText, transcript })
  const secondaryText = getVoiceSecondaryText({ phase, transcript })

  return (
    <div className="voice-widget" role="dialog" aria-label="Voice mode active">
      <div className="voice-widget-inner">
        <VoiceOrb phase={phase} />
        <div className="voice-widget-text">
          <span className="voice-widget-primary">{primaryText}</span>
          {secondaryText && <span className="voice-widget-secondary">{secondaryText}</span>}
        </div>
        <button className="voice-dismiss-btn" onClick={dismiss} title="Stop voice mode" type="button">
          <CloseIcon />
        </button>
      </div>
    </div>
  )
}
