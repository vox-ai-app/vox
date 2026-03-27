import { useCallback, useRef } from 'react'
import { SAMPLE_RATE, SCRIPT_BUFFER_SIZE, SILENCE_TIMEOUT_MS } from '../utils/voice.constants'

export function useVoiceAudioRuntime(isActiveRef) {
  const audioCtxRef = useRef(null)
  const processorRef = useRef(null)
  const sourceRef = useRef(null)
  const micStreamRef = useRef(null)
  const silenceTimerRef = useRef(null)
  const playCtxRef = useRef(null)
  const playScheduleRef = useRef(0)
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

  const stopPlayback = useCallback(() => {
    playScheduleRef.current = 0
    if (playCtxRef.current) {
      playCtxRef.current.close().catch(() => {})
      playCtxRef.current = null
    }
  }, [])

  const stopVoiceAudio = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current)
      silenceTimerRef.current = null
    }
    stopMic()
    stopPlayback()
  }, [stopMic, stopPlayback])

  const primePlayback = useCallback(async () => {
    try {
      if (!playCtxRef.current || playCtxRef.current.state === 'closed') {
        playCtxRef.current = new AudioContext({ sampleRate: SAMPLE_RATE })
        playScheduleRef.current = playCtxRef.current.currentTime
      }
    } catch {
      void 0
    }
  }, [])

  const playPcmBuffer = useCallback(
    async (buffer) => {
      try {
        if (!playCtxRef.current || playCtxRef.current.state === 'closed') {
          playCtxRef.current = new AudioContext({ sampleRate: SAMPLE_RATE })
          playScheduleRef.current = playCtxRef.current.currentTime
        }
        const playbackContext = playCtxRef.current
        if (playbackContext.state === 'suspended') await playbackContext.resume()

        let pcm
        if (buffer instanceof ArrayBuffer) {
          pcm = new Int16Array(buffer)
        } else if (ArrayBuffer.isView(buffer)) {
          const cleanBuffer = buffer.buffer.slice(
            buffer.byteOffset,
            buffer.byteOffset + buffer.byteLength
          )
          pcm = new Int16Array(cleanBuffer)
        } else {
          return
        }
        if (pcm.length === 0) return

        const channelData = new Float32Array(pcm.length)
        for (let i = 0; i < pcm.length; i++) channelData[i] = pcm[i] / 32768

        const audioBuffer = playbackContext.createBuffer(1, channelData.length, SAMPLE_RATE)
        audioBuffer.copyToChannel(channelData, 0)
        const source = playbackContext.createBufferSource()
        source.buffer = audioBuffer
        source.connect(playbackContext.destination)
        const startAt = Math.max(playbackContext.currentTime, playScheduleRef.current)
        source.start(startAt)
        playScheduleRef.current = startAt + audioBuffer.duration
        resetSilenceTimer()
      } catch (error) {
        console.error('[voice] playPcmBuffer error:', error)
      }
    },
    [resetSilenceTimer]
  )

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
      if (!isActiveRef.current) return
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
  }, [isActiveRef, resetSilenceTimer])

  return {
    setSilenceHandler,
    resetSilenceTimer,
    stopPlayback,
    stopVoiceAudio,
    playPcmBuffer,
    primePlayback,
    startMicCapture
  }
}
