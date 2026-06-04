import React, { useCallback, useEffect } from 'react'
import useStore from '../store/useStore'
import { useVoice } from '../hooks/useVoice'
import { useTTS } from '../hooks/useTTS'
import { wsClient } from '../services/ws'
import { Mic, Radio, Loader2, Volume2, AlertCircle, PhoneOff } from 'lucide-react'

// ── Labels based on orb state ─────────────────────────────────────────────────
function getLabel(orbState, sessionActive) {
  if (!sessionActive && orbState === 'idle') return 'Start Conversation'
  if (sessionActive && orbState === 'listening') return 'Listening…'
  if (orbState === 'thinking') return 'Thinking…'
  if (orbState === 'speaking') return 'Speaking…'
  if (orbState === 'error') return 'Error — tap to retry'
  return 'Start Conversation'
}

// ── Icons based on orb state + session ───────────────────────────────────────
function getIcon(orbState, sessionActive) {
  if (orbState === 'listening') return <Radio size={26} />
  if (orbState === 'thinking') return <Loader2 size={26} className="spin" />
  if (orbState === 'speaking') return <Volume2 size={26} />
  if (orbState === 'error') return <AlertCircle size={26} />
  // idle: show phone-off if session is being ended, mic if starting
  return <Mic size={26} />
}

function Waveform() {
  return (
    <div className="waveform">
      {Array.from({ length: 7 }, (_, i) => (
        <div key={i} className="waveform-bar" />
      ))}
    </div>
  )
}

export default function VoiceOrb() {
  const {
    orbState, setOrbState,
    sessionActive, setSessionActive,
    addMessage, setIsThinking,
  } = useStore()

  const { speak, stopSpeaking, registerRestart } = useTTS()

  const handleTranscript = useCallback((text) => {
    if (!text.trim()) {
      // If session is active and no text captured, just return to listening
      // (handled inside useVoice.onend already)
      return
    }
    addMessage('user', text)
    setIsThinking(true)
    setOrbState('thinking')

    const sent = wsClient.sendVoiceInput(text)
    if (!sent) {
      setIsThinking(false)
      setOrbState('error')
      speak('Connection lost. Please check your connection and try again.')
      addMessage('assistant', 'Connection lost. Please try again.')
      setTimeout(() => setOrbState(sessionActive ? 'idle' : 'idle'), 2500)
    }
  }, [addMessage, setIsThinking, setOrbState, speak, sessionActive])

  const { startListening, stopListening, isSupported } = useVoice({ onTranscript: handleTranscript })

  // ── Register startListening with TTS so it can reopen mic after speaking ───
  useEffect(() => {
    registerRestart(startListening)
  }, [startListening, registerRestart])

  // ── Wire AI_RESPONSE → TTS ────────────────────────────────────────────────
  useEffect(() => {
    const off = wsClient.on('AI_RESPONSE', (msg) => {
      if (msg.text) {
        speak(msg.text)
        // useTTS.onend will call startListening() automatically if sessionActive
      }
    })
    return off
  }, [speak])

  // ── Session toggle (the main orb click handler) ───────────────────────────
  const handleClick = useCallback(() => {
    // Barge-in: tap to interrupt the AI while it's speaking
    if (orbState === 'speaking') {
      stopSpeaking()
      wsClient.sendInterrupt()
      // If session is active, re-open mic immediately after interrupt
      if (sessionActive) {
        setOrbState('listening')
        setTimeout(() => startListening(), 200)
      } else {
        setOrbState('idle')
      }
      return
    }

    // While thinking, tapping does nothing (can't interrupt processing)
    if (orbState === 'thinking') return

    if (sessionActive) {
      // ── END SESSION ──────────────────────────────────────────────────
      setSessionActive(false)
      stopListening()
      stopSpeaking()
      setOrbState('idle')
    } else {
      // ── START SESSION ────────────────────────────────────────────────
      setSessionActive(true)
      startListening()
    }
  }, [
    orbState, sessionActive,
    startListening, stopListening,
    stopSpeaking, setOrbState, setSessionActive,
  ])

  const label = getLabel(orbState, sessionActive)
  const icon  = getIcon(orbState, sessionActive)

  return (
    <div className="orb-container">
      <div
        className="orb-wrapper"
        onClick={handleClick}
        role="button"
        tabIndex={0}
        aria-label={`Voice orb — ${label}`}
        onKeyDown={(e) => e.key === 'Enter' && handleClick()}
      >
        <div className="orb" data-state={orbState} data-session={sessionActive ? 'active' : 'idle'}>
          <div className="orb-ring orb-ring-1" />
          <div className="orb-ring orb-ring-2" />
          <div className="orb-ring orb-ring-3" />
          <div className="orb-inner">
            {orbState === 'listening'
              ? <Waveform />
              : <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{icon}</span>
            }
          </div>
        </div>
      </div>

      <span className="orb-label" data-state={orbState}>
        {label}
      </span>

      {!isSupported && (
        <p style={{ fontSize: '0.75rem', color: 'var(--danger)', marginTop: 4, textAlign: 'center' }}>
          Voice not supported. Please use Chrome or Edge.
        </p>
      )}

      {/* Idle — not in a session yet */}
      {!sessionActive && orbState === 'idle' && (
        <p className="voice-hint">
          Tap to begin. Try: <strong>"Create a task for gym at 7 AM"</strong>
          <br />or: <strong>"What are my tasks for today?"</strong>
        </p>
      )}

      {/* Session active — show end session tip */}
      {sessionActive && (orbState === 'listening' || orbState === 'idle') && (
        <p className="voice-hint session-hint">
          <PhoneOff size={12} style={{ display: 'inline', marginRight: 4 }} />
          Tap orb to end session
        </p>
      )}

      {/* Speaking — barge-in tip */}
      {orbState === 'speaking' && (
        <p className="voice-hint" style={{ color: 'var(--orb-speaking)' }}>
          Tap or speak to interrupt
        </p>
      )}
    </div>
  )
}
