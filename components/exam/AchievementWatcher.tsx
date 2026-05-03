'use client'

/**
 * AchievementWatcher — render-once-per-page component that diffs the
 * currently-unlocked achievement set against the persisted set and
 * fires a celebration toast for each newly-unlocked one.
 *
 * Computes the context lazily each render. The first render after a
 * qualifying activity (e.g. submitting a perfect MCQ) detects the
 * unlock, persists it, and queues a toast.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { useExamStore } from '@/lib/exam/use-exam-store'
import {
  newlyUnlocked,
  type Achievement,
  type AchievementCtx,
} from '@/lib/exam/achievements'
import { totalPoints } from '@/lib/exam/points'

interface Toast {
  id: string
  achievement: Achievement
}

export default function AchievementWatcher() {
  const store = useExamStore()
  const [toasts, setToasts] = useState<Toast[]>([])
  // Track which IDs we've already enqueued in this session so we don't
  // re-toast on storage round-trip race conditions.
  const queuedRef = useRef<Set<string>>(new Set())

  const ctx: AchievementCtx = useMemo(
    () => ({
      pointEvents: store.pointEvents,
      practiceSessions: store.practiceSessions,
      simulations: store.simulations,
      flashcards: store.flashcards,
      plans: store.plans,
      totalPoints: totalPoints(store.pointEvents),
    }),
    [
      store.pointEvents,
      store.practiceSessions,
      store.simulations,
      store.flashcards,
      store.plans,
    ],
  )

  useEffect(() => {
    const fresh = newlyUnlocked(ctx, store.unlockedAchievements)
    const trulyNew = fresh.filter((a) => !queuedRef.current.has(a.id))
    if (trulyNew.length === 0) return

    for (const a of trulyNew) queuedRef.current.add(a.id)
    void store.markAchievementsUnlocked(trulyNew.map((a) => a.id))

    setToasts((prev) => [
      ...prev,
      ...trulyNew.map((a) => ({ id: `${a.id}_${Date.now()}`, achievement: a })),
    ])

    // Auto-dismiss each new toast after 5 seconds.
    trulyNew.forEach((a, i) => {
      setTimeout(
        () =>
          setToasts((prev) => prev.filter((t) => !t.id.startsWith(`${a.id}_`))),
        5000 + i * 400,
      )
    })
  }, [ctx, store.unlockedAchievements, store])

  if (toasts.length === 0) return null

  return (
    <div
      dir="rtl"
      className="fixed top-6 left-1/2 -translate-x-1/2 z-[80] flex flex-col gap-2 pointer-events-none"
      aria-live="polite"
    >
      {toasts.map((t, i) => (
        <ToastCard key={t.id} achievement={t.achievement} index={i} />
      ))}
    </div>
  )
}

function ToastCard({ achievement, index }: { achievement: Achievement; index: number }) {
  return (
    <div
      role="status"
      className="achievement-toast pointer-events-auto rounded-2xl border border-amber-500/40 bg-gradient-to-l from-amber-500/15 to-orange-500/15 backdrop-blur-md px-4 py-3 shadow-[0_8px_32px_rgba(249,115,22,0.25)] flex items-center gap-3 min-w-[280px] max-w-[340px]"
      style={{ animationDelay: `${index * 80}ms` }}
    >
      <div className="text-3xl shrink-0">{achievement.emoji}</div>
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-widest text-amber-300 font-bold">
          הישג חדש!
        </div>
        <div className="font-bold text-zinc-100 leading-tight">{achievement.label}</div>
        <div className="text-xs text-zinc-300 mt-0.5 leading-snug">
          {achievement.description}
        </div>
      </div>

      <style jsx>{`
        :global(.achievement-toast) {
          animation: toast-in 480ms cubic-bezier(0.22, 1, 0.36, 1) backwards;
        }
        @keyframes toast-in {
          0%   { opacity: 0; transform: translateY(-12px) scale(0.96); }
          60%  { opacity: 1; transform: translateY(2px)   scale(1.02); }
          100% { opacity: 1; transform: translateY(0)     scale(1); }
        }
        @media (prefers-reduced-motion: reduce) {
          :global(.achievement-toast) { animation: none; }
        }
      `}</style>
    </div>
  )
}
