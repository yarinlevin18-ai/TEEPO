'use client'

import { useState } from 'react'
import type { Flashcard, FlashcardStatus } from '@/types'

// Spec §6.5: simple fixed schedule 1d / 3d / 7d / 14d. SM-2 deferred to phase 2.
const NEXT_INTERVAL_DAYS = [1, 3, 7, 14]

export function nextDueDate(card: Flashcard, knew: boolean): string {
  if (!knew) {
    return new Date(Date.now() + 86400000).toISOString().slice(0, 10)
  }
  const lastIdx = card.last_reviewed
    ? Math.min(NEXT_INTERVAL_DAYS.length - 1, intervalIndex(card))
    : 0
  const days = NEXT_INTERVAL_DAYS[Math.min(lastIdx + 1, NEXT_INTERVAL_DAYS.length - 1)]
  return new Date(Date.now() + days * 86400000).toISOString().slice(0, 10)
}

function intervalIndex(card: Flashcard): number {
  if (!card.last_reviewed || !card.next_due) return 0
  const span =
    (new Date(card.next_due).getTime() - new Date(card.last_reviewed).getTime()) / 86400000
  return NEXT_INTERVAL_DAYS.findIndex((d) => d >= span)
}

function nextStatus(card: Flashcard, knew: boolean): FlashcardStatus {
  if (!knew) return 'learning'
  if (card.status === 'known') return 'due_again'
  return 'known'
}

export interface SessionResult {
  reviewed: Flashcard[]      // updated cards with new status / next_due / last_reviewed
  knownCount: number
  totalCount: number
}

interface Props {
  cards: Flashcard[]
  onSessionComplete?: (result: SessionResult) => void
}

// In-session behavior: cards marked "לא ידעתי" stay in the queue and re-appear
// after the rest of the unseen cards. This satisfies §3.3.3's "כרטיסיות שלא
// ידע חוזרות בסבב הבא" without requiring a separate re-loop.
export function FlashcardDeck({ cards, onSessionComplete }: Props) {
  const [queue, setQueue] = useState<Flashcard[]>(() => [...cards])
  const [reviewed, setReviewed] = useState<Flashcard[]>([])
  const [showBack, setShowBack] = useState(false)
  const [knownCount, setKnownCount] = useState(0)

  if (cards.length === 0) {
    return <p className="text-zinc-400">אין כרטיסיות בסבב הנוכחי.</p>
  }

  if (queue.length === 0) {
    return (
      <div dir="rtl" className="text-center p-8 space-y-3">
        <div className="text-5xl">🎓</div>
        <h2 className="text-2xl font-bold">סיימת את הסבב</h2>
        <p className="text-zinc-300">
          ידעת {knownCount} מתוך {cards.length}.
        </p>
        {onSessionComplete && (
          <button
            onClick={() =>
              onSessionComplete({ reviewed, knownCount, totalCount: cards.length })
            }
            className="px-5 py-2 rounded-lg bg-gradient-to-l from-fuchsia-500 to-blue-500 font-semibold"
          >
            שמור התקדמות
          </button>
        )}
      </div>
    )
  }

  const card = queue[0]
  const seen = reviewed.length

  const judge = (knew: boolean) => {
    const today = new Date().toISOString().slice(0, 10)
    const updated: Flashcard = {
      ...card,
      status: nextStatus(card, knew),
      last_reviewed: today,
      next_due: nextDueDate(card, knew),
    }
    if (knew) setKnownCount((c) => c + 1)
    setReviewed((r) => [...r, updated])
    setShowBack(false)
    if (knew) {
      setQueue((q) => q.slice(1))
    } else {
      // Re-queue at the back so it comes around again in this session.
      setQueue((q) => [...q.slice(1), card])
    }
  }

  return (
    <div dir="rtl" className="max-w-xl mx-auto space-y-4">
      <div className="text-xs text-zinc-400 text-center">
        {seen + 1} · נשארו {queue.length} · ידעת {knownCount}
      </div>

      <button
        onClick={() => setShowBack((s) => !s)}
        aria-label={showBack ? 'הצג חזית' : 'הצג גב'}
        className="block w-full aspect-[3/2] rounded-2xl border border-white/10 bg-gradient-to-br from-fuchsia-500/10 to-blue-500/10 p-8 flex items-center justify-center text-center transition hover:scale-[1.01]"
      >
        <p className="text-xl">{showBack ? card.back : card.front}</p>
      </button>

      <p className="text-center text-xs text-zinc-500">לחץ על הכרטיסייה כדי להפוך</p>

      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={() => judge(false)}
          className="py-3 rounded-lg bg-red-500/20 border border-red-500/50 font-semibold hover:bg-red-500/30 transition"
        >
          לא ידעתי ✗
        </button>
        <button
          onClick={() => judge(true)}
          className="py-3 rounded-lg bg-emerald-500/20 border border-emerald-500/50 font-semibold hover:bg-emerald-500/30 transition"
        >
          ידעתי ✓
        </button>
      </div>
    </div>
  )
}
