import { create } from 'zustand'

const useStore = create((set, get) => ({
  // ── Auth ────────────────────────────────────────────────────────────
  user: null,
  token: localStorage.getItem('tasktalk_token') || null,

  setUser: (user) => set({ user }),
  setToken: (token) => {
    if (token) localStorage.setItem('tasktalk_token', token)
    else localStorage.removeItem('tasktalk_token')
    set({ token })
  },
  logout: () => {
    localStorage.removeItem('tasktalk_token')
    set({ user: null, token: null })
  },

  // ── Voice / Orb state ───────────────────────────────────────────────
  // 'idle' | 'listening' | 'thinking' | 'speaking' | 'error'
  orbState: 'idle',
  setOrbState: (orbState) => set({ orbState }),

  // ── WebSocket ────────────────────────────────────────────────────────
  wsStatus: 'disconnected', // 'connecting' | 'connected' | 'disconnected'
  latency: null,
  setWsStatus: (wsStatus) => set({ wsStatus }),
  setLatency: (latency) => set({ latency }),

  // ── Transcript ───────────────────────────────────────────────────────
  transcript: [],
  isThinking: false,

  addMessage: (role, text) =>
    set((s) => ({
      transcript: [
        ...s.transcript,
        { id: Date.now(), role, text, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) },
      ],
    })),

  setIsThinking: (isThinking) => set({ isThinking }),
  clearTranscript: () => set({ transcript: [] }),

  // ── Tasks ────────────────────────────────────────────────────────────
  tasks: [],
  highlightedTaskId: null,

  setTasks: (tasks) => set({ tasks }),
  setHighlightedTask: (id) => {
    set({ highlightedTaskId: id })
    setTimeout(() => set({ highlightedTaskId: null }), 3000)
  },

  // ── Session ─────────────────────────────────────────────────────────
  sessionId: (() => {
    let sid = sessionStorage.getItem('tasktalk_session')
    if (!sid) {
      sid = `sess_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
      sessionStorage.setItem('tasktalk_session', sid)
    }
    return sid
  })(),
}))

export default useStore
