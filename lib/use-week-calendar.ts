'use client'

/**
 * useWeekCalendar — pulls the user's primary Google Calendar events for
 * the current week (Sunday→Saturday) and exposes them grouped by day +
 * hour so the dashboard grid can render them at the right cell.
 *
 * Pulls automatically on mount, refetches when `googleToken` rotates, and
 * exposes `refresh()` for manual reloads. Falls back to empty list on any
 * failure — the dashboard already handles an empty calendar gracefully.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from './auth-context'
import { getWeekEvents, type GoogleCalendarEvent } from './google-calendar'

/** A single positioned event for the dashboard grid. */
export interface WeekCalendarSlot {
  dayIndex: number     // 0 = Sunday
  hour: number         // local 24h
  minute: number       // local 0–59
  durationMins: number
  title: string
  meta?: string        // location or short subtitle
  color: 'amber' | 'blue' | 'green' | 'rose' | 'purple'
  htmlLink?: string
}

export interface UseWeekCalendar {
  slots: WeekCalendarSlot[]
  hourRange: { min: number; max: number }
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
}

/**
 * Deterministic color picker — same event title always maps to the same
 * color across renders so the grid doesn't flicker.
 */
function colorFor(title: string): WeekCalendarSlot['color'] {
  const palette: WeekCalendarSlot['color'][] = ['amber', 'blue', 'green', 'rose', 'purple']
  let hash = 0
  for (let i = 0; i < title.length; i++) hash = (hash * 31 + title.charCodeAt(i)) | 0
  return palette[Math.abs(hash) % palette.length]
}

/** Convert a Google event to a grid slot. Skips all-day events (no start.dateTime). */
function toSlot(event: GoogleCalendarEvent): WeekCalendarSlot | null {
  const startStr = event.start?.dateTime
  const endStr = event.end?.dateTime
  if (!startStr) return null // all-day or malformed → skip
  const start = new Date(startStr)
  const end = endStr ? new Date(endStr) : new Date(start.getTime() + 60 * 60_000)
  const durationMs = end.getTime() - start.getTime()
  return {
    dayIndex: start.getDay(),
    hour: start.getHours(),
    minute: start.getMinutes(),
    durationMins: Math.max(30, Math.round(durationMs / 60_000)),
    title: event.summary || '(ללא כותרת)',
    meta: event.location ?? undefined,
    color: colorFor(event.summary || ''),
    htmlLink: event.htmlLink,
  }
}

/** Hour range — covers every slot, with a small lead/trail buffer. */
function inferHourRange(slots: WeekCalendarSlot[]): { min: number; max: number } {
  if (slots.length === 0) return { min: 9, max: 15 } // fallback when no events
  let min = 23
  let max = 0
  for (const s of slots) {
    const startH = s.hour
    const endH = Math.min(23, Math.floor((s.hour * 60 + s.minute + s.durationMins) / 60))
    if (startH < min) min = startH
    if (endH > max) max = endH
  }
  // Buffer ±1h so events don't sit flush against the grid edges.
  return { min: Math.max(7, min - 1), max: Math.min(22, Math.max(min + 2, max + 1)) }
}

export function useWeekCalendar(): UseWeekCalendar {
  const { googleToken, refreshGoogleToken } = useAuth()
  const [events, setEvents] = useState<GoogleCalendarEvent[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchEvents = useCallback(async () => {
    if (!googleToken) return
    setLoading(true)
    setError(null)
    try {
      const list = await getWeekEvents(googleToken)
      setEvents(list)
    } catch (e) {
      const msg = (e as Error)?.message ?? String(e)
      if (msg === 'TOKEN_EXPIRED') {
        // Try one refresh + retry — the auth context owns the refresh flow.
        const fresh = await refreshGoogleToken()
        if (fresh) {
          try {
            const list = await getWeekEvents(fresh)
            setEvents(list)
            return
          } catch {}
        }
      }
      setError(msg.slice(0, 160))
    } finally {
      setLoading(false)
    }
  }, [googleToken, refreshGoogleToken])

  useEffect(() => {
    void fetchEvents()
  }, [fetchEvents])

  const slots = useMemo<WeekCalendarSlot[]>(() => {
    return events.map(toSlot).filter((s): s is WeekCalendarSlot => s !== null)
  }, [events])

  const hourRange = useMemo(() => inferHourRange(slots), [slots])

  return { slots, hourRange, loading, error, refresh: fetchEvents }
}
