'use client'

// Open-ended question runner — spec §3.3.2.
// One question at a time, free-text answer, AI-or-heuristic evaluation per question.

import { useState } from 'react'
import type { OpenQuestion } from '@/lib/exam/sample-questions'

export type Verdict = 'full' | 'partial' | 'insufficient' | 'uncertain'

export interface Evaluation {
  verdict: Verdict
  reasoning: string
  missing_points: string[]
  confidence: number
}

const VERDICT_COPY: Record<Verdict, { label: string; tone: string; emoji: string }> = {
  full: { label: 'תשובה מלאה', tone: 'bg-emerald-500/15 border-emerald-500/40 text-emerald-200', emoji: '✓' },
  partial: { label: 'תשובה חלקית', tone: 'bg-amber-500/15 border-amber-500/40 text-amber-200', emoji: '◐' },
  insufficient: { label: 'תשובה לא מספקת', tone: 'bg-red-500/15 border-red-500/40 text-red-200', emoji: '✗' },
  uncertain: { label: 'לא בטוח — בדוק עם המרצה', tone: 'bg-zinc-500/15 border-zinc-500/40 text-zinc-200', emoji: '?' },
}

interface Props {
  questions: OpenQuestion[]
  evaluate: (q: OpenQuestion, answer: string) => Promise<Evaluation>
  onComplete?: (results: Array<{ question: OpenQuestion; answer: string; evaluation: Evaluation }>) => void
}

