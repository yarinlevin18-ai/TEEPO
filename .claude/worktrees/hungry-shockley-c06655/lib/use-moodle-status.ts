'use client'

/**
 * useMoodleStatus — polls the backend for the live Moodle session
 * state and mirrors any change into `db.settings.moodle_connected`.
 *
 * Why this exists: the TopNav pill used to read a static boolean
 * that was only refreshed when the user visited /moodle. That meant
 * once the backend session expired (every ~15min on Render free tier)
 * the pill silently lied — said "connected" while sync would fail.
 *
 * This hook puts the truth back: every 90s we ping
 * /api/university/status and update Drive if the value flipped.
 * Reads are cheap (the backend just checks an in-memory session
 * dict), writes to Drive only happen on actual state changes so we
 * don't spam Drive with no-op updates.
 *
 * Polling cadence:
 *   - First check fires after a 5s settle delay (let the page hydrate)
 *   - Then every 90s while the tab is alive
 *   - Pause when the tab is hidden (no point polling a tab the user
 *     isn't looking at — and we don't want to keep Render's container
 *     warm for free if they switched away)
 *
 * Not started inside the hook: any sync/scrape — that's useAutoSync's
 * job. This hook only mirrors live STATUS, not data.
 */

import { useEffect, useRef } from 'react'
import { useDB } from './db-context'
import { BACKEND_URL as BACKEND } from './backend-url'
import { supabase } from './supabase'

const POLL_INTERVAL_MS = 90_000      // 90s — matches the backend's session check cost
const STARTUP_DELAY_MS = 5_000       // wait for page to settle

interface StatusResponse {
  moodle?: boolean
  portal?: boolean
  login_status?: Record<string, string>
}

async function authHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession()
  return session?.access_token
    ? { Authorization: `Bearer ${session.access_token}` }
    : {}
}

/** Single status fetch. Returns null on any failure (we want the
 *  loop to keep ticking — a one-off network blip shouldn't kill the
 *  poller). 8s timeout so a Render cold-start doesn't block the UI. */
async function fetchStatus(): Promise<StatusResponse | null> {
  try {
    const headers = await authHeaders()
    const res = await fetch(`${BACKEND}/api/university/status`, {
      headers,
      signal: AbortSignal.timeout(8_000),
    })
    if (!res.ok) return null
    return (await res.json()) as StatusResponse
  } catch {
    return null
  }
}

/**
 * Mount once at the dashboard layout level. Cheap — one timer +
 * one fetch every 90s.
 */
export function useMoodleStatus(): void {
  const { db, ready, updateSettings } = useDB() as any
  const cachedRef = useRef<boolean | undefined>(undefined)

  useEffect(() => {
    if (!ready) return

    // Seed the cached value from settings so we don't write on the
    // first poll just because we "forgot" the prior state.
    if (cachedRef.current === undefined) {
      cachedRef.current = Boolean(db?.settings?.moodle_connected)
    }

    let cancelled = false
    let interval: ReturnType<typeof setInterval> | null = null

    async function tick() {
      if (cancelled) return
      if (typeof document !== 'undefined' && document.hidden) return
      const status = await fetchStatus()
      if (cancelled) return
      if (!status) return  // network blip — try again next tick
      const live = Boolean(status.moodle)
      if (cachedRef.current !== live) {
        cachedRef.current = live
        if (typeof updateSettings === 'function') {
          try { await updateSettings({ moodle_connected: live }) } catch { /* non-fatal */ }
        }
      }
    }

    // First check after a settle delay.
    const startupTimer = setTimeout(() => {
      tick()
      interval = setInterval(tick, POLL_INTERVAL_MS)
    }, STARTUP_DELAY_MS)

    // Also re-check whenever the tab becomes visible again — if the
    // user was away for an hour, give them fresh state immediately.
    function onVisibility() {
      if (!document.hidden) tick()
    }
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisibility)
    }

    return () => {
      cancelled = true
      clearTimeout(startupTimer)
      if (interval) clearInterval(interval)
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisibility)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready])
}
