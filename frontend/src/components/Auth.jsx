import React, { useState } from 'react'
import useStore from '../store/useStore'
import { Mic } from 'lucide-react'

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1'

export default function Auth({ onGuestMode }) {
  const { setUser, setToken } = useStore()
  const [mode, setMode] = useState('login') // 'login' | 'signup'
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({ email: '', username: '', password: '' })

  const update = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const endpoint = mode === 'signup' ? '/auth/signup' : '/auth/login'
      const body = mode === 'signup'
        ? { email: form.email, username: form.username, password: form.password }
        : { email: form.email, password: form.password }

      const res = await fetch(`${API}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'Authentication failed')

      setToken(data.access_token)
      setUser(data.user)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-logo">
          <div className="auth-logo-icon"><Mic size={24} color="white" /></div>
          <span className="auth-logo-name">TaskTalk AI</span>
        </div>

        <h1 className="auth-title">
          {mode === 'login' ? 'Welcome back' : 'Create account'}
        </h1>
        <p className="auth-subtitle">
          {mode === 'login'
            ? 'Sign in to manage your tasks with voice'
            : 'Get started with voice-powered task management'}
        </p>

        <form className="auth-form" onSubmit={submit}>
          {mode === 'signup' && (
            <div className="form-group">
              <label className="form-label" htmlFor="auth-username">Username</label>
              <input
                id="auth-username"
                className="form-input"
                type="text"
                placeholder="johndoe"
                value={form.username}
                onChange={update('username')}
                required
                autoComplete="username"
              />
            </div>
          )}

          <div className="form-group">
            <label className="form-label" htmlFor="auth-email">Email</label>
            <input
              id="auth-email"
              className="form-input"
              type="email"
              placeholder="you@example.com"
              value={form.email}
              onChange={update('email')}
              required
              autoComplete="email"
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="auth-password">Password</label>
            <input
              id="auth-password"
              className="form-input"
              type="password"
              placeholder="••••••••"
              value={form.password}
              onChange={update('password')}
              required
              minLength={6}
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            />
          </div>

          {error && <div className="form-error">{error}</div>}

          <button
            id="auth-submit-btn"
            className="btn btn-primary btn-full"
            type="submit"
            disabled={loading}
          >
            {loading ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}
          </button>

          <button
            type="button"
            className="btn btn-ghost btn-full"
            onClick={onGuestMode}
            style={{ marginTop: 4 }}
          >
            Continue as guest
          </button>
        </form>

        <div className="auth-switch">
          {mode === 'login' ? (
            <>Don't have an account?{' '}
              <button onClick={() => { setMode('signup'); setError('') }}>Sign up</button>
            </>
          ) : (
            <>Already have an account?{' '}
              <button onClick={() => { setMode('login'); setError('') }}>Sign in</button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
