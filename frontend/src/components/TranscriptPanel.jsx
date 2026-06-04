import React, { useRef, useEffect } from 'react'
import useStore from '../store/useStore'
import { MessageSquare } from 'lucide-react'

export default function TranscriptPanel() {
  const { transcript, isThinking } = useStore()
  const bottomRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [transcript, isThinking])

  return (
    <div className="transcript-panel">
      <div className="transcript-header">
        <span className="transcript-title">Conversation</span>
        {transcript.length > 0 && (
          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
            {transcript.length} msgs
          </span>
        )}
      </div>

      <div className="transcript-body">
        {transcript.length === 0 && !isThinking ? (
          <div className="transcript-empty">
            <MessageSquare size={24} style={{ opacity: 0.5 }} />
            <p>Ready when you are.<br />Say something to start.</p>
          </div>
        ) : (
          <>
            {transcript.map((msg) => (
              <div key={msg.id} className={`transcript-msg ${msg.role}`}>
                <div className="transcript-bubble">{msg.text}</div>
                <span className="transcript-meta">{msg.time}</span>
              </div>
            ))}

            {isThinking && (
              <div className="transcript-msg assistant">
                <div className="transcript-bubble" style={{ padding: '10px 16px' }}>
                  <div className="typing-indicator">
                    <div className="typing-dot" />
                    <div className="typing-dot" />
                    <div className="typing-dot" />
                  </div>
                </div>
              </div>
            )}
          </>
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}
