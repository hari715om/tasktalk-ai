import React from 'react'
import useStore from '../store/useStore'

export default function StatusBar() {
  const { wsStatus, latency } = useStore()

  const label = {
    connected:    'Connected',
    connecting:   'Connecting…',
    disconnected: 'Disconnected',
  }[wsStatus] || wsStatus

  return (
    <div className="status-bar">
      <div className={`status-dot ${wsStatus}`} />
      <span className="status-text">{label}</span>
      {latency !== null && wsStatus === 'connected' && (
        <span className="status-latency">{latency}ms</span>
      )}
    </div>
  )
}
