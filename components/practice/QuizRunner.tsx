'use client'

/**
 * QuizRunner — the answer → grade → feedback → summary loop for one
 * PracticeQuiz sitting. Shared by the per-course practice page
 * (/courses/[id]/practice) and the standalone /practice page.
 *
 * Owns all attempt state; the parent owns quiz creation and persistence.
 * `onSaveAttempt` is optional — the standalone page runs ephemeral quizzes
 * and passes a `persistenceNote` instead.
 */

import { useCallback, useState } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft, Check, ChevronDown, Loader2, RotateCcw, Sparkles, X,
} from 'lucide-react'
import { useQuizApi } from '@/lib/practice/use-quiz-api'
import { GradeResultSchema, type GradeResult } from '@/lib/practice/schemas'
import type { PracticeAnswerGrade, PracticeAttempt, PracticeQuiz } from '@/types'

export function scoreTone(score: number): string {
  if (score >= 85) return '#16a34a'
  if (score >= 60) return '#d97706'
  return '#e11d48'
}

interface AnswerState {
  answer: string
  grade: GradeResult | null
  skipped: boolean
}

export interface QuizRunnerProps {
  quiz: PracticeQuiz
  accent: { color: string; soft: string }
  /** Persist the finished attempt. Omit for ephemeral (unsaved) runs. */
  onSaveAttempt?: (attempt: Omit<PracticeAttempt, 'id'>) => Promise<unknown> | void
  /** Shown on the summary screen instead of the "attempt saved" line. */
  persistenceNote?: string
  /** "בוחן חדש" on the summary screen — back to the parent's setup UI. */
  onNewQuiz: () => void
  exitHref: string
  exitLabel: string
}

