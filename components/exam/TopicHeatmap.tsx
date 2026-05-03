'use client'

// Topic mastery heatmap.
//
// Renders every topic in the plan as a colored card. Click a card → quick
// actions (practice / flashcards / view mistakes). The "weak topic" recommended
// for the next session bubbles to the top with a highlight ring.

import { useMemo, useState } from 'react'
import Link from 'next/link'
import {
  STATUS_TONE,
  planMastery,
  type MasteryScore,
} from '@/lib/exam/mastery'
import type { Flashcard, PracticeSession, Simulation, StudyPlan } from '@/types'

interface Props {
  plan: StudyPlan
  examId: string
  sessions: PracticeSession[]
  simulations: Simulation[]
  flashcards: Flashcard[]
}

export function TopicHeatmap({ plan, examId, sessions, simulations, flashcards }: Props) {
  const scores = useMemo(
    () => planMastery(plan, sessions, simulations, flashcards),
    [plan, sessions, simulations, flashcards],
  )

  // Recommend the topic with the lowest non-null score; if all are unstarted,
  // recommend the first.
  const recommended = useMemo(() => {
    const withScores = scores.filter((s) => s.score !== null)
    if (withScores.length === 0) return scores[0] ?? null
    return [...withScores].sort((a, b) => (a.score ?? 100) - (b.score ?? 100))[0]
  }, [scores])

  const [selected, setSelected] = useState<string | null>(null)
  const selectedScore = scores.find((s) => s.topic_id === selected) ?? null

  const buildHref = (topicId: string, kind: 'mcq' | 'flashcard' | 'open') => {
    const qs = new URLSearchParams()
    qs.set('topic', topicId)
    qs.set('examId', examId)
    if (kind !== 'mcq') qs.set('kind', kind)
    return `/exam/practice/${plan.id}?${qs.toString()}`
  }

  // Order: weak → progressing → mastered → unstarted (so weak stuff is up top).
  const order: Record<MasteryScore['status'], number> = {
    weak: 0,
    progressing: 1,
    unstarted: 2,
    mastered: 3,
  }
  const sorted = [...scores].sort((a, b) => order[a.status] - order[b.status])

  return (
    <div dir="rtl" className="space-y-5">
      <Legend />

      {recommended && recommended.status !== 'mastered' && (
        <RecommendedBanner
          score={recommended}
          mcqHref={buildHref(recommended.topic_id, 'mcq')}
        />
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {sorted.map((s) => {
          const tone = STATUS_TONE[s.status]
          const isSelected = selected === s.topic_id
          const isRecommended = s.topic_id === recommended?.topic_id
          return (
            <button
              key={s.topic_id}
              onClick={() => setSelected(isSelected ? null : s.topic_id)}
              aria-label={`${s.topic_title} · ${tone.label}`}
              className={`rounded-xl p-3 text-right border transition ${tone.bg} border-white/10 hover:border-white/30 ${
                isSelected ? 'ring-2 ring-fuchsia-300' : ''
              } ${isRecommended ? 'shadow-[0_0_0_1px_rgba(252,211,77,0.5)]' : ''}`}
            >
              <div className={`text-xs uppercase tracking-wide ${tone.text}`}>
                {tone.label}
              </div>
              <div className="font-semibold leading-tight mt-1 text-zinc-50">
                {s.topic_title}
              </div>
              <div className="flex items-baseline justify-between mt-2">
                <div className="text-2xl font-bold tabular-nums text-zinc-50">
                  {s.score === null ? '—' : `${s.score}%`}
                </div>
                <div className="text-[10px] text-zinc-300/70">
                  {s.sample_size} שאלות
                </div>
              </div>
            </button>
          )
        })}
      </div>

      {selectedScore && (
        <SelectedDetails
          score={selectedScore}
          mcqHref={buildHref(selectedScore.topic_id, 'mcq')}
          flashcardHref={buildHref(selectedScore.topic_id, 'flashcard')}
          openHref={buildHref(selectedScore.topic_id, 'open')}
        />
      )}
    </div>
  )
}

function Legend() {
  const items: Array<{ key: keyof typeof STATUS_TONE }> = [
    { key: 'weak' },
    { key: 'progressing' },
    { key: 'mastered' },
    { key: 'unstarted' },
  ]
  return (
    <div className="flex flex-wrap gap-3 text-xs text-zinc-400">
      {items.map(({ key }) => (
        <div key={key} className="flex items-center gap-1.5">
          <span className={`inline-block w-3 h-3 rounded ${STATUS_TONE[key].bg}`} />
          {STATUS_TONE[key].label}
        </div>
      ))}
    </div>
  )
}

function RecommendedBanner({
  score,
  mcqHref,
}: {
  score: MasteryScore
  mcqHref: string
}) {
  return (
    <div className="rounded-2xl border border-amber-400/40 bg-amber-500/10 p-4 flex items-center gap-3 flex-wrap">
      <div className="text-2xl" aria-hidden>
        🎯
      </div>
      <div className="flex-1 min-w-[200px]">
        <div className="text-xs uppercase tracking-wide text-amber-300">
          הנושא החלש ביותר
        </div>
        <div className="font-semibold mt-0.5">{score.topic_title}</div>
        <div className="text-xs text-zinc-400 mt-1">
          {score.score !== null
            ? `שליטה נוכחית: ${score.score}%. תרגול ממוקד יזוז את המחט מהר.`
            : 'עדיין לא תורגל. כדאי להתחיל פה.'}
        </div>
      </div>
      <Link
        href={mcqHref}
        className="px-4 py-2 rounded-lg bg-gradient-to-l from-fuchsia-500 to-blue-500 font-semibold text-sm"
      >
        תרגל עכשיו ←
      </Link>
    </div>
  )
}

function SelectedDetails({
  score,
  mcqHref,
  flashcardHref,
  openHref,
}: {
  score: MasteryScore
  mcqHref: string
  flashcardHref: string
  openHref: string
}) {
  const fmt = (n: number | null) => (n === null ? '—' : `${Math.round(n * 100)}%`)
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-5 space-y-4">
      <h3 className="font-semibold">{score.topic_title}</h3>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-sm">
        <Signal label="אמריקאיות" value={fmt(score.breakdown.mcq)} />
        <Signal label="פתוחות" value={fmt(score.breakdown.open)} />
        <Signal label="כרטיסיות" value={fmt(score.breakdown.flashcards)} />
        <Signal label="סימולציות" value={fmt(score.breakdown.simulation)} />
      </div>

      <div className="flex flex-wrap gap-2">
        <Link
          href={mcqHref}
          className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 text-sm"
        >
          תרגל אמריקאיות
        </Link>
        <Link
          href={openHref}
          className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 text-sm"
        >
          תרגל פתוחות
        </Link>
        <Link
          href={flashcardHref}
          className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 text-sm"
        >
          סבב כרטיסיות
        </Link>
      </div>
    </div>
  )
}

function Signal({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-white/5 p-2">
      <div className="text-[10px] text-zinc-400">{label}</div>
      <div className="font-mono font-semibold mt-0.5">{value}</div>
    </div>
  )
}
