'use client'

// HangmanGame — guess the term letter-by-letter from its definition.

import { useEffect, useMemo, useState } from 'react'
import type { Flashcard } from '@/types'

interface Props {
  cards: Flashcard[]
  /** Wrong guesses allowed per term. */
  maxWrong?: number
  onComplete?: (result: { won: number; lost: number; total: number }) => void
}

const HEBREW = 'אבגדהוזחטיכלמנסעפצקרשת'.split('')
const ENGLISH = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')

function classify(term: string): 'hebrew' | 'english' | 'mixed' {
  const heb = /[א-ת]/.test(term)
  const eng = /[A-Za-z]/.test(term)
  if (heb && eng) return 'mixed'
  return heb ? 'hebrew' : 'english'
}

export function HangmanGame({ cards, maxWrong = 6, onComplete }: Props) {
  const queue = useMemo(() => [...cards].sort(() => Math.random() - 0.5), [cards])
  const [idx, setIdx] = useState(0)
  const [guessed, setGuessed] = useState<Set<string>>(new Set())
  const [wrong, setWrong] = useState(0)
  const [won, setWon] = useState(0)
  const [lost, setLost] = useState(0)
  const [done, setDone] = useState(false)
  const [phase, setPhase] = useState<'play' | 'won' | 'lost'>('play')

  const card = queue[idx]
  const target = card?.front ?? ''
  const targetUpper = target.toUpperCase()

  // Letters that need to be guessed (alphabetic only — spaces, punctuation are pre-revealed).
  const required = useMemo(() => {
    if (!target) return new Set<string>()
    return new Set(targetUpper.split('').filter((ch) => /[א-תA-Z]/.test(ch)))
  }, [targetUpper, target])

  // Win/lose check.
  useEffect(() => {
    if (!card || phase !== 'play') return
    const allGuessed = Array.from(required).every((ch) => guessed.has(ch))
    if (allGuessed) {
      setPhase('won')
      setWon((w) => w + 1)
    } else if (wrong >= maxWrong) {
      setPhase('lost')
      setLost((l) => l + 1)
    }
  }, [guessed, wrong, required, card, phase, maxWrong])

  const guess = (letter: string) => {
    if (phase !== 'play' || guessed.has(letter)) return
    setGuessed((g) => new Set(g).add(letter))
    if (!required.has(letter)) {
      setWrong((w) => w + 1)
    }
  }

  const next = () => {
    if (idx + 1 >= queue.length) {
      setDone(true)
      onComplete?.({ won, lost, total: queue.length })
      return
    }
    setIdx(idx + 1)
    setGuessed(new Set())
    setWrong(0)
    setPhase('play')
  }

  if (done || !card) {
    return (
      <div dir="rtl" className="rounded-2xl border border-white/10 bg-gradient-to-br from-emerald-500/10 to-blue-500/10 p-8 text-center space-y-2">
        <div className="text-5xl">🎓</div>
        <h2 className="text-2xl font-bold">סיום משחק</h2>
        <p className="text-zinc-300">
          ניצחת ב-{won} מתוך {queue.length} · הפסדת {lost}
        </p>
      </div>
    )
  }

  const lang = classify(target)
  const alphabet = lang === 'english' ? ENGLISH : HEBREW

  const display = target.split('').map((ch) => {
    const upper = ch.toUpperCase()
    if (!/[א-תA-Z]/.test(upper)) return ch
    return guessed.has(upper) ? upper : '_'
  })

  return (
    <div dir="rtl" className="space-y-4">
      <div className="flex justify-between text-sm text-zinc-400">
        <div>{idx + 1} / {queue.length}</div>
        <div>טעויות: {wrong} / {maxWrong}</div>
        <div>
          <span className="text-emerald-300">✓ {won}</span> · <span className="text-red-300">✗ {lost}</span>
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
        <div className="text-xs text-zinc-400 mb-2">הגדרה:</div>
        <p className="text-base leading-relaxed">{card.back}</p>
      </div>

      <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-fuchsia-500/10 to-blue-500/10 p-6 text-center">
        <div className="text-3xl font-mono tracking-wider">
          {display.map((ch, i) => (
            <span key={i} className="inline-block min-w-[1.2ch] mx-0.5">
              {ch === '_' ? <span className="text-zinc-500">_</span> : ch}
            </span>
          ))}
        </div>
      </div>

      {phase === 'play' ? (
        <div className="flex flex-wrap gap-1.5 justify-center">
          {alphabet.map((letter) => {
            const used = guessed.has(letter)
            const correct = used && required.has(letter)
            return (
              <button
                key={letter}
                onClick={() => guess(letter)}
                disabled={used}
                className={`w-9 h-9 rounded-md font-semibold transition ${
                  used
                    ? correct
                      ? 'bg-emerald-500/30 text-emerald-200'
                      : 'bg-red-500/30 text-red-200'
                    : 'bg-white/5 hover:bg-white/10 text-zinc-200'
                } disabled:cursor-default`}
              >
                {letter}
              </button>
            )
          })}
        </div>
      ) : (
        <div className="space-y-3">
          <div
            className={`rounded-lg p-3 text-center font-semibold ${
              phase === 'won'
                ? 'bg-emerald-500/20 border border-emerald-500/50'
                : 'bg-red-500/20 border border-red-500/50'
            }`}
          >
            {phase === 'won' ? '✓ ניצחת!' : `✗ המילה הייתה: ${target}`}
          </div>
          <button
            onClick={next}
            className="w-full py-2.5 rounded-lg bg-gradient-to-l from-fuchsia-500 to-blue-500 font-semibold"
          >
            הבא ←
          </button>
        </div>
      )}
    </div>
  )
}
