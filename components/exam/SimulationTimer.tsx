'use client'

import { useEffect, useMemo, useState } from 'react'
import type { SimQuestion } from '@/lib/exam/sample-exam'

interface Props {
  examId: string
  questions: SimQuestion[]
  durationMinutes: number
  onSubmit: (answers: Record<string, string>) => void
}

function formatHMS(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  return [h, m, s].map((n) => String(n).padStart(2, '0')).join(':')
}

// Spec §3.4.2: minimal chrome — no mascot, no nav, no notifications, only
// questions and clock. Answers persist as the user types so an accidental
// reload doesn't lose work.
export function SimulationTimer({ examId, questions, durationMinutes, onSubmit }: Props) {
  const [secondsLeft, setSecondsLeft] = useState(durationMinutes * 60)
  const [running, setRunning] = useState(true)
  const [idx, setIdx] = useState(0)
  const [answers, setAnswers] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!running) return
    const t = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          clearInterval(t)
          setRunning(false)
          // Defer submit so we don't update parent state inside the timer setter.
          setTimeout(() => onSubmit(answers), 0)
          return 0
        }
        return s - 1
      })
    }, 1000)
    return () => clearInterval(t)
    // We intentionally read `answers` via closure; resetting the timer on every
    // keystroke would be wrong.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, onSubmit])

  // Auto-save answers as they change.
  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(`teepo_exam_sim_inflight_${examId}`, JSON.stringify(answers))
  }, [answers, examId])

  const q = questions[idx]
  const totalAnswered = useMemo(
    () => Object.values(answers).filter((v) => v && v.trim().length > 0).length,
    [answers],
  )

  const submit = () => {
    setRunning(false)
    onSubmit(answers)
  }

  const setAnswer = (qid: string, value: string) =>
    setAnswers((prev) => ({ ...prev, [qid]: value }))

  return (
    <div dir="rtl" className="fixed inset-0 bg-zinc-950 text-zinc-100 z-50 flex flex-col">
      <header className="border-b border-white/10 px-6 py-4 flex items-center justify-between">
        <div className="text-xs uppercase tracking-widest text-zinc-500">סימולציה · {examId}</div>
        <div
          className={`text-3xl font-mono font-bold tabular-nums ${
            secondsLeft < 600 ? 'text-red-400' : 'text-zinc-100'
          }`}
          aria-live="polite"
        >
          {formatHMS(secondsLeft)}
        </div>
        <div className="text-xs text-zinc-500">
          ענית {totalAnswered}/{questions.length}
        </div>
      </header>

      <div className="flex-1 grid grid-cols-1 md:grid-cols-[1fr,200px] gap-6 p-6 overflow-hidden">
        <div className="overflow-y-auto">
          <div className="max-w-2xl mx-auto">
            <div className="text-xs text-zinc-500 mb-2">
              שאלה {idx + 1} מתוך {questions.length} · {q.points} נקודות
            </div>
            <h2 className="text-lg font-semibold mb-6 leading-relaxed">{q.content}</h2>

            {q.type === 'mcq' && q.options && (
              <div className="space-y-2">
                {q.options.map((opt) => {
                  const selected = answers[q.id] === opt.label
                  return (
                    <button
                      key={opt.label}
                      onClick={() => setAnswer(q.id, opt.label)}
                      className={`w-full text-right p-3 rounded-lg border transition ${
                        selected
                          ? 'bg-blue-500/20 border-blue-400'
                          : 'bg-white/5 border-white/10 hover:bg-white/10'
                      }`}
                    >
                      <span className="font-bold ml-2">{opt.label}.</span>
                      {opt.text}
                    </button>
                  )
                })}
              </div>
            )}

            {q.type === 'open' && (
              <textarea
                value={answers[q.id] ?? ''}
                onChange={(e) => setAnswer(q.id, e.target.value)}
                placeholder="כתוב כאן את התשובה שלך..."
                rows={10}
                className="w-full bg-white/5 border border-white/10 rounded-lg p-3 outline-none focus:border-blue-400 resize-y"
                dir="rtl"
              />
            )}
          </div>
        </div>

        <aside className="hidden md:flex flex-col gap-3">
          <div className="text-xs text-zinc-500 mb-1">ניווט</div>
          <div className="grid grid-cols-5 gap-1.5">
            {questions.map((qq, i) => {
              const answered = !!answers[qq.id]?.trim()
              const current = i === idx
              return (
                <button
                  key={qq.id}
                  onClick={() => setIdx(i)}
                  aria-label={`שאלה ${i + 1}${answered ? ', נענתה' : ''}`}
                  className={`aspect-square rounded font-mono text-sm transition ${
                    current
                      ? 'bg-blue-500 text-white'
                      : answered
                      ? 'bg-emerald-500/30 text-emerald-200'
                      : 'bg-white/5 hover:bg-white/10 text-zinc-400'
                  }`}
                >
                  {i + 1}
                </button>
              )
            })}
          </div>
          <button
            onClick={submit}
            className="mt-auto px-4 py-3 rounded-lg bg-red-600 hover:bg-red-700 transition font-semibold"
          >
            הגש סימולציה
          </button>
        </aside>
      </div>

      <footer className="border-t border-white/10 px-6 py-3 flex justify-between gap-3">
        <button
          onClick={() => setIdx(Math.max(0, idx - 1))}
          disabled={idx === 0}
          className="px-4 py-2 rounded-lg bg-white/5 border border-white/10 disabled:opacity-40"
        >
          ← קודמת
        </button>
        <button
          onClick={submit}
          className="md:hidden px-4 py-2 rounded-lg bg-red-600 font-semibold"
        >
          הגש
        </button>
        <button
          onClick={() => setIdx(Math.min(questions.length - 1, idx + 1))}
          disabled={idx === questions.length - 1}
          className="px-4 py-2 rounded-lg bg-white/5 border border-white/10 disabled:opacity-40"
        >
          הבאה →
        </button>
      </footer>
    </div>
  )
}
