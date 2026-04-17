'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import type { Assignment, StudyTask } from '@/types'
import type { GoogleCalendarEvent } from '@/lib/google-calendar'

// ── Notification types ──────────────────────────────────────

export type NotifType = 'deadline' | 'event' | 'task' | 'overdue' | 'info'

export interface AppNotification {
  id: string
  type: NotifType
  title: string
  body: string
  time: Date
  read: boolean
  href?: string            // link to open on click
  urgency: 'low' | 'medium' | 'high' | 'critical'
}

const NOTIFS_READ_KEY = 'smartdesk_notifs_read'

// ── Helper ──────────────────────────────────────────────────

function hoursUntil(dateStr: string): number {
  return (new Date(dateStr).getTime() - Date.now()) / (1000 * 60 * 60)
}

function minsUntil(dateStr: string): number {
  return (new Date(dateStr).getTime() - Date.now()) / (1000 * 60)
}

// ── Build notifications from app data ───────────────────────

export function buildNotifications(
  assignments: Assignment[],
  tasks: StudyTask[],
  events: GoogleCalendarEvent[],
): AppNotification[] {
  const notifs: AppNotification[] = []
  const now = new Date()

  // 1. Assignment deadlines
  for (const a of assignments) {
    if (!a.deadline || a.status === 'submitted' || a.status === 'graded') continue
    const h = hoursUntil(a.deadline)

    if (h < 0 && h > -48) {
      // Overdue (up to 2 days ago)
      notifs.push({
        id: `overdue-${a.id}`,
        type: 'overdue',
        title: `מטלה באיחור: ${a.title}`,
        body: 'המטלה עברה את המועד האחרון להגשה',
        time: new Date(a.deadline),
        read: false,
        href: '/assignments',
        urgency: 'critical',
      })
    } else if (h >= 0 && h < 3) {
      notifs.push({
        id: `deadline-3h-${a.id}`,
        type: 'deadline',
        title: `${a.title} — בעוד ${Math.max(1, Math.round(h * 60))} דקות`,
        body: 'הגשה מתקרבת מאוד!',
        time: new Date(a.deadline),
        read: false,
        href: '/assignments',
        urgency: 'critical',
      })
    } else if (h >= 3 && h < 24) {
      notifs.push({
        id: `deadline-24h-${a.id}`,
        type: 'deadline',
        title: `${a.title} — בעוד ${Math.round(h)} שעות`,
        body: 'מטלה להגשה היום',
        time: new Date(a.deadline),
        read: false,
        href: '/assignments',
        urgency: 'high',
      })
    } else if (h >= 24 && h < 72) {
      const days = Math.round(h / 24)
      notifs.push({
        id: `deadline-3d-${a.id}`,
        type: 'deadline',
        title: `${a.title} — בעוד ${days} ימים`,
        body: `הגשה עד ${new Date(a.deadline).toLocaleDateString('he-IL')}`,
        time: new Date(a.deadline),
        read: false,
        href: '/assignments',
        urgency: 'medium',
      })
    }
  }

  // 2. Calendar events happening soon (within 60 min)
  for (const e of events) {
    const start = e.start.dateTime || e.start.date
    if (!start) continue
    const m = minsUntil(start)

    if (m > 0 && m <= 60) {
      notifs.push({
        id: `event-soon-${e.id}`,
        type: 'event',
        title: `${e.summary} — בעוד ${Math.round(m)} דקות`,
        body: e.location ? `מיקום: ${e.location}` : 'אירוע קרוב',
        time: new Date(start),
        read: false,
        urgency: m <= 15 ? 'high' : 'medium',
      })
    }
  }

  // 3. Incomplete tasks for today
  const todayStr = now.toISOString().slice(0, 10)
  const todayPending = tasks.filter(
    t => !t.is_completed && t.scheduled_date === todayStr,
  )
  if (todayPending.length > 0) {
    notifs.push({
      id: `tasks-today-${todayStr}`,
      type: 'task',
      title: `${todayPending.length} משימות להיום`,
      body: todayPending.slice(0, 3).map(t => t.title).join(', '),
      time: now,
      read: false,
      href: '/tasks',
      urgency: 'low',
    })
  }

  // 4. Overdue tasks (past date, not completed)
  const overdueTasks = tasks.filter(
    t => !t.is_completed && t.scheduled_date && t.scheduled_date < todayStr,
  )
  if (overdueTasks.length > 0) {
    notifs.push({
      id: `tasks-overdue-${todayStr}`,
      type: 'overdue',
      title: `${overdueTasks.length} משימות שלא הושלמו`,
      body: overdueTasks.slice(0, 3).map(t => t.title).join(', '),
      time: now,
      read: false,
      href: '/tasks',
      urgency: 'high',
    })
  }

  // Sort by urgency then by time
  const urgencyOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 }
  notifs.sort((a, b) => urgencyOrder[a.urgency] - urgencyOrder[b.urgency] || a.time.getTime() - b.time.getTime())

  return notifs
}

