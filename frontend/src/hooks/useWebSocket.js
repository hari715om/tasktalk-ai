import { useEffect, useRef, useCallback } from 'react'
import useStore from '../store/useStore'
import { wsClient } from '../services/ws'

export function useWebSocket() {
  const { token, sessionId, setWsStatus, setTasks, setHighlightedTask,
          addMessage, setIsThinking, setOrbState, setLatency, logout } = useStore()
  const cleanupRef = useRef([])

  const handleMessage = useCallback((msg) => {
    switch (msg.type) {
      case 'THINKING':
        setIsThinking(true)
        setOrbState('thinking')
        break

      case 'AI_RESPONSE':
        setIsThinking(false)
        addMessage('assistant', msg.text)
        break

      case 'TASK_UPDATE':
        setTasks(msg.tasks || [])
        // Highlight newest task
        if (msg.tasks?.length) {
          const newest = [...msg.tasks].sort(
            (a, b) => new Date(b.updated_at) - new Date(a.updated_at)
          )[0]
          if (newest) setHighlightedTask(newest.id)
        }
        break

      case 'AUTH_ERROR':
        // Stale token — DB was reset. Clear token so user is sent to login.
        logout()
        break

      case 'STOP_AUDIO':
        setOrbState('idle')
        break

      case 'ERROR':
        setIsThinking(false)
        setOrbState('error')
        setTimeout(() => setOrbState('idle'), 2500)
        break

      case 'PONG':
        break

      default:
        break
    }
  }, [addMessage, setIsThinking, setOrbState, setTasks, setHighlightedTask])

  useEffect(() => {
    const off1 = wsClient.on('message', handleMessage)
    const off2 = wsClient.on('status', setWsStatus)
    const off3 = wsClient.on('latency', setLatency)
    cleanupRef.current = [off1, off2, off3]

    wsClient.connect(token, sessionId, setWsStatus)

    return () => {
      cleanupRef.current.forEach((fn) => fn?.())
      wsClient.disconnect()
    }
  }, [token, sessionId]) // eslint-disable-line react-hooks/exhaustive-deps

  const sendVoiceInput = useCallback((transcript) => {
    return wsClient.sendVoiceInput(transcript)
  }, [])

  const sendInterrupt = useCallback(() => {
    return wsClient.sendInterrupt()
  }, [])

  return { sendVoiceInput, sendInterrupt }
}
