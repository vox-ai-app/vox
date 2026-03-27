export const getVoicePrimaryText = ({ phase, responseText, transcript }) => {
  if (phase === 'speaking' && responseText) return responseText
  if (phase === 'speaking') return 'Speaking…'
  if (phase === 'thinking' && responseText) return responseText
  if (phase === 'thinking') return 'Thinking…'
  if (transcript) return transcript
  return 'Listening…'
}

export const getVoiceSecondaryText = ({ phase, transcript }) => {
  if ((phase === 'thinking' || phase === 'speaking') && transcript) {
    return transcript
  }
  return null
}