export default function QuizRunner({
  quiz, accent, onSaveAttempt, persistenceNote, onNewQuiz, exitHref, exitLabel,
}: QuizRunnerProps) {
  const authedPost = useQuizApi()

  const [phase, setPhase] = useState<'active' | 'summary'>('active')
  const [startedAt, setStartedAt] = useState(() => new Date().toISOString())
  const [idx, setIdx] = useState(0)
  const [answers, setAnswers] = useState<Record<string, AnswerState>>({})
  const [draft, setDraft] = useState('')
  const [grading, setGrading] = useState(false)
  const [gradeError, setGradeError] = useState<string | null>(null)
  const [rubricOpen, setRubricOpen] = useState(false)
  const [finalScore, setFinalScore] = useState<number | undefined>(undefined)

  const q = quiz.questions[idx]
  const current = q ? answers[q.id] : undefined
  const answeredCount = quiz.questions.filter(qq => answers[qq.id]).length

  const restart = useCallback(() => {
    setPhase('active')
    setStartedAt(new Date().toISOString())
    setIdx(0)
    setAnswers({})
    setDraft('')
    setGradeError(null)
    setRubricOpen(false)
    setFinalScore(undefined)
  }, [])

  const submitAnswer = useCallback(async () => {
    if (!q || !draft.trim() || grading) return
    setGrading(true)
    setGradeError(null)
    try {
      const res = await authedPost('/api/quiz/grade', {
        question: q.question,
        rubric: q.rubric,
        model_answer: q.model_answer,
        answer: draft.trim(),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error || `שגיאה (${res.status})`)
      const grade = GradeResultSchema.parse(data)
      setAnswers(prev => ({ ...prev, [q.id]: { answer: draft.trim(), grade, skipped: false } }))
    } catch (e) {
      setGradeError(e instanceof Error ? e.message : 'הבדיקה נכשלה — נסה שוב')
    } finally {
      setGrading(false)
    }
  }, [q, draft, grading, authedPost])

  async function finishAttempt() {
    const grades: PracticeAnswerGrade[] = quiz.questions.map(qq => {
      const a = answers[qq.id]
      return {
        question_id: qq.id,
        answer: a?.answer ?? '',
        score: a?.grade ? a.grade.score : null,
        feedback: a?.grade?.feedback,
        strengths: a?.grade?.strengths,
        gaps: a?.grade?.gaps,
      }
    })
    const scored = grades.filter(g => g.score != null)
    const mean = scored.length
      ? Math.round(scored.reduce((s, g) => s + (g.score ?? 0), 0) / scored.length)
      : undefined
    setFinalScore(mean)
    if (onSaveAttempt) {
      await onSaveAttempt({
        quiz_id: quiz.id,
        course_id: quiz.course_id,
        started_at: startedAt,
        completed_at: new Date().toISOString(),
        grades,
        score: mean,
      })
    }
    setPhase('summary')
  }

  function advance() {
    if (idx + 1 < quiz.questions.length) {
      setIdx(idx + 1)
      setDraft('')
      setGradeError(null)
      setRubricOpen(false)
    } else {
      void finishAttempt()
    }
  }

  function skipQuestion() {
    if (!q) return
    setAnswers(prev => ({ ...prev, [q.id]: { answer: '', grade: null, skipped: true } }))
    advance()
  }

  if (phase === 'summary') {
    return (
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mx-auto max-w-2xl text-center"
      >
        <motion.div
          initial={{ scale: 0.7, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 200, damping: 18, delay: 0.1 }}
          className="mx-auto mb-4 grid h-28 w-28 place-items-center rounded-full text-4xl font-extrabold text-white shadow-lg"
          style={{ background: finalScore != null ? scoreTone(finalScore) : '#a3a3a3' }}
        >
          {finalScore ?? '—'}
        </motion.div>
        <h1 className="text-2xl font-extrabold">{quiz.title}</h1>
        <p className="mt-1 text-sm text-neutral-500">
          {finalScore == null
            ? 'אף שאלה לא הוגשה לבדיקה בנסיון הזה'
            : persistenceNote ?? 'הציון הוא ממוצע השאלות שנבדקו — הנסיון נשמר'}
        </p>

        <ul className="mt-8 space-y-2 text-right">
          {quiz.questions.map(qq => {
            const a = answers[qq.id]
            return (
              <li
                key={qq.id}
                className="flex items-center gap-3 rounded-2xl border border-black/8 bg-[#fdf6e3] px-4 py-3"
              >
                <span
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-sm font-extrabold text-white"
                  style={{ background: a?.grade ? scoreTone(a.grade.score) : '#a3a3a3' }}
                >
                  {a?.grade ? a.grade.score : '·'}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm">{qq.question}</span>
                {a?.skipped && <span className="text-xs text-neutral-400">דילגת</span>}
              </li>
            )
          })}
        </ul>

        <div className="mt-8 flex justify-center gap-2">
          <button type="button" onClick={onNewQuiz} className="course-v2-btn">
            <Sparkles size={14} /> בוחן חדש
          </button>
          <button type="button" onClick={restart} className="course-v2-btn">
            <RotateCcw size={14} /> נסה שוב
          </button>
          <Link href={exitHref} className="course-v2-btn primary">
            {exitLabel}
          </Link>
        </div>
      </motion.section>
    )
  }

  if (!q) return null

  return (
    <section className="mx-auto max-w-2xl">
      {/* Progress */}
      <div className="mb-6">
        <div className="mb-2 flex items-baseline justify-between">
          <h1 className="text-lg font-extrabold">{quiz.title}</h1>
          <span className="text-sm text-neutral-500">
            שאלה {idx + 1} מתוך {quiz.questions.length}
          </span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-black/8">
          <motion.div
            className="h-full rounded-full"
            style={{ background: accent.color }}
            animate={{ width: `${(answeredCount / quiz.questions.length) * 100}%` }}
            transition={{ type: 'spring', stiffness: 120, damping: 20 }}
          />
        </div>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={q.id}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
        >
          {/* Question */}
          <div className="rounded-2xl border border-black/8 bg-[#fdf6e3] p-6 shadow-sm">
            <p className="text-lg font-semibold leading-relaxed">{q.question}</p>
          </div>

          {/* Answer / feedback */}
          {!current?.grade ? (
            <div className="mt-4">
              <textarea
                value={draft}
                onChange={e => setDraft(e.target.value)}
                disabled={grading}
                rows={6}
                placeholder="כתוב את התשובה שלך במילים שלך — גם תשובה חלקית שווה משוב"
                className="w-full resize-y rounded-2xl border border-black/10 bg-white/70 p-4 text-[15px] leading-relaxed outline-none transition focus:border-[var(--course-color)] focus:bg-white"
              />
              <div className="mt-3 flex items-center gap-2">
                <button
                  type="button"
                  onClick={submitAnswer}
                  disabled={grading || !draft.trim()}
                  className="course-v2-btn primary"
                >
                  {grading
                    ? <><Loader2 size={14} className="course-v2-spin" /> בודק מול המחוון…</>
                    : <>הגש לבדיקה</>}
                </button>
                <button type="button" onClick={skipQuestion} disabled={grading} className="course-v2-btn">
                  דלג
                </button>
              </div>
              {gradeError && (
                <p className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{gradeError}</p>
              )}
            </div>
          ) : (
            <motion.div
              initial={{ opacity: 0, y: 16, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              className="mt-4 rounded-2xl border border-black/8 bg-white/70 p-6 shadow-sm"
            >
              <div className="mb-4 flex items-center gap-3">
                <span
                  className="grid h-14 w-14 place-items-center rounded-2xl text-xl font-extrabold text-white"
                  style={{ background: scoreTone(current.grade.score) }}
                >
                  {current.grade.score}
                </span>
                <p className="flex-1 text-[15px] leading-relaxed">{current.grade.feedback}</p>
              </div>

              {(current.grade.strengths.length > 0 || current.grade.gaps.length > 0) && (
                <div className="mb-4 grid gap-2 sm:grid-cols-2">
                  {current.grade.strengths.map((s, i) => (
                    <div key={`s${i}`} className="flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                      <Check size={14} className="shrink-0" /> {s}
                    </div>
                  ))}
                  {current.grade.gaps.map((g, i) => (
                    <div key={`g${i}`} className="flex items-center gap-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">
                      <X size={14} className="shrink-0" /> {g}
                    </div>
                  ))}
                </div>
              )}

              <button
                type="button"
                onClick={() => setRubricOpen(o => !o)}
                className="flex items-center gap-1 text-sm font-medium text-neutral-500 hover:text-neutral-800"
              >
                <ChevronDown size={14} className={`transition-transform ${rubricOpen ? 'rotate-180' : ''}`} />
                מחוון ותשובת מודל
              </button>
              <AnimatePresence>
                {rubricOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="mt-3 space-y-3 border-t border-black/8 pt-3 text-sm text-neutral-700">
                      <div>
                        <div className="mb-1 font-bold">המחוון</div>
                        <p className="whitespace-pre-line leading-relaxed">{q.rubric}</p>
                      </div>
                      {q.model_answer && (
                        <div>
                          <div className="mb-1 font-bold">תשובת מודל</div>
                          <p className="leading-relaxed">{q.model_answer}</p>
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="mt-5 flex justify-end">
                <button type="button" onClick={advance} className="course-v2-btn primary">
                  {idx + 1 < quiz.questions.length ? 'לשאלה הבאה' : 'סיום הבוחן'}
                  <ArrowLeft size={14} />
                </button>
              </div>
            </motion.div>
          )}
        </motion.div>
      </AnimatePresence>
    </section>
  )
}
