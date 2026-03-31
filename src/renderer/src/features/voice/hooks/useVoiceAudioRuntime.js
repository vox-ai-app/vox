import { useCallback, useRef } from 'react'
import { SAMPLE_RATE, SCRIPT_BUFFER_SIZE, SILENCE_TIMEOUT_MS } from '../utils/voice.constants'

export function useVoiceAudioRuntime(isActiveRef, isMutedRef) {
  const audioCtxRef = useRef(null)
  const processorRef = useRef(null)
  const sourceRef = useRef(null)
  const micStreamRef = useRef(null)
  const silenceTimerRef = useRef(null)
  const silenceHandlerRef = useRef(null)

  const setSilenceHandler = useCallback((handler) => {
    silenceHandlerRef.current = handler
  }, [])

  const resetSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current)
    silenceTimerRef.current = setTimeout(() => {
      if (isActiveRef.current) silenceHandlerRef.current?.()
    }, SILENCE_TIMEOUT_MS)
  }, [isActiveRef])

  const stopMic = useCallback(() => {
    if (processorRef.current) {
      try {
        processorRef.current.disconnect()
      } catch {
        void 0
      }
      processorRef.current = null
    }
    if (sourceRef.current) {
      try {
        sourceRef.current.disconnect()
      } catch {
        void 0
      }
      sourceRef.current = null
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((track) => track.stop())
      micStreamRef.current = null
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {})
      audioCtxRef.current = null
    }
  }, [])

  const stopVoiceAudio = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current)
      silenceTimerRef.current = null
    }
    stopMic()
  }, [stopMic])

  const startMicCapture = useCallback(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        sampleRate: SAMPLE_RATE,
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    })
    micStreamRef.current = stream
    const audioContext = new AudioContext({ sampleRate: SAMPLE_RATE })
    audioCtxRef.current = audioContext
    const source = audioContext.createMediaStreamSource(stream)
    sourceRef.current = source
    const processor = audioContext.createScriptProcessor(SCRIPT_BUFFER_SIZE, 1, 1)
    processorRef.current = processor
    processor.onaudioprocess = (event) => {
      if (!isActiveRef.current || isMutedRef?.current) return
      const float32 = event.inputBuffer.getChannelData(0)
      const int16 = new Int16Array(float32.length)
      for (let i = 0; i < float32.length; i++) {
        const s = Math.max(-1, Math.min(1, float32[i]))
        int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff
      }
      window.api?.voice?.sendAudio(int16.buffer).catch?.(() => {})
      resetSilenceTimer()
    }
    source.connect(processor)
    processor.connect(audioContext.destination)
    resetSilenceTimer()
  }, [isActiveRef, isMutedRef, resetSilenceTimer])

  return {
    setSilenceHandler,
    resetSilenceTimer,
    stopVoiceAudio,
    startMicCapture
  }
}
