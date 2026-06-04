import { useRef, useCallback, useEffect } from 'react'
import useStore from '../store/useStore'
import { wsClient } from '../services/ws'

const SILENCE_TIMEOUT = 2500  // ms of silence before auto-submitting
const MIN_CONFIDENCE = 0.5

export function useVoice({ onTranscript }) {
  const { orbState, setOrbState, sessionActive, setSessionActive } = useStore()
  const recognitionRef = useRef(null)
  const silenceTimerRef = useRef(null)
  const isListeningRef = useRef(false)
  const finalTranscriptRef = useRef('')
  // Keep a stable ref so callbacks inside recognition events can read latest value
  const sessionActiveRef = useRef(sessionActive)
  useEffect(() => { sessionActiveRef.current = sessionActive }, [sessionActive])

  const isSupported = 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window

  const clearSilenceTimer = useCallback(() => clearTimeout(silenceTimerRef.current), [])

  const startSilenceTimer = useCallback(() => {
    clearSilenceTimer()
    silenceTimerRef.current = setTimeout(() => {
      if (isListeningRef.current) {
        recognitionRef.current?.stop()
      }
    }, SILENCE_TIMEOUT)
  }, [clearSilenceTimer])

  const startListening = useCallback(() => {
    if (!isSupported || isListeningRef.current) return
    if (orbState === 'thinking') return

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    const recognition = new SpeechRecognition()

    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = 'en-US'
    recognition.maxAlternatives = 1

    finalTranscriptRef.current = ''

    recognition.onstart = () => {
      isListeningRef.current = true
      setOrbState('listening')
      startSilenceTimer()
    }

    recognition.onresult = (event) => {
      clearSilenceTimer()
      let interim = ''
      let final = ''

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]
        if (result.isFinal) {
          if (result[0].confidence >= MIN_CONFIDENCE || result[0].confidence === 0) {
            final += result[0].transcript
          }
        } else {
          interim += result[0].transcript
        }
      }

      // ── Barge-in: user starts speaking while AI is speaking ───────────
      if ((final || interim) && orbState === 'speaking') {
        window.speechSynthesis?.cancel()
        wsClient.sendInterrupt()
        // Collect any speech already captured
      }

      if (final) {
        finalTranscriptRef.current += ' ' + final
        startSilenceTimer()
      } else if (interim) {
        startSilenceTimer()
      }
    }

    recognition.onend = () => {
      isListeningRef.current = false
      clearSilenceTimer()
      const text = finalTranscriptRef.current.trim()
      recognitionRef.current = null

      if (text) {
        // Submit what was captured — the session loop will re-open mic via useTTS
        onTranscript(text)
      } else if (sessionActiveRef.current) {
        // No speech captured but session still active — re-open mic immediately
        // Small delay prevents tight infinite loops on no-speech
        setTimeout(() => startListening(), 300)
      } else {
        setOrbState('idle')
      }
    }

    recognition.onerror = (e) => {
      // 'no-speech' and 'aborted' are expected during normal session operation
      if (e.error === 'no-speech' || e.error === 'aborted') {
        // Do nothing here — onend will handle the restart/idle state transition
        return
      }

      // For serious errors (e.g. microphone permission denied), turn off the session
      sessionActiveRef.current = false
      setSessionActive(false)
      setOrbState('error')
      setTimeout(() => setOrbState('idle'), 2000)
    }

    recognitionRef.current = recognition
    recognition.start()
  }, [isSupported, orbState, onTranscript, setOrbState, startSilenceTimer, clearSilenceTimer])

  const stopListening = useCallback(() => {
    clearSilenceTimer()
    recognitionRef.current?.stop()
    recognitionRef.current?.abort()
    isListeningRef.current = false
  }, [clearSilenceTimer])

  const toggleListening = useCallback(() => {
    if (isListeningRef.current) {
      stopListening()
    } else {
      startListening()
    }
  }, [startListening, stopListening])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearSilenceTimer()
      recognitionRef.current?.abort()
    }
  }, [clearSilenceTimer])

  return {
    isSupported,
    isListening: isListeningRef.current,
    startListening,
    stopListening,
    toggleListening,
  }
}