// ── Hook ────────────────────────────────────────────────────

export function useNotifications(
  assignments: Assignment[],
  tasks: StudyTask[],
  events: GoogleCalendarEvent[],
) {
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [readIds, setReadIds] = useState<Set<string>>(new Set())
  const sentBrowserRef = useRef<Set<string>>(new Set())

  // Load read IDs from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(NOTIFS_READ_KEY)
      if (stored) setReadIds(new Set(JSON.parse(stored)))
    } catch {}
  }, [])

  // Persist read IDs
  const persistReadIds = useCallback((ids: Set<string>) => {
    try { localStorage.setItem(NOTIFS_READ_KEY, JSON.stringify(Array.from(ids))) } catch {}
  }, [])

  // Rebuild notifications when data changes
  useEffect(() => {
    const raw = buildNotifications(assignments, tasks, events)
    const withRead = raw.map(n => ({ ...n, read: readIds.has(n.id) }))
    setNotifications(withRead)

    // Fire browser notifications for critical/high unread items
    if (typeof window !== 'undefined' && Notification.permission === 'granted') {
      for (const n of withRead) {
        if (!n.read && (n.urgency === 'critical' || n.urgency === 'high') && !sentBrowserRef.current.has(n.id)) {
          sentBrowserRef.current.add(n.id)
          new Notification(n.title, {
            body: n.body,
            icon: '/logo-128.png',
            tag: n.id,
          })
        }
      }
    }
  }, [assignments, tasks, events, readIds])

  // Re-compute every 60s (for time-based changes like "in 15 min")
  useEffect(() => {
    const interval = setInterval(() => {
      const raw = buildNotifications(assignments, tasks, events)
      const withRead = raw.map(n => ({ ...n, read: readIds.has(n.id) }))
      setNotifications(withRead)
    }, 60_000)
    return () => clearInterval(interval)
  }, [assignments, tasks, events, readIds])

  const markRead = useCallback((id: string) => {
    setReadIds(prev => {
      const next = new Set(prev)
      next.add(id)
      persistReadIds(next)
      return next
    })
  }, [persistReadIds])

  const markAllRead = useCallback(() => {
    setReadIds(prev => {
      const next = new Set(prev)
      notifications.forEach(n => next.add(n.id))
      persistReadIds(next)
      return next
    })
  }, [notifications, persistReadIds])

  const requestPermission = useCallback(async () => {
    if (typeof window === 'undefined') return false
    if (!('Notification' in window)) return false
    if (Notification.permission === 'granted') return true
    const result = await Notification.requestPermission()
    return result === 'granted'
  }, [])

  const unreadCount = notifications.filter(n => !n.read).length

  return {
    notifications,
    unreadCount,
    markRead,
    markAllRead,
    requestPermission,
    hasPermission: typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted',
  }
}
