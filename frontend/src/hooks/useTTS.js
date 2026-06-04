import { useRef, useCallback, useEffect } from 'react'
import useStore from '../store/useStore'
import { wsClient } from '../services/ws'

export function useTTS() {
  const { setOrbState, sessionActive } = useStore()
  const utteranceRef = useRef(null)
  const isSpeakingRef = useRef(false)
  const voiceRef = useRef(null)
  // Keep a stable ref so the async onend callback always reads the latest value
  const sessionActiveRef = useRef(sessionActive)
  useEffect(() => { sessionActiveRef.current = sessionActive }, [sessionActive])

  // Stable ref to startListening — injected by VoiceOrb after useVoice is initialized
  const restartListeningRef = useRef(null)

  // Allow VoiceOrb to register the startListening function
  const registerRestart = useCallback((fn) => {
    restartListeningRef.current = fn
  }, [])

  // Pick the best available voice
  useEffect(() => {
    const pickVoice = () => {
      const voices = window.speechSynthesis?.getVoices() || []
      const preferred = [
        'Google US English',
        'Microsoft Aria Online',
        'Microsoft Jenny Online',
        'Samantha',
        'Alex',
      ]
      for (const name of preferred) {
        const match = voices.find((v) => v.name === name)
        if (match) { voiceRef.current = match; return }
      }
      const en = voices.find((v) => v.lang.startsWith('en'))
      if (en) voiceRef.current = en
    }

    pickVoice()
    window.speechSynthesis?.addEventListener('voiceschanged', pickVoice)
    return () => window.speechSynthesis?.removeEventListener('voiceschanged', pickVoice)
  }, [])

  // Listen for STOP_AUDIO events from server (interruption)
  useEffect(() => {
    const off = wsClient.on('STOP_AUDIO', () => {
      stopSpeaking()
    })
    return off
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const speak = useCallback((text, onEnd) => {
    if (!text || !window.speechSynthesis) return
    stopSpeaking()

    const utterance = new SpeechSynthesisUtterance(text)
    utterance.rate = 1.05
    utterance.pitch = 1.0
    utterance.volume = 1.0
    if (voiceRef.current) utterance.voice = voiceRef.current

    utterance.onstart = () => {
      isSpeakingRef.current = true
      setOrbState('speaking')
    }

    utterance.onend = () => {
      isSpeakingRef.current = false
      utteranceRef.current = null
      setOrbState('idle')
      // Call any explicit callback first (e.g. for CLARIFICATION auto-open)
      if (onEnd) onEnd()
      // ── Continuous Session Loop ──────────────────────────────────────
      // After AI finishes speaking, automatically re-open the mic if a
      // session is still active. This is the core of the continuous loop.
      if (sessionActiveRef.current && restartListeningRef.current) {
        // Small gap so the mic doesn't pick up audio artifacts from TTS
        setTimeout(() => {
          if (sessionActiveRef.current) {
            restartListeningRef.current()
          }
        }, 350)
      }
    }

    utterance.onerror = (e) => {
      if (e.error !== 'interrupted' && e.error !== 'canceled') {
        console.error('[TTS] error', e.error)
      }
      isSpeakingRef.current = false
      utteranceRef.current = null
      setOrbState('idle')
      // Still re-open mic on error if session is active
      if (sessionActiveRef.current && restartListeningRef.current) {
        setTimeout(() => {
          if (sessionActiveRef.current) {
            restartListeningRef.current()
          }
        }, 350)
      }
    }

    utteranceRef.current = utterance
    window.speechSynthesis.speak(utterance)
  }, [setOrbState])

  const stopSpeaking = useCallback(() => {
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel()
    }
    isSpeakingRef.current = false
    utteranceRef.current = null
  }, [])

  const isSpeaking = () => isSpeakingRef.current

  useEffect(() => () => stopSpeaking(), [stopSpeaking])

  return { speak, stopSpeaking, isSpeaking, registerRestart }
}
