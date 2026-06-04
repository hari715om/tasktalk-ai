import React, { useCallback, useEffect } from 'react'
import useStore from '../store/useStore'
import { useVoice } from '../hooks/useVoice'
import { useTTS } from '../hooks/useTTS'
import { wsClient } from '../services/ws'
import { Mic, Radio, Loader2, Volume2, AlertCircle } from 'lucide-react'

const STATE_LABELS = {
  idle:      'Tap to speak',
  listening: 'Listening…',
  thinking:  'Thinking…',
  speaking:  'Speaking…',
  error:     'Try again',
}

const STATE_ICONS = {
  idle:      <Mic size={26} />,
  thinking:  <Loader2 size={26} className="spin" />,
  speaking:  <Volume2 size={26} />,
  error:     <AlertCircle size={26} />,
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
  const { orbState, setOrbState, addMessage, setIsThinking } = useStore()
  const { speak, stopSpeaking } = useTTS()

  const handleTranscript = useCallback((text) => {
    if (!text.trim()) { setOrbState('idle'); return }
    addMessage('user', text)
    setIsThinking(true)
    setOrbState('thinking')

    const sent = wsClient.sendVoiceInput(text)
    if (!sent) {
      setIsThinking(false)
      setOrbState('error')
      speak('Connection lost. Please check your connection and try again.')
      addMessage('assistant', 'Connection lost. Please try again.')
      setTimeout(() => setOrbState('idle'), 2500)
    }
  }, [addMessage, setIsThinking, setOrbState, speak])

  const { toggleListening, isSupported } = useVoice({ onTranscript: handleTranscript })

  // Wire AI_RESPONSE → TTS
  useEffect(() => {
    const off = wsClient.on('AI_RESPONSE', (msg) => {
      if (msg.text) {
        speak(msg.text, () => {
          if (msg.event === 'CLARIFICATION' || msg.event === 'CONFIRMATION_NEEDED') {
            toggleListening()
          }
        })
      }
    })
    return off
  }, [speak, toggleListening])

  const handleClick = useCallback(() => {
    if (orbState === 'speaking') {
      stopSpeaking()
      wsClient.sendInterrupt()
      setOrbState('idle')
      return
    }
    if (orbState === 'thinking') return
    toggleListening()
  }, [orbState, toggleListening, stopSpeaking, setOrbState])

  return (
    <div className="orb-container">
      <div
        className="orb-wrapper"
        onClick={handleClick}
        role="button"
        tabIndex={0}
        aria-label={`Voice orb — ${STATE_LABELS[orbState]}`}
        onKeyDown={(e) => e.key === 'Enter' && handleClick()}
      >
        <div className="orb" data-state={orbState}>
          <div className="orb-ring orb-ring-1" />
          <div className="orb-ring orb-ring-2" />
          <div className="orb-ring orb-ring-3" />
          <div className="orb-inner">
            {orbState === 'listening'
              ? <Waveform />
              : <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{STATE_ICONS[orbState]}</span>
            }
          </div>
        </div>
      </div>

      <span className="orb-label" data-state={orbState}>
        {STATE_LABELS[orbState]}
      </span>

      {!isSupported && (
        <p style={{ fontSize: '0.75rem', color: 'var(--danger)', marginTop: 4, textAlign: 'center' }}>
          Voice not supported. Please use Chrome or Edge.
        </p>
      )}

      {(orbState === 'idle' || orbState === 'error') && (
        <p className="voice-hint">
          Try: <strong>"Create a task for gym at 7 AM tomorrow"</strong>
          <br />or: <strong>"What are my evening tasks?"</strong>
        </p>
      )}

      {orbState === 'speaking' && (
        <p className="voice-hint" style={{ color: 'var(--orb-speaking)' }}>
          Tap to interrupt
        </p>
      )}
    </div>
  )
}
