'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useSearchParams, useRouter } from 'next/navigation'
import { MatchGame } from '@/components/exam/games/MatchGame'
import { GravityGame } from '@/components/exam/games/GravityGame'
import { HangmanGame } from '@/components/exam/games/HangmanGame'
import { useExamStore } from '@/lib/exam/use-exam-store'
import { sampleFlashcards } from '@/lib/exam/sample-flashcards'
import {
  pointsForGravity,
  pointsForHangman,
  pointsForMatch,
} from '@/lib/exam/points'
import type { Flashcard } from '@/types'

type GameType = 'match' | 'gravity' | 'hangman'

const GAME_INFO: Record<GameType, { label: string; emoji: string; tagline: string }> = {
  match: { label: 'משחק זיכרון', emoji: '🧩', tagline: 'התאם בין מושגים להגדרות' },
  gravity: { label: 'התפצוצות', emoji: '☄️', tagline: 'הקלד את המושג לפני שההגדרה תיפול' },
  hangman: { label: 'איש תלוי', emoji: '🎯', tagline: 'נחש את המושג אות אחר אות' },
}

export default function GamesPage({ params }: { params: { planId: string } }) {
  const router = useRouter()
  const search = useSearchParams()
  const store = useExamStore()

  const examIdParam = search.get('examId')
  const topicParam = search.get('topic')
  const gameParam = search.get('game') as GameType | null

  const plan = useMemo(() => {
    const byId = store.plans.find((p) => p.id === params.planId)
    if (byId) return byId
    if (examIdParam) return store.getPlanByExam(examIdParam)
    return null
  }, [store.plans, store.getPlanByExam, params.planId, examIdParam])

  const [selectedTopic, setSelectedTopic] = useState<string>(topicParam ?? '')
  const [selectedGame, setSelectedGame] = useState<GameType | ''>(gameParam ?? '')

  const cards = useMemo<Flashcard[]>(() => {
    const fromBank = store.flashcards.filter(
      (c) => !selectedTopic || c.topic_id === selectedTopic,
    )
    if (fromBank.length >= 6) return fromBank
    // Not enough — top up with offline samples for the selected topic.
    const topic = plan?.topics.find((t) => t.id === selectedTopic)
    const sample = sampleFlashcards(
      topic?.title ?? 'נושא כללי',
      selectedTopic || 'free',
      plan?.course_id ?? 'unknown',
    )
    return [...fromBank, ...sample]
  }, [store.flashcards, selectedTopic, plan])

  const ready = !!selectedGame && cards.length >= 4

  return (
    <main dir="rtl" className="min-h-screen p-6 lg:p-10 max-w-3xl mx-auto space-y-6">
      <header className="flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-bold">משחקים 🎮</h1>
          <p className="text-zinc-400 text-sm mt-1">לימוד משחקי על בנק הכרטיסיות שלך</p>
        </div>
        <button
          onClick={() => router.back()}
          className="text-sm text-zinc-400 hover:text-zinc-200"
        >
          → חזרה
        </button>
      </header>

      {!ready && (
        <div className="space-y-5">
          {/* Topic picker */}
          <section>
            <h2 className="text-sm font-semibold text-zinc-300 mb-2">נושא</h2>
            {plan && plan.topics.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setSelectedTopic('')}
                  className={`px-3 py-1.5 rounded-lg text-sm transition ${
                    selectedTopic === ''
                      ? 'bg-gradient-to-l from-fuchsia-500 to-blue-500 text-white'
                      : 'bg-white/5 hover:bg-white/10'
                  }`}
                >
                  כל הנושאים
                </button>
                {plan.topics.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setSelectedTopic(t.id)}
                    className={`px-3 py-1.5 rounded-lg text-sm transition ${
                      selectedTopic === t.id
                        ? 'bg-gradient-to-l from-fuchsia-500 to-blue-500 text-white'
                        : 'bg-white/5 hover:bg-white/10'
                    }`}
                  >
                    {t.title}
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-sm text-zinc-500">
                אין תכנית פעילה — המשחק ייפתח עם דוגמת כרטיסיות.{' '}
                <Link href={`/exam/plan/${examIdParam ?? params.planId}`} className="text-fuchsia-300 underline">
                  בנה תכנית
                </Link>
              </p>
            )}
          </section>

          {/* Game picker */}
          <section>
            <h2 className="text-sm font-semibold text-zinc-300 mb-2">בחר משחק</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {(['match', 'gravity', 'hangman'] as GameType[]).map((g) => {
                const info = GAME_INFO[g]
                const active = selectedGame === g
                return (
                  <button
                    key={g}
                    onClick={() => setSelectedGame(g)}
                    className={`p-4 rounded-2xl border transition text-right ${
                      active
                        ? 'border-fuchsia-400 bg-gradient-to-br from-fuchsia-500/15 to-blue-500/15'
                        : 'border-white/10 bg-white/5 hover:bg-white/10'
                    }`}
                  >
                    <div className="text-3xl mb-2" aria-hidden>
                      {info.emoji}
                    </div>
                    <div className="font-semibold">{info.label}</div>
                    <div className="text-xs text-zinc-400 mt-1">{info.tagline}</div>
                  </button>
                )
              })}
            </div>
          </section>

          <div className="flex justify-end">
            <button
              onClick={() => setSelectedGame((g) => g || 'match')}
              disabled={cards.length < 4}
              className="px-5 py-2 rounded-lg bg-gradient-to-l from-fuchsia-500 to-blue-500 font-semibold disabled:opacity-40"
            >
              {cards.length < 4 ? 'אין מספיק כרטיסיות' : 'התחל משחק ←'}
            </button>
          </div>
        </div>
      )}

      {ready && selectedGame === 'match' && (
        <GameShell
          title={GAME_INFO.match.label}
          onExit={() => setSelectedGame('')}
        >
          <MatchGame
            cards={cards}
            pairs={Math.min(8, cards.length)}
            onComplete={(r) =>
              void store.awardPoints({
                source: 'game_match',
                amount: pointsForMatch(r.matched, r.mistakes, r.total),
                examId: examIdParam ?? plan?.exam_id,
                planId: plan?.id,
                meta: { ...r },
              })
            }
          />
        </GameShell>
      )}

      {ready && selectedGame === 'gravity' && (
        <GameShell
          title={GAME_INFO.gravity.label}
          onExit={() => setSelectedGame('')}
        >
          <GravityGame
            cards={cards}
            onComplete={(r) =>
              void store.awardPoints({
                source: 'game_gravity',
                amount: pointsForGravity(r.cleared, r.lives_left, r.total),
                examId: examIdParam ?? plan?.exam_id,
                planId: plan?.id,
                meta: { ...r },
              })
            }
          />
        </GameShell>
      )}

      {ready && selectedGame === 'hangman' && (
        <GameShell
          title={GAME_INFO.hangman.label}
          onExit={() => setSelectedGame('')}
        >
          <HangmanGame
            cards={cards}
            onComplete={(r) =>
              void store.awardPoints({
                source: 'game_hangman',
                amount: pointsForHangman(r.won),
                examId: examIdParam ?? plan?.exam_id,
                planId: plan?.id,
                meta: { ...r },
              })
            }
          />
        </GameShell>
      )}
    </main>
  )
}

function GameShell({
  title,
  onExit,
  children,
}: {
  title: string
  onExit: () => void
  children: React.ReactNode
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-lg font-bold">{title}</h2>
        <button
          onClick={onExit}
          className="text-sm text-zinc-400 hover:text-zinc-200"
        >
          החלף משחק
        </button>
      </div>
      {children}
    </div>
  )
}
