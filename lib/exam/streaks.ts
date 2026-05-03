// Daily streak computation.
//
// A "study day" is a calendar date on which the student earned at least one
// PointEvent. The current streak is the count of consecutive study days
// ending at today (or yesterday, if today hasn't started yet).
//
// We deliberately use the event log (not plan day status) because streaks
// should reflect *actual activity*, not just whether a plan exists. Doing
// a flashcard round on a no-plan day still counts.

import type { PointEvent } from '@/lib/exam/points'

export interface StreakInfo {
  current: number       // current consecutive days ending today/yesterday
  longest: number       // longest run we've ever had
  active_today: boolean // did today get a study event yet?
  last_active_date: string | null
}

function isoDate(s: string): string {
  return s.slice(0, 10)
}

function dateMinusDays(date: string, days: number): string {
  const d = new Date(date + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() - days)
  return d.toISOString().slice(0, 10)
}

export function computeStreak(events: PointEvent[]): StreakInfo {
  if (events.length === 0) {
    return { current: 0, longest: 0, active_today: false, last_active_date: null }
  }

  const days = new Set<string>()
  for (const e of events) days.add(isoDate(e.created_at))

  const sorted = Array.from(days).sort()
  const today = new Date().toISOString().slice(0, 10)
  const yesterday = dateMinusDays(today, 1)
  const lastActive = sorted[sorted.length - 1]

  // ---- current streak ----
  let current = 0
  if (days.has(today)) {
    current = 1
    let cursor = dateMinusDays(today, 1)
    while (days.has(cursor)) {
      current += 1
      cursor = dateMinusDays(cursor, 1)
    }
  } else if (days.has(yesterday)) {
    // Today hasn't started yet — streak from yesterday counts as active.
    current = 1
    let cursor = dateMinusDays(yesterday, 1)
    while (days.has(cursor)) {
      current += 1
      cursor = dateMinusDays(cursor, 1)
    }
  }

  // ---- longest streak ever ----
  let longest = 0
  let run = 0
  let prev: string | null = null
  for (const d of sorted) {
    if (prev && dateMinusDays(d, 1) === prev) {
      run += 1
    } else {
      run = 1
    }
    if (run > longest) longest = run
    prev = d
  }

  return {
    current,
    longest,
    active_today: days.has(today),
    last_active_date: lastActive,
  }
}
