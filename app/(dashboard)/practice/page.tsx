'use client'

/**
 * Standalone practice page — /practice.
 *
 * The no-Drive-needed surface of the retrieval-practice feature: paste any
 * study material as text, get a graded constructed-response quiz. Works
 * fully under the dev auth bypass (no Google sign-in) because the quiz is
 * ephemeral — nothing is read from Drive and nothing is persisted.
 *
 * For quizzes generated from actual course files (and saved attempt
 * history), use the per-course page: /courses/[id]/practice.
 */

import { useCallback, useState } from 'react'
import { motion } from 'framer-motion'
import { Loader2, Sparkles } from 'lucide-react'
import { GeneratedQuizSchema } from '@/lib/practice/schemas'
import { useQuizApi } from '@/lib/practice/use-quiz-api'
import QuizRunner from '@/components/practice/QuizRunner'
import type { PracticeQuiz } from '@/types'

const ACCENT = { color: '#0d9488', soft: '#ccfbf1' }
const MIN_PASTE_CHARS = 40

const LENGTH_OPTIONS = [
  { count: 3, label: 'קצר', hint: '3 שאלות' },
  { count: 5, label: 'רגיל', hint: '5 שאלות' },
  { count: 8, label: 'מעמיק', hint: '8 שאלות' },
] as const

export default function StandalonePracticePage() {
  const authedPost = useQuizApi()

  const [subject, setSubject] = useState('')
  const [pasted, setPasted] = useState('')
  const [questionCount, setQuestionCount] = useState<number>(5)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [quiz, setQuiz] = useState<PracticeQuiz | null>(null)
  const [runKey, setRunKey] = useState(0)

  const canGenerate = pasted.trim().length >= MIN_PASTE_CHARS && !generating

  const generate = useCallback(async () => {
    if (pasted.trim().length < MIN_PASTE_CHARS) return
    setGenerating(true)
    setError(null)
    try {
      const res = await authedPost('/api/quiz/generate', {
        text: pasted.trim(),
        courseName: subject.trim() || 'חומר כללי',
        questionCount,
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error || `שגיאה (${res.status})`)
      const gen = GeneratedQuizSchema.parse({ title: data.title, questions: data.questions })

      // Ephemeral quiz — never persisted, so a local id is enough.
      setQuiz({
        id: `local-${runKey + 1}`,
        course_id: '',
        title: gen.title,
        source_files: [],
        questions: gen.questions.map((q, i) => ({
          id: `q${i + 1}`,
          question: q.question,
          rubric: q.rubric,
          model_answer: q.model_answer,
          order_index: i,
        })),
        created_at: new Date().toISOString(),
      })
      setRunKey(k => k + 1)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'יצירת הבוחן נכשלה — נסה שוב')
    } finally {
      setGenerating(false)
    }
  }, [pasted, subject, questionCount, authedPost, runKey])

  return (
    <div
      className="course-v2"
      style={{
        ['--course-color' as any]: ACCENT.color,
        ['--course-soft' as any]: ACCENT.soft,
      }}
    >
      <main className="course-v2-main">
        {quiz ? (
          <QuizRunner
            key={`${quiz.id}-${runKey}`}
            quiz={quiz}
            accent={ACCENT}
            persistenceNote="תרגול חופשי — הנסיון לא נשמר. תרגול מתוך קורס נשמר בהיסטוריה."
            onNewQuiz={() => setQuiz(null)}
            exitHref="/dashboard"
            exitLabel="חזרה לסקירה"
          />
        ) : (
          <motion.section
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            className="mx-auto max-w-2xl"
          >
            <div className="mb-8">
              <h1 className="text-3xl font-extrabold tracking-tight">תרגול חופשי</h1>
              <p className="mt-2 text-[15px] text-neutral-600">
                הדבק כל חומר לימוד — סיכום, קטע מהרצאה, פרק מספר — ונבנה ממנו בוחן
                עם שאלות פתוחות. כל תשובה נבדקת מול מחוון, עם משוב על מה שהיה מדויק
                ומה שחסר.
              </p>
            </div>

            <div className="rounded-2xl border border-black/8 bg-[#fdf6e3] p-5 shadow-sm">
              <label className="mb-1 block text-sm font-bold" htmlFor="practice-subject">
                נושא (לא חובה)
              </label>
              <input
                id="practice-subject"
                value={subject}
                onChange={e => setSubject(e.target.value)}
                placeholder='למשל "אלגברה לינארית" או "מבוא לכלכלה"'
                className="mb-4 w-full rounded-xl border border-black/10 bg-white/70 p-3 text-sm outline-none transition focus:border-[var(--course-color)] focus:bg-white"
              />

              <label className="mb-1 block text-sm font-bold" htmlFor="practice-material">
                החומר
              </label>
              <textarea
                id="practice-material"
                value={pasted}
                onChange={e => setPasted(e.target.value)}
                rows={10}
                placeholder="הדבק כאן את החומר…"
                className="w-full resize-y rounded-xl border border-black/10 bg-white/70 p-3 text-sm leading-relaxed outline-none transition focus:border-[var(--course-color)] focus:bg-white"
              />
              {pasted.trim().length > 0 && pasted.trim().length < MIN_PASTE_CHARS && (
                <p className="mt-1 text-xs text-neutral-400">
                  עוד קצת — צריך לפחות {MIN_PASTE_CHARS} תווים כדי לבנות שאלות
                </p>
              )}

              <div className="mt-4 grid grid-cols-3 gap-2">
                {LENGTH_OPTIONS.map(opt => (
                  <button
                    key={opt.count}
                    type="button"
                    onClick={() => setQuestionCount(opt.count)}
                    className={`rounded-xl border px-2 py-3 text-center transition
                      ${questionCount === opt.count
                        ? 'border-[var(--course-color)] bg-[var(--course-soft)]'
                        : 'border-black/8 bg-white/40 hover:bg-white/70'}`}
                  >
                    <div className="text-sm font-bold">{opt.label}</div>
                    <div className="text-xs text-neutral-500">{opt.hint}</div>
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={generate}
                disabled={!canGenerate}
                className="course-v2-btn primary mt-4 w-full justify-center py-3 text-base"
              >
                {generating
                  ? <><Loader2 size={16} className="course-v2-spin" /> בונה בוחן מהחומר…</>
                  : <><Sparkles size={16} /> צור בוחן</>}
              </button>
              {generating && (
                <p className="mt-2 text-center text-xs text-neutral-500">
                  קורא את החומר וכותב שאלות — זה לוקח עד דקה
                </p>
              )}
              {error && (
                <p className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
              )}
            </div>
          </motion.section>
        )}
      </main>
    </div>
  )
}
