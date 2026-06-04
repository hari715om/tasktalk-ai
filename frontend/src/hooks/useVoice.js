import { useRef, useCallback, useEffect } from 'react'
import useStore from '../store/useStore'

const SILENCE_TIMEOUT = 2500  // ms of silence before auto-stop
const MIN_CONFIDENCE = 0.5

export function useVoice({ onTranscript }) {
  const { orbState, setOrbState } = useStore()
  const recognitionRef = useRef(null)
  const silenceTimerRef = useRef(null)
  const isListeningRef = useRef(false)
  const finalTranscriptRef = useRef('')

  const isSupported = 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window

  const clearSilenceTimer = () => clearTimeout(silenceTimerRef.current)

  const startSilenceTimer = useCallback(() => {
    clearSilenceTimer()
    silenceTimerRef.current = setTimeout(() => {
      if (isListeningRef.current) {
        recognitionRef.current?.stop()
      }
    }, SILENCE_TIMEOUT)
  }, [])

  const startListening = useCallback(() => {
    if (!isSupported || isListeningRef.current) return
    if (orbState === 'thinking' || orbState === 'speaking') return

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
        onTranscript(text)
      } else {
        setOrbState('idle')
      }
    }

    recognition.onerror = (e) => {
      isListeningRef.current = false
      clearSilenceTimer()
      recognitionRef.current = null
      if (e.error !== 'aborted' && e.error !== 'no-speech') {
        setOrbState('error')
        setTimeout(() => setOrbState('idle'), 2000)
      } else {
        setOrbState('idle')
      }
    }

    recognitionRef.current = recognition
    recognition.start()
  }, [isSupported, orbState, onTranscript, setOrbState, startSilenceTimer])

  const stopListening = useCallback(() => {
    clearSilenceTimer()
    recognitionRef.current?.stop()
    isListeningRef.current = false
  }, [])

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
  }, [])

  return {
    isSupported,
    isListening: isListeningRef.current,
    startListening,
    stopListening,
    toggleListening,
  }
}
