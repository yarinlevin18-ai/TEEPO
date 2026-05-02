// Temporary practice-session persistence in localStorage.
// Replaced by Drive-side practice_bank.json once the Drive client is wired.

import type { PracticeSession } from '@/types'

const KEY = (planId: string) => `teepo_exam_practice_${planId}`

export function loadPracticeSessions(planId: string): PracticeSession[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(KEY(planId))
    return raw ? (JSON.parse(raw) as PracticeSession[]) : []
  } catch {
    return []
  }
}

export function savePracticeSession(planId: string, session: PracticeSession): void {
  if (typeof window === 'undefined') return
  const existing = loadPracticeSessions(planId)
  const next = [...existing.filter((s) => s.id !== session.id), session]
  window.localStorage.setItem(KEY(planId), JSON.stringify(next))
}

export function findPracticeSession(planId: string, sessionId: string): PracticeSession | null {
  return loadPracticeSessions(planId).find((s) => s.id === sessionId) ?? null
}
