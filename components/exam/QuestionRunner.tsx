'use client'

import { useState } from 'react'
import type { Question } from '@/types'

interface Result {
  total: number
  correct: number
  answers: Record<string, { label: string; is_correct: boolean }>
}

interface Props {
  planId: string
  questions?: Question[]
  onComplete?: (result: Result) => void
  onRequestGenerate?: () => void
  generating?: boolean
}

export function QuestionRunner({
  questions = [],
  onComplete,
  onRequestGenerate,
  generating = false,
}: Props) {
  const [idx, setIdx] = useState(0)
  const [answers, setAnswers] = useState<Record<string, { label: string; is_correct: boolean }>>({})
  const [done, setDone] = useState(false)

  if (questions.length === 0) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/5 p-8 text-center">
        <p className="text-zinc-300 mb-4">{generating ? '⏳ יוצר תרגילים…' : 'אין תרגילים פעילים.'}</p>
        {onRequestGenerate && (
          <button
            onClick={onRequestGenerate}
            disabled={generating}
            className="px-5 py-2 rounded-lg bg-gradient-to-l from-fuchsia-500 to-blue-500 font-semibold disabled:opacity-40"
          >
            צור תרגיל
          </button>
        )}
      </div>
    )
  }

  if (done) {
    const correct = Object.values(answers).filter((a) => a.is_correct).length
    return (
      <ResultsScreen
        total={questions.length}
        correct={correct}
        questions={questions}
        answers={answers}
      />
    )
  }

  const q = questions[idx]
  const userAnswer = answers[q.id]
  const answered = userAnswer !== undefined
  const isLast = idx === questions.length - 1
  const allAnswered = questions.every((qq) => answers[qq.id] !== undefined)

  const choose = (option: NonNullable<Question['options']>[number]) => {
    if (answered) return
    setAnswers({ ...answers, [q.id]: { label: option.label, is_correct: option.is_correct } })
  }

  const finish = () => {
    setDone(true)
    onComplete?.({
      total: questions.length,
      correct: Object.values(answers).filter((a) => a.is_correct).length,
      answers,
    })
  }

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

      <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
        <p className="text-lg leading-relaxed mb-4">{q.content}</p>

        {q.type === 'mcq' && q.options && (
          <div className="space-y-2">
            {q.options.map((opt) => {
              const isUser = userAnswer?.label === opt.label
              const cls = answered
                ? opt.is_correct
                  ? 'bg-emerald-500/20 border-emerald-500/50'
                  : isUser
                  ? 'bg-red-500/20 border-red-500/50'
                  : 'bg-white/5 border-white/10'
                : 'bg-white/5 border-white/10 hover:bg-white/10'
              return (
                <button
                  key={opt.label}
                  disabled={answered}
                  onClick={() => choose(opt)}
                  className={`w-full text-right p-3 rounded-lg border transition ${cls}`}
                >
                  <span className="font-bold ml-2">{opt.label}.</span>
                  {opt.text}
                </button>
              )
            })}
          </div>
        )}

        {answered && q.explanation && (
          <div className="mt-4 p-3 rounded-lg bg-cyan-500/10 border-r-2 border-cyan-400 text-sm">
            <strong className="text-cyan-300">הסבר:</strong> {q.explanation}
            {q.source_file_ref && (
              <div className="text-xs text-zinc-400 mt-1">מקור: {q.source_file_ref}</div>
            )}
          </div>
        )}
      </div>

      <div className="flex justify-between gap-2">
        <button
          disabled={idx === 0}
          onClick={() => setIdx(idx - 1)}
          className="px-4 py-2 rounded-lg bg-white/5 border border-white/10 disabled:opacity-40"
        >
          הקודמת
        </button>

        {isLast ? (
          <button
            disabled={!allAnswered}
            onClick={finish}
            className="px-5 py-2 rounded-lg bg-gradient-to-l from-emerald-500 to-cyan-500 font-semibold disabled:opacity-40"
          >
            סיים תרגול ✓
          </button>
        ) : (
          <button
            disabled={!answered}
            onClick={() => setIdx(idx + 1)}
            className="px-4 py-2 rounded-lg bg-gradient-to-l from-fuchsia-500 to-blue-500 font-semibold disabled:opacity-40"
          >
            הבאה ←
          </button>
        )}
      </div>
    </div>
  )
}

function ResultsScreen({
  total,
  correct,
  questions,
  answers,
}: {
  total: number
  correct: number
  questions: Question[]
  answers: Record<string, { label: string; is_correct: boolean }>
}) {
  const pct = Math.round((correct / total) * 100)
  const verdict =
    pct >= 90 ? 'מצוין! שולט בחומר' : pct >= 70 ? 'טוב מאוד' : pct >= 50 ? 'יש על מה לעבוד' : 'מומלץ לחזור על החומר'

  return (
    <div dir="rtl" className="space-y-4">
      <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-fuchsia-500/10 to-blue-500/10 p-8 text-center">
        <div className="text-6xl font-bold tabular-nums">
          {pct}
          <span className="text-2xl text-zinc-400">%</span>
        </div>
        <div className="text-lg font-semibold mt-2">{verdict}</div>
        <div className="text-sm text-zinc-400 mt-1">
          {correct} מתוך {total} נכון
        </div>
      </div>

      <ul className="space-y-2 max-h-96 overflow-y-auto">
        {questions.map((q, i) => {
          const a = answers[q.id]
          const correct = a?.is_correct
          return (
            <li
              key={q.id}
              className={`rounded-lg border p-3 ${
                correct
                  ? 'bg-emerald-500/10 border-emerald-500/40'
                  : 'bg-red-500/10 border-red-500/40'
              }`}
            >
              <div className="text-sm font-medium">
                {i + 1}. {q.content}
              </div>
              {q.options && (
                <div className="text-xs text-zinc-400 mt-1">
                  ענית: {a?.label} · נכון: {q.options.find((o) => o.is_correct)?.label}
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
