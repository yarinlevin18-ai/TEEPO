// Temporary flashcard persistence in localStorage.
// Replaced by Drive-side storage once the Drive client is wired.

import type { Flashcard } from '@/types'

const KEY = (planId: string) => `teepo_exam_flashcards_${planId}`

export function loadFlashcards(planId: string): Flashcard[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(KEY(planId))
    return raw ? (JSON.parse(raw) as Flashcard[]) : []
  } catch {
    return []
  }
}

export function saveFlashcards(planId: string, cards: Flashcard[]): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(KEY(planId), JSON.stringify(cards))
}

export function upsertFlashcards(planId: string, cards: Flashcard[]): void {
  const existing = loadFlashcards(planId)
  const byId = new Map(existing.map((c) => [c.id, c]))
  for (const c of cards) byId.set(c.id, c)
  saveFlashcards(planId, Array.from(byId.values()))
}

export function dueFlashcards(planId: string, topicId?: string): Flashcard[] {
  const today = new Date().toISOString().slice(0, 10)
  return loadFlashcards(planId).filter((c) => {
    if (topicId && c.topic_id !== topicId) return false
    if (c.status === 'new' || c.status === 'learning') return true
    if (!c.next_due) return true
    return c.next_due <= today
  })
}
