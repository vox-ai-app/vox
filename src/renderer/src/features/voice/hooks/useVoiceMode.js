import { useCallback, useEffect, useRef, useState } from 'react'
import { useVoiceAudioRuntime } from './useVoiceAudioRuntime'

export function useVoiceMode() {
  const [phase, setPhase] = useState('idle')
  const [transcript, setTranscript] = useState('')
  const [responseText, setResponseText] = useState('')
  const isActiveRef = useRef(false)
  const {
    setSilenceHandler,
    resetSilenceTimer,
    stopPlayback,
    stopVoiceAudio,
    playPcmBuffer,
    primePlayback,
    startMicCapture
  } = useVoiceAudioRuntime(isActiveRef)

  const deactivate = useCallback(async () => {
    if (!isActiveRef.current) return
    isActiveRef.current = false
    stopVoiceAudio()
    setPhase('idle')
    setTranscript('')
    setResponseText('')

    try {
      await window.api.chat.setMode('text')
    } catch {
      void 0
    }

    try {
      await window.api.voice.sessionEnd()
    } catch {
      void 0
    }
  }, [stopVoiceAudio])

  useEffect(() => {
    setSilenceHandler(() => {
      void deactivate()
    })
  }, [deactivate, setSilenceHandler])

  const activate = useCallback(async () => {
    if (isActiveRef.current) return
    isActiveRef.current = true
    setPhase('listening')
    setTranscript('')
    setResponseText('')

    try {
      await window.api.voice.sessionStart()
      await window.api.chat.setMode('voice')
    } catch {
      isActiveRef.current = false
      setPhase('idle')
      try {
        await window.api.voice.sessionEnd()
      } catch {
        void 0
      }
      return
    }

    await primePlayback()

    try {
      await startMicCapture()
    } catch {
      void deactivate()
    }
  }, [deactivate, primePlayback, startMicCapture])

  const dismiss = useCallback(() => {
    void deactivate()
  }, [deactivate])

  useEffect(() => {
    const unsubActivate = window.api.voice.onActivate(() => {
      void activate()
    })

    const unsubAudio = window.api.voice.onAudio((buffer) => {
      if (!isActiveRef.current) return
      setPhase('speaking')
      void playPcmBuffer(buffer)
    })

    return () => {
      unsubActivate()
      unsubAudio()
    }
  }, [activate, playPcmBuffer])

  useEffect(() => {
    const unsubEvent = window.api.chat.onEvent((event) => {
      if (!isActiveRef.current) return

      if (event.type === 'transcript' && event.data?.content) {
        setTranscript(event.data.content)
        setPhase('thinking')
        setResponseText('')
        resetSilenceTimer()
      }

      if (event.type === 'message_chunk' && event.data?.content) {
        setResponseText((current) => current + event.data.content)
        resetSilenceTimer()
      }

      if (event.type === 'audio_start') {
        setPhase('speaking')
      }

      if (event.type === 'audio_end') {
        setPhase('listening')
        setResponseText('')
        resetSilenceTimer()
      }

      if (event.type === 'barge_in') {
        stopPlayback()
        setPhase('listening')
        setResponseText('')
        resetSilenceTimer()
      }
    })

    return () => unsubEvent()
  }, [resetSilenceTimer, stopPlayback])

  useEffect(() => {
    return () => {
      isActiveRef.current = false
      stopVoiceAudio()
    }
  }, [stopVoiceAudio])

  return {
    phase,
    transcript,
    responseText,
    isActive: phase !== 'idle',
    activate,
    dismiss
  }
}
