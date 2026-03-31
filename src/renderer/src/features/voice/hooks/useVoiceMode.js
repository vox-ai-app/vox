import { useCallback, useEffect, useRef, useState } from 'react'
import { useVoiceAudioRuntime } from './useVoiceAudioRuntime'

export function useVoiceMode() {
  const [phase, setPhase] = useState('idle')
  const [transcript, setTranscript] = useState('')
  const [responseText, setResponseText] = useState('')
  const isActiveRef = useRef(false)
  const ttsQueueRef = useRef([])
  const ttsPlayingRef = useRef(false)
  const { setSilenceHandler, resetSilenceTimer, stopVoiceAudio, startMicCapture } =
    useVoiceAudioRuntime(isActiveRef, ttsPlayingRef)

  const playNextTtsRef = useRef(null)
  const playNextTts = useCallback(() => {
    if (!isActiveRef.current || ttsQueueRef.current.length === 0) {
      ttsPlayingRef.current = false
      if (isActiveRef.current && ttsQueueRef.current.length === 0) {
        setResponseText('')
        setPhase('listening')
        resetSilenceTimer()
      }
      return
    }
    ttsPlayingRef.current = true
    const text = ttsQueueRef.current.shift()
    setResponseText(text)
    setPhase('speaking')
    resetSilenceTimer()
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.onend = () => {
      if (!isActiveRef.current) return
      playNextTtsRef.current?.()
    }
    utterance.onerror = () => {
      if (!isActiveRef.current) return
      playNextTtsRef.current?.()
    }
    window.speechSynthesis.speak(utterance)
  }, [resetSilenceTimer])

  useEffect(() => {
    playNextTtsRef.current = playNextTts
  }, [playNextTts])

  const deactivate = useCallback(async () => {
    if (!isActiveRef.current) return
    isActiveRef.current = false
    window.speechSynthesis?.cancel()
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

    try {
      await startMicCapture()
    } catch {
      void deactivate()
    }
  }, [deactivate, startMicCapture])

  useEffect(() => {
    const unsub = window.api.voice.onActivate((payload) => {
      if (payload?.active === false) return
      void activate()
    })
    return () => unsub()
  }, [activate])

  useEffect(() => {
    const unsub = window.api.chat.onEvent((event) => {
      if (!isActiveRef.current) return

      if (event.type === 'hearing') {
        setPhase('hearing')
      }

      if (event.type === 'transcript' && event.data?.content) {
        window.speechSynthesis?.cancel()
        ttsQueueRef.current = []
        ttsPlayingRef.current = false
        setTranscript(event.data.content)
        setPhase('thinking')
        setResponseText('')
        resetSilenceTimer()
      }

      if (event.type === 'llm_response_chunk' && event.data?.content) {
        ttsQueueRef.current.push(event.data.content)
        if (!ttsPlayingRef.current) playNextTts()
      }

      if (event.type === 'llm_response' && event.data?.content) {
        ttsQueueRef.current.push(event.data.content)
        if (!ttsPlayingRef.current) playNextTts()
      }

      if (event.type === 'barge_in') {
        window.speechSynthesis?.cancel()
        ttsQueueRef.current = []
        ttsPlayingRef.current = false
        setResponseText('')
        resetSilenceTimer()
      }

      if (event.type === 'voice_error') {
        ttsQueueRef.current = []
        ttsPlayingRef.current = false
        setResponseText('')
        setPhase('listening')
        resetSilenceTimer()
      }
    })
    return () => unsub()
  }, [resetSilenceTimer, playNextTts])

  useEffect(() => {
    return () => {
      isActiveRef.current = false
      ttsQueueRef.current = []
      ttsPlayingRef.current = false
      window.speechSynthesis?.cancel()
      stopVoiceAudio()
    }
  }, [stopVoiceAudio])

  return {
    phase,
    transcript,
    responseText,
    isActive: phase !== 'idle',
    activate,
    dismiss: deactivate
  }
}
