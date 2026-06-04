/**
 * WebSocket client wrapper.
 * Handles connection, reconnection with exponential backoff, and event dispatch.
 */

const WS_BASE = import.meta.env.VITE_WS_URL || 'ws://localhost:8000/ws'
const MAX_RECONNECT_DELAY = 16000
const PING_INTERVAL = 25000

let socket = null
let reconnectTimer = null
let pingTimer = null
let reconnectDelay = 1000
let listeners = {}
let isManualClose = false

function getWsUrl(token, sessionId) {
  const params = new URLSearchParams({ session_id: sessionId })
  if (token) params.set('token', token)
  return `${WS_BASE}?${params.toString()}`
}

function on(event, cb) {
  if (!listeners[event]) listeners[event] = []
  listeners[event].push(cb)
  return () => {
    listeners[event] = listeners[event].filter((f) => f !== cb)
  }
}

function emit(event, data) {
  ;(listeners[event] || []).forEach((cb) => cb(data))
}

function connect(token, sessionId, onStatusChange) {
  if (socket && socket.readyState === WebSocket.OPEN) return

  isManualClose = false
  onStatusChange?.('connecting')
  emit('status', 'connecting')

  socket = new WebSocket(getWsUrl(token, sessionId))

  socket.onopen = () => {
    reconnectDelay = 1000
    onStatusChange?.('connected')
    emit('status', 'connected')
    socket.send(JSON.stringify({ type: 'SYNC' }))
    startPing()
  }

  socket.onmessage = (ev) => {
    try {
      const msg = JSON.parse(ev.data)
      emit('message', msg)
      emit(msg.type, msg)
    } catch (e) {
      console.error('[WS] parse error', e)
    }
  }

  socket.onclose = () => {
    stopPing()
    onStatusChange?.('disconnected')
    emit('status', 'disconnected')
    if (!isManualClose) scheduleReconnect(token, sessionId, onStatusChange)
  }

  socket.onerror = () => {
    socket?.close()
  }
}

function scheduleReconnect(token, sessionId, onStatusChange) {
  clearTimeout(reconnectTimer)
  reconnectTimer = setTimeout(() => {
    reconnectDelay = Math.min(reconnectDelay * 2, MAX_RECONNECT_DELAY)
    connect(token, sessionId, onStatusChange)
  }, reconnectDelay)
}

function disconnect() {
  isManualClose = true
  stopPing()
  clearTimeout(reconnectTimer)
  socket?.close()
  socket = null
}

function send(data) {
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(data))
    return true
  }
  return false
}

function startPing() {
  pingTimer = setInterval(() => {
    const t = Date.now()
    send({ type: 'PING', ts: t })
    on('PONG', () => {
      emit('latency', Date.now() - t)
    })
  }, PING_INTERVAL)
}

function stopPing() {
  clearInterval(pingTimer)
}

function sendVoiceInput(transcript) {
  return send({ type: 'VOICE_INPUT', transcript })
}

function sendInterrupt() {
  return send({ type: 'INTERRUPT' })
}

export const wsClient = { connect, disconnect, send, sendVoiceInput, sendInterrupt, on, emit }
