'use client'

/**
 * Wakeup hook — listens for backend cold-start events.
 *
 * Render free-tier spins our backend down after 15 min idle. When a user
 * arrives during a cold start, the backend (see backend/routes/websocket.py
 * — Tzvi #32) emits a `wakeup` event with status='starting' on connect,
 * then immediately emits status='ready' once it's warm. The frontend uses
 * this to show a small "TEEPO מתעורר..." banner so the user knows their
 * action wasn't ignored — it'll just take a moment.
 *
 * Singleton socket: one connection per page lifecycle, shared by every
 * component that mounts the hook. Auto-reconnects, polling fallback.
 */

import { useEffect, useState } from 'react'
import { io, Socket } from 'socket.io-client'

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5000'

let _socket: Socket | null = null

function getSocket(): Socket {
  if (_socket) return _socket
  _socket = io(BACKEND, {
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
  })
  return _socket
}

export interface WakeupState {
  /** True while backend is in cold-start window. Triggers the banner. */
  starting: boolean
  /** Server-provided message — kept here so backend owns the copy. */
  message?: string
}

export function useWakeup(): WakeupState {
  const [state, setState] = useState<WakeupState>({ starting: false })

  useEffect(() => {
    const socket = getSocket()

    const onWakeup = (data: { status?: string; message?: string }) => {
      if (data?.status === 'starting') {
        setState({ starting: true, message: data.message || 'TEEPO מתעורר...' })
      } else if (data?.status === 'ready') {
        setState({ starting: false })
      }
    }

    socket.on('wakeup', onWakeup)

    // Safety timeout — if 'ready' never arrives (e.g. flaky network), drop
    // the banner after 30s so the user isn't stuck looking at it forever.
    const safety = setTimeout(() => {
      setState((s) => (s.starting ? { starting: false } : s))
    }, 30_000)

    return () => {
      socket.off('wakeup', onWakeup)
      clearTimeout(safety)
    }
  }, [])

  return state
}
