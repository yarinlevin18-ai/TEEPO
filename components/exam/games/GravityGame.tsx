'use client'

// GravityGame — definitions fall from the top of the screen, the player types
// the matching term before it lands. Inspired by Quizlet's "Gravity" mode.

import { useEffect, useMemo, useRef, useState } from 'react'
import type { Flashcard } from '@/types'

interface Props {
  cards: Flashcard[]
  /** Time in seconds for each definition to fall. Lower = harder. */
  fallSeconds?: number
  onComplete?: (result: { cleared: number; lives_left: number; total: number }) => void
}

export function GravityGame({ cards, fallSeconds = 12, onComplete }: Props) {
  const queue = useMemo(() => [...cards].sort(() => Math.random() - 0.5), [cards])
  const [idx, setIdx] = useState(0)
  const [progress, setProgress] = useState(0) // 0..1, 1 = hit ground
  const [input, setInput] = useState('')
  const [lives, setLives] = useState(3)
  const [cleared, setCleared] = useState(0)
  const [done, setDone] = useState(false)
  const [verdict, setVerdict] = useState<'idle' | 'correct' | 'wrong' | 'missed'>('idle')
  const startRef = useRef<number>(Date.now())
  const inputRef = useRef<HTMLInputElement>(null)

  const card = queue[idx]
  const total = queue.length

  // Reset timer when a new card comes up.
  useEffect(() => {
    if (done || !card) return
    startRef.current = Date.now()
    setProgress(0)
    setVerdict('idle')
    setInput('')
    inputRef.current?.focus()
  }, [idx, card, done])

  // Animate the fall.
  useEffect(() => {
    if (done || !card || verdict !== 'idle') return
    const id = setInterval(() => {
      const p = (Date.now() - startRef.current) / (fallSeconds * 1000)
      if (p >= 1) {
        setVerdict('missed')
        setProgress(1)
        clearInterval(id)
      } else {
        setProgress(p)
      }
    }, 50)
    return () => clearInterval(id)
  }, [idx, card, fallSeconds, done, verdict])

  // Handle the "missed" / "wrong" lifecycle.
  useEffect(() => {
    if (verdict === 'missed') {
      const t = setTimeout(() => loseLife(), 700)
      return () => clearTimeout(t)
    }
    if (verdict === 'correct') {
      const t = setTimeout(() => advance(true), 500)
      return () => clearTimeout(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [verdict])

  const loseLife = () => {
    setLives((l) => {
      const next = l - 1
      if (next <= 0) {
        finish(false)
      } else {
        advance(false)
      }
      return next
    })
  }

  const advance = (won: boolean) => {
    if (won) setCleared((c) => c + 1)
    if (idx + 1 >= total) {
      finish(true)
      return
    }
    setIdx(idx + 1)
  }

  const finish = (won: boolean) => {
    setDone(true)
    onComplete?.({ cleared: cleared + (won && verdict === 'correct' ? 1 : 0), lives_left: lives, total })
  }

  const submit = () => {
    if (!card || verdict !== 'idle') return
    const guess = input.trim().toLowerCase()
    const target = card.front.trim().toLowerCase()
    if (guess === target || target.includes(guess) && guess.length >= Math.max(2, target.length - 2)) {
      setVerdict('correct')
    } else {
      setVerdict('wrong')
      setLives((l) => {
        const next = l - 1
        if (next <= 0) {
          finish(false)
        } else {
          // brief shake then advance
          setTimeout(() => advance(false), 600)
        }
        return next
      })
    }
  }

  if (done || !card) {
    return (
      <div dir="rtl" className="rounded-2xl border border-white/10 bg-gradient-to-br from-emerald-500/10 to-blue-500/10 p-8 text-center space-y-2">
        <div className="text-5xl">{cleared === total ? '🚀' : '💥'}</div>
        <h2 className="text-2xl font-bold">סיום משחק</h2>
        <p className="text-zinc-300">
          ניקתה: <span className="text-emerald-300 font-mono">{cleared}</span> / {total} · חיים שנותרו: {lives}
        </p>
      </div>
    )
  }

  return (
    <div dir="rtl" className="space-y-4">
      <div className="flex justify-between items-baseline text-sm">
        <div className="text-zinc-400">
          {idx + 1} / {total}
        </div>
        <div className="flex gap-1">
          {Array.from({ length: 3 }).map((_, i) => (
            <span key={i} aria-hidden className={i < lives ? '' : 'opacity-20'}>
              ❤️
            </span>
          ))}
        </div>
        <div className="text-emerald-300 font-mono">{cleared}</div>
      </div>

      <div className="relative h-72 rounded-2xl border border-white/10 bg-gradient-to-b from-blue-950/40 to-zinc-950/60 overflow-hidden">
        <div
          className={`absolute right-0 left-0 mx-auto max-w-md px-4 py-3 rounded-xl text-center transition-transform duration-100 ${
            verdict === 'correct'
              ? 'bg-emerald-500/30 border border-emerald-400'
              : verdict === 'wrong' || verdict === 'missed'
              ? 'bg-red-500/30 border border-red-400 animate-pulse'
              : 'bg-white/10 border border-white/20'
          }`}
          style={{ top: `${Math.min(95, progress * 92)}%` }}
        >
          <div className="text-[10px] uppercase tracking-widest text-zinc-400 mb-1">הגדרה</div>
          <div className="leading-tight">{card.back}</div>
        </div>
        {/* Ground */}
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-red-500/40" />
      </div>

      <input
        ref={inputRef}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
        placeholder="הקלד את המושג..."
        dir="rtl"
        disabled={verdict !== 'idle'}
        className="w-full bg-white/5 border border-white/10 rounded-lg p-3 outline-none focus:border-fuchsia-400 disabled:opacity-50"
      />

      <button
        onClick={submit}
        disabled={!input.trim() || verdict !== 'idle'}
        className="w-full py-2.5 rounded-lg bg-gradient-to-l from-fuchsia-500 to-blue-500 font-semibold disabled:opacity-40"
      >
        שלח (Enter)
      </button>
    </div>
  )
}
