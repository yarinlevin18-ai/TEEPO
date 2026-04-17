/**
 * Academic calendar helpers — derive the *current* semester status from the
 * raw dates in `data/university-info.json`.
 *
 * Returns a small, UI-friendly summary: which semester we're in, how far
 * through it, and the next upcoming calendar event (holiday or end-of-semester).
 */
import info from '@/data/university-info.json'

export type SemesterKey = 'autumn' | 'spring' | 'break' | 'summer'

export interface SemesterStatus {
  /** Which semester bucket is "now". */
  key: SemesterKey
  /** Hebrew label, e.g. 'סמסטר א׳'. */
  label: string
  /** ISO date strings of the current period. May be null in break/summer. */
  startDate: string | null
  endDate: string | null
  /** 0..1, or null if we're between semesters. */
  progress: number | null
  /** Week number within the semester (1..N), or null. */
  weekNumber: number | null
  /** Total weeks in the current semester, or null. */
  totalWeeks: number | null
  /** Days remaining until the end of the current semester, or null. */
  daysRemaining: number | null
  /** Days until the next semester starts, or null if we're already in one. */
  daysUntilNext: number | null
  /** Label of the next semester (when between semesters). */
  nextLabel: string | null
  /** Optional next holiday / break event. */
  nextEvent: { name: string; date: string; daysUntil: number } | null
}

const cal = info.shnaton_general_2026.academic_calendar_2025_2026

// ── Helpers ──────────────────────────────────────────────────
function toDate(iso: string): Date {
  const d = new Date(iso)
  d.setHours(0, 0, 0, 0)
  return d
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24))
}

// ── Next holiday/break ─────────────────────────────────────────
function getNextEvent(now: Date) {
  type Event = { name: string; date: Date }
  const events: Event[] = []

  for (const h of cal.holidays as Array<{
    name: string
    date?: string
    start?: string
    end?: string
  }>) {
    if (h.date) events.push({ name: h.name, date: toDate(h.date) })
    if (h.start) events.push({ name: `${h.name} (תחילת חופשה)`, date: toDate(h.start) })
  }

  // Also treat end-of-semester as an event
  events.push({ name: 'סוף סמסטר א׳', date: toDate(cal.autumn_semester_end) })
  events.push({ name: 'סוף סמסטר ב׳', date: toDate(cal.spring_semester_end) })

  const upcoming = events
    .filter(e => e.date.getTime() >= now.getTime())
    .sort((a, b) => a.date.getTime() - b.date.getTime())[0]

  if (!upcoming) return null
  return {
    name: upcoming.name,
    date: upcoming.date.toISOString().slice(0, 10),
    daysUntil: daysBetween(now, upcoming.date),
  }
}

// ── Main ─────────────────────────────────────────────────────
export function getSemesterStatus(today: Date = new Date()): SemesterStatus {
  const now = new Date(today)
  now.setHours(0, 0, 0, 0)

  const autumnStart = toDate(cal.autumn_semester_start)
  const autumnEnd   = toDate(cal.autumn_semester_end)
  const springStart = toDate(cal.spring_semester_start)
  const springEnd   = toDate(cal.spring_semester_end)

  const inRange = (a: Date, b: Date) => now.getTime() >= a.getTime() && now.getTime() <= b.getTime()

  const nextEvent = getNextEvent(now)

  // ── Autumn / Spring active ──
  const activeSem = inRange(autumnStart, autumnEnd)
    ? { key: 'autumn' as const, label: 'סמסטר א׳', start: autumnStart, end: autumnEnd }
    : inRange(springStart, springEnd)
      ? { key: 'spring' as const, label: 'סמסטר ב׳', start: springStart, end: springEnd }
      : null

  if (activeSem) {
    const total = daysBetween(activeSem.start, activeSem.end)
    const elapsed = daysBetween(activeSem.start, now)
    const progress = total > 0 ? Math.min(1, Math.max(0, elapsed / total)) : 0
    const totalWeeks = Math.ceil(total / 7)
    const weekNumber = Math.max(1, Math.min(totalWeeks, Math.floor(elapsed / 7) + 1))
    const daysRemaining = Math.max(0, daysBetween(now, activeSem.end))

    return {
      key: activeSem.key,
      label: activeSem.label,
      startDate: activeSem.start.toISOString().slice(0, 10),
      endDate: activeSem.end.toISOString().slice(0, 10),
      progress,
      weekNumber,
      totalWeeks,
      daysRemaining,
      daysUntilNext: null,
      nextLabel: null,
      nextEvent,
    }
  }

  // ── Between semesters ──
  if (now < autumnStart) {
    return {
      key: 'break',
      label: 'לפני תחילת השנה',
      startDate: null,
      endDate: null,
      progress: null,
      weekNumber: null,
      totalWeeks: null,
      daysRemaining: null,
      daysUntilNext: daysBetween(now, autumnStart),
      nextLabel: 'סמסטר א׳',
      nextEvent,
    }
  }

  if (now > autumnEnd && now < springStart) {
    return {
      key: 'break',
      label: 'חופשה בין סמסטרים',
      startDate: cal.autumn_semester_end,
      endDate: cal.spring_semester_start,
      progress: null,
      weekNumber: null,
      totalWeeks: null,
      daysRemaining: null,
      daysUntilNext: daysBetween(now, springStart),
      nextLabel: 'סמסטר ב׳',
      nextEvent,
    }
  }

  // After spring ended — summer / between-years
  return {
    key: 'summer',
    label: 'חופשת קיץ',
    startDate: cal.spring_semester_end,
    endDate: null,
    progress: null,
    weekNumber: null,
    totalWeeks: null,
    daysRemaining: null,
    daysUntilNext: null,
    nextLabel: null,
    nextEvent,
  }
}
