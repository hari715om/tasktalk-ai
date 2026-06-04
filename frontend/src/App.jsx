import React, { useState, useEffect } from 'react'
import useStore from './store/useStore'
import { Mic } from 'lucide-react'
import { useWebSocket } from './hooks/useWebSocket'
import VoiceOrb from './components/VoiceOrb'
import TranscriptPanel from './components/TranscriptPanel'
import TaskPanel from './components/TaskPanel'
import StatusBar from './components/StatusBar'
import Auth from './components/Auth'

export default function App() {
  const { user, token, logout, setUser, setTasks } = useStore()
  const [guestMode, setGuestMode] = useState(false)
  const API = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1'

  // Start WS connection whenever user/token is set or in guest mode
  const isReady = guestMode || !!token
  useWebSocket()

  // Restore user from token on mount, and force-logout on 401 (stale token)
  useEffect(() => {
    if (token && !user) {
      fetch(`${API}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((r) => {
          if (r.status === 401) { logout(); return null }
          return r.ok ? r.json() : null
        })
        .then((u) => { if (u) setUser(u) })
        .catch(() => {})
    }
  }, [token, user, setUser, logout, API])

  // Reliable REST-based task load on mount (survives page refresh, WS reconnects)
  useEffect(() => {
    const headers = token ? { Authorization: `Bearer ${token}` } : {}
    fetch(`${API}/tasks`, { headers })
      .then((r) => r.ok ? r.json() : [])
      .then((tasks) => { if (Array.isArray(tasks)) setTasks(tasks) })
      .catch(() => {})
  }, [token, API, setTasks])

  // Show auth screen only if no session at all
  if (!isReady && !token) {
    return (
      <Auth
        onGuestMode={() => setGuestMode(true)}
      />
    )
  }

  return (
    <div className="app-layout">
      {/* Header */}
      <header className="app-header">
        <div className="app-logo">
          <div className="app-logo-icon"><Mic size={16} color="white" /></div>
          TaskTalk AI
        </div>

        <div className="app-header-actions">
          {guestMode && !token && (
            <span className="tag warning">Guest</span>
          )}
          {user && (
            <span className="tag">{user.username}</span>
          )}
          {token ? (
            <button
              id="logout-btn"
              className="btn btn-ghost btn-sm"
              onClick={() => { logout(); setGuestMode(false) }}
            >
              Sign out
            </button>
          ) : guestMode ? (
            <button
              id="signin-btn"
              className="btn btn-ghost btn-sm"
              onClick={() => { setGuestMode(false) }}
            >
              Sign in
            </button>
          ) : null}
        </div>
      </header>

      {/* Main voice area */}
      <main className="app-main">
        <VoiceOrb />
        <TranscriptPanel />
      </main>

      {/* Task sidebar */}
      <aside className="app-sidebar">
        <TaskPanel />
        <StatusBar />
      </aside>
    </div>
  )
}