export function OpenQuestionRunner({ questions, evaluate, onComplete }: Props) {
  const [idx, setIdx] = useState(0)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [evaluations, setEvaluations] = useState<Record<string, Evaluation>>({})
  const [submitting, setSubmitting] = useState(false)
  const [showRef, setShowRef] = useState<Record<string, boolean>>({})
  const [done, setDone] = useState(false)

  if (questions.length === 0) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/5 p-8 text-center text-zinc-400">
        אין שאלות כרגע.
      </div>
    )
  }

  if (done) {
    return (
      <SummaryView
        questions={questions}
        answers={answers}
        evaluations={evaluations}
      />
    )
  }

  const q = questions[idx]
  const evaluation = evaluations[q.id]
  const answer = answers[q.id] ?? ''
  const isLast = idx === questions.length - 1
  const allEvaluated = questions.every((qq) => evaluations[qq.id])

  const submit = async () => {
    setSubmitting(true)
    try {
      const ev = await evaluate(q, answer)
      setEvaluations({ ...evaluations, [q.id]: ev })
    } finally {
      setSubmitting(false)
    }
  }

  const finish = () => {
    onComplete?.(
      questions.map((qq) => ({
        question: qq,
        answer: answers[qq.id] ?? '',
        evaluation: evaluations[qq.id]!,
      })),
    )
    setDone(true)
  }

  const next = () => setIdx(Math.min(questions.length - 1, idx + 1))
  const prev = () => setIdx(Math.max(0, idx - 1))

  return (
    <div dir="rtl" className="space-y-4">
      <div className="text-xs text-zinc-400">
        שאלה {idx + 1} מתוך {questions.length}
      </div>
      <div className="h-1 rounded-full bg-white/10 overflow-hidden">
        <div
          className="h-full bg-fuchsia-400 transition-all"
          style={{ width: `${((idx + 1) / questions.length) * 100}%` }}
        />
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/5 p-6 space-y-4">
        <p className="text-lg leading-relaxed">{q.content}</p>

        <textarea
          value={answer}
          onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
          rows={8}
          placeholder="כתוב כאן את התשובה שלך…"
          dir="rtl"
          disabled={!!evaluation}
          className="w-full bg-white/5 border border-white/10 rounded-lg p-3 outline-none focus:border-fuchsia-400 resize-y disabled:opacity-70"
        />

        <div className="flex items-center justify-between gap-2">
          <div className="text-xs text-zinc-500">{answer.length} תווים</div>
          {!evaluation && (
            <button
              onClick={submit}
              disabled={submitting || answer.trim().length === 0}
              className="px-5 py-2 rounded-lg bg-gradient-to-l from-fuchsia-500 to-blue-500 font-semibold disabled:opacity-40"
            >
              {submitting ? '⏳ מעריך…' : 'הגש תשובה'}
            </button>
          )}
        </div>

        {evaluation && <EvaluationPanel ev={evaluation} />}

        {evaluation && (
          <div>
            <button
              onClick={() => setShowRef({ ...showRef, [q.id]: !showRef[q.id] })}
              className="text-sm text-fuchsia-300 hover:text-fuchsia-200"
            >
              {showRef[q.id] ? '▲ הסתר תשובה לדוגמה' : '▼ הצג תשובה לדוגמה'}
            </button>
            {showRef[q.id] && (
              <div className="mt-2 p-3 rounded-lg bg-cyan-500/5 border-r-2 border-cyan-400/60 text-sm text-zinc-300 leading-relaxed">
                {q.reference_answer}
                {q.source_file_ref && (
                  <div className="text-xs text-zinc-500 mt-2">מקור: {q.source_file_ref}</div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex justify-between gap-2">
        <button
          onClick={prev}
          disabled={idx === 0}
          className="px-4 py-2 rounded-lg bg-white/5 border border-white/10 disabled:opacity-40"
        >
          קודמת
        </button>
        {isLast ? (
          <button
            onClick={finish}
            disabled={!allEvaluated}
            className="px-5 py-2 rounded-lg bg-gradient-to-l from-emerald-500 to-cyan-500 font-semibold disabled:opacity-40"
          >
            סיים תרגול ✓
          </button>
        ) : (
          <button
            onClick={next}
            disabled={!evaluation}
            className="px-4 py-2 rounded-lg bg-gradient-to-l from-fuchsia-500 to-blue-500 font-semibold disabled:opacity-40"
          >
            הבאה ←
          </button>
        )}
      </div>
    </div>
  )
}

function EvaluationPanel({ ev }: { ev: Evaluation }) {
  const copy = VERDICT_COPY[ev.verdict]
  return (
    <div className={`rounded-lg p-3 border ${copy.tone}`}>
      <div className="flex items-baseline gap-2">
        <span className="text-xl" aria-hidden>
          {copy.emoji}
        </span>
        <strong>{copy.label}</strong>
        <span className="text-xs opacity-70 mr-auto">ביטחון {Math.round(ev.confidence * 100)}%</span>
      </div>
      <p className="text-sm mt-1.5">{ev.reasoning}</p>
      {ev.missing_points.length > 0 && (
        <div className="mt-2 text-xs">
          <div className="opacity-80 mb-1">נקודות שכדאי לכלול:</div>
          <ul className="list-disc pr-5 space-y-0.5">
            {ev.missing_points.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function SummaryView({
  questions,
  answers,
  evaluations,
}: {
  questions: OpenQuestion[]
  answers: Record<string, string>
  evaluations: Record<string, Evaluation>
}) {
  const counts = { full: 0, partial: 0, insufficient: 0, uncertain: 0 }
  for (const q of questions) {
    const v = evaluations[q.id]?.verdict
    if (v) counts[v]++
  }
  return (
    <div dir="rtl" className="space-y-4">
      <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-fuchsia-500/10 to-blue-500/10 p-6 text-center">
        <h2 className="text-xl font-bold mb-3">סיכום תרגול</h2>
        <div className="grid grid-cols-4 gap-2 text-sm">
          <SumStat label="מלאות" value={counts.full} tone="text-emerald-300" />
          <SumStat label="חלקיות" value={counts.partial} tone="text-amber-300" />
          <SumStat label="לא מספקות" value={counts.insufficient} tone="text-red-300" />
          <SumStat label="לא בטוח" value={counts.uncertain} tone="text-zinc-300" />
        </div>
      </div>

      <ul className="space-y-2">
        {questions.map((q, i) => {
          const ev = evaluations[q.id]
          const a = answers[q.id] ?? ''
          const copy = ev ? VERDICT_COPY[ev.verdict] : null
          return (
            <li
              key={q.id}
              className={`rounded-lg border p-3 ${copy?.tone ?? 'bg-white/5 border-white/10'}`}
            >
              <div className="font-medium text-sm">
                {i + 1}. {q.content}
              </div>
              <div className="text-xs text-zinc-400 mt-1">{a.length} תווים · {copy?.label ?? '—'}</div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function SumStat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div>
      <div className={`text-2xl font-bold ${tone}`}>{value}</div>
      <div className="text-[10px] text-zinc-400">{label}</div>
    </div>
  )
}
