'use client'

// MatchGame — memory-pairs over flashcards.
// Show N pairs (front + back) shuffled in a grid. Player clicks two cards to
// reveal them; matching pair stays open, non-matching flips back.

import { useEffect, useMemo, useState } from 'react'
import type { Flashcard } from '@/types'

interface Tile {
  id: string
  cardId: string
  side: 'front' | 'back'
  text: string
}

interface Props {
  cards: Flashcard[]
  /** How many pairs to play. Defaults to min(8, cards.length). */
  pairs?: number
  onComplete?: (result: { matched: number; total: number; seconds: number; mistakes: number }) => void
}

export function MatchGame({ cards, pairs, onComplete }: Props) {
  const total = Math.min(pairs ?? 8, cards.length)

  const tiles = useMemo<Tile[]>(() => {
    const sample = [...cards].sort(() => Math.random() - 0.5).slice(0, total)
    const ts: Tile[] = []
    for (const c of sample) {
      ts.push({ id: `${c.id}_f`, cardId: c.id, side: 'front', text: c.front })
      ts.push({ id: `${c.id}_b`, cardId: c.id, side: 'back', text: c.back })
    }
    return ts.sort(() => Math.random() - 0.5)
  }, [cards, total])

  const [matched, setMatched] = useState<Set<string>>(new Set())
  const [flipped, setFlipped] = useState<string[]>([]) // tile ids currently revealed but not yet matched
  const [mistakes, setMistakes] = useState(0)
  const [startedAt] = useState(() => Date.now())
  const [done, setDone] = useState(false)

  const matchedCount = matched.size

  // Settle a flipped pair after a short delay so the user can see the second card.
  useEffect(() => {
    if (flipped.length < 2) return
    const [a, b] = flipped
    const tA = tiles.find((t) => t.id === a)
    const tB = tiles.find((t) => t.id === b)
    if (!tA || !tB) return
    const isMatch = tA.cardId === tB.cardId && tA.side !== tB.side
    const t = setTimeout(() => {
      if (isMatch) {
        setMatched((m) => new Set(m).add(tA.cardId))
      } else {
        setMistakes((n) => n + 1)
      }
      setFlipped([])
    }, isMatch ? 400 : 800)
    return () => clearTimeout(t)
  }, [flipped, tiles])

  // Win check.
  useEffect(() => {
    if (matchedCount === total && !done) {
      setDone(true)
      onComplete?.({
        matched: matchedCount,
        total,
        seconds: Math.round((Date.now() - startedAt) / 1000),
        mistakes,
      })
    }
  }, [matchedCount, total, done, mistakes, onComplete, startedAt])

  const click = (tile: Tile) => {
    if (flipped.length >= 2) return
    if (matched.has(tile.cardId)) return
    if (flipped.includes(tile.id)) return
    setFlipped((f) => [...f, tile.id])
  }

  const isOpen = (tile: Tile) => matched.has(tile.cardId) || flipped.includes(tile.id)

  return (
    <div dir="rtl" className="space-y-4">
      <div className="flex justify-between items-baseline text-sm text-zinc-400">
        <div>
          זוגות: <span className="text-emerald-300 font-mono">{matchedCount}</span> / {total}
        </div>
        <div>טעויות: <span className="text-red-300 font-mono">{mistakes}</span></div>
      </div>

      {done ? (
        <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-emerald-500/10 to-cyan-500/10 p-8 text-center space-y-2">
          <div className="text-5xl">🏆</div>
          <h2 className="text-2xl font-bold">כל הכבוד!</h2>
          <p className="text-zinc-300">
            {total} זוגות · {mistakes} טעויות · {Math.round((Date.now() - startedAt) / 1000)} שניות
          </p>
        </div>
      ) : (
        <div className={`grid gap-2 ${tiles.length <= 12 ? 'grid-cols-4' : 'grid-cols-4 sm:grid-cols-5'}`}>
          {tiles.map((tile) => {
            const open = isOpen(tile)
            const isMatched = matched.has(tile.cardId)
            return (
              <button
                key={tile.id}
                onClick={() => click(tile)}
                disabled={open && !isMatched}
                aria-label={open ? tile.text : 'כרטיסייה הפוכה'}
                className={`aspect-[3/4] rounded-xl p-2 text-sm transition border ${
                  isMatched
                    ? 'bg-emerald-500/20 border-emerald-500/50 opacity-70'
                    : open
                    ? 'bg-fuchsia-500/20 border-fuchsia-500/50'
                    : 'bg-white/5 border-white/10 hover:bg-white/10'
                }`}
              >
                {open ? (
                  <span className="leading-tight block">{tile.text}</span>
                ) : (
                  <span className="text-2xl text-zinc-600" aria-hidden>
                    ?
                  </span>
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
