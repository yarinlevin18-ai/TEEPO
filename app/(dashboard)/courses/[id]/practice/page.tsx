'use client'

/**
 * Practice page — retrieval-practice quizzes for one course.
 *
 * Flow (Phosphor-style, see docs/REBUILD_PLAN.md):
 *   1. setup   — pick source files from the course's Drive folders + length,
 *                or retake a previously generated quiz.
 *   2. active  — answer constructed-response questions one at a time; each
 *                answer is graded against its rubric immediately, with
 *                feedback + the rubric revealed after grading.
 *   3. summary — attempt score + per-question review; attempt persisted to
 *                the Drive DB.
 *
 * All data flows through existing plumbing: useDriveFiles for the material
 * list, useDB for persistence, /api/quiz/* for generation + grading.
 */

import { useCallback, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft, Check, ChevronDown, ClipboardCheck, FileText, Loader2,
  Presentation, RotateCcw, Sparkles, Trash2, X,
} from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import { useDB, useCourse, usePracticeQuizzes } from '@/lib/db-context'
import { useDriveFiles } from '@/lib/use-drive-files'
import type { DriveFile } from '@/lib/drive-files'
import {
  GeneratedQuizSchema, GradeResultSchema, type GradeResult,
} from '@/lib/practice/schemas'
import type { PracticeAnswerGrade, PracticeQuiz } from '@/types'

// Same deterministic per-course palette as /courses/[id] and /tasks.
const COURSE_PALETTE = [
  { color: '#8b5cf6', soft: '#ede9fe' },
  { color: '#d97706', soft: '#fef3c7' },
  { color: '#0d9488', soft: '#ccfbf1' },
  { color: '#e11d48', soft: '#fee2e2' },
  { color: '#6366f1', soft: '#e0e7ff' },
  { color: '#16a34a', soft: '#dcfce7' },
]
function paletteIdx(key: string): number {
  let h = 0
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0
  return Math.abs(h) % COURSE_PALETTE.length
}

const SUPPORTED_MIME = (m: string) =>
  m === 'application/pdf' ||
  m === 'application/vnd.google-apps.document' ||
  m === 'application/vnd.google-apps.presentation' ||
  m.startsWith('text/')

const MAX_FILES = 6

const LENGTH_OPTIONS = [
  { count: 3, label: 'קצר', hint: '3 שאלות' },
  { count: 5, label: 'רגיל', hint: '5 שאלות' },
  { count: 8, label: 'מעמיק', hint: '8 שאלות' },
] as const

type Mode = 'setup' | 'active' | 'summary'

interface AnswerState {
  answer: string
  grade: GradeResult | null
  skipped: boolean
}

function scoreTone(score: number): string {
  if (score >= 85) return '#16a34a'
  if (score >= 60) return '#d97706'
  return '#e11d48'
}

export default function PracticePage() {
  const params = useParams<{ id: string }>()
  const courseId = params?.id
  const course = useCourse(courseId)
  const { googleToken, refreshGoogleToken } = useAuth()
  const {
    ready, createPracticeQuiz, deletePracticeQuiz, savePracticeAttempt, flushSave, db,
  } = useDB()
  const quizzes = usePracticeQuizzes(courseId)

  // Source material: the course's user-facing Drive folders.
  const lessonsFiles = useDriveFiles(course?.drive_folder_ids?.lessons ?? null)
  const notesFiles = useDriveFiles(course?.drive_folder_ids?.notes ?? null)
  const assignmentFiles = useDriveFiles(course?.drive_folder_ids?.assignments ?? null)

  const allFiles = useMemo<DriveFile[]>(() => {
    const seen = new Set<string>()
    return [...lessonsFiles.files, ...notesFiles.files, ...assignmentFiles.files]
      .filter(f => (seen.has(f.id) ? false : (seen.add(f.id), true)))
      .sort((a, b) => (b.modifiedTime ?? '').localeCompare(a.modifiedTime ?? ''))
  }, [lessonsFiles.files, notesFiles.files, assignmentFiles.files])

  const [mode, setMode] = useState<Mode>('setup')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [questionCount, setQuestionCount] = useState<number>(5)
  const [generating, setGenerating] = useState(false)
  const [setupError, setSetupError] = useState<string | null>(null)
  const [skippedFiles, setSkippedFiles] = useState<string[]>([])
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  const [quiz, setQuiz] = useState<PracticeQuiz | null>(null)
  const [startedAt, setStartedAt] = useState<string>('')
  const [idx, setIdx] = useState(0)
  const [answers, setAnswers] = useState<Record<string, AnswerState>>({})
  const [draft, setDraft] = useState('')
  const [grading, setGrading] = useState(false)
  const [gradeError, setGradeError] = useState<string | null>(null)
  const [rubricOpen, setRubricOpen] = useState(false)
  const [finalScore, setFinalScore] = useState<number | undefined>(undefined)

  const palette = COURSE_PALETTE[paletteIdx(courseId ?? '')]

  // POST with the google token; one refresh+retry on 401.
  const authedPost = useCallback(async (url: string, body: unknown): Promise<Response> => {
    let token = googleToken || (await refreshGoogleToken())
    if (!token) throw new Error('לא מחובר ל-Google — התחבר מחדש ונסה שוב')
    let res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    })
    if (res.status === 401) {
      token = await refreshGoogleToken()
      if (token) {
        res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(body),
        })
      }
    }
    return res
  }, [googleToken, refreshGoogleToken])

  // ── Generate a new quiz ─────────────────────────────────────────────
  const generate = useCallback(async () => {
    if (!course || selected.size === 0) return
    setGenerating(true)
    setSetupError(null)
    setSkippedFiles([])
    try {
      const files = allFiles
        .filter(f => selected.has(f.id))
        .map(f => ({ id: f.id, name: f.name, mimeType: f.mimeType }))
      const res = await authedPost('/api/quiz/generate', {
        files, courseName: course.title, questionCount,
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error || `שגיאה (${res.status})`)
      const gen = GeneratedQuizSchema.parse({ title: data.title, questions: data.questions })

      const saved = await createPracticeQuiz({
        course_id: course.id,
        title: gen.title,
        source_files: files.map(f => ({ id: f.id, name: f.name })),
        questions: gen.questions.map((q, i) => ({
          id: `q${i + 1}`,
          question: q.question,
          rubric: q.rubric,
          model_answer: q.model_answer,
          order_index: i,
        })),
      })
      setSkippedFiles(Array.isArray(data.skipped) ? data.skipped : [])
      beginAttempt(saved)
    } catch (e) {
      setSetupError(e instanceof Error ? e.message : 'יצירת הבוחן נכשלה — נסה שוב')
    } finally {
      setGenerating(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [course, selected, questionCount, allFiles, authedPost, createPracticeQuiz])

  function beginAttempt(q: PracticeQuiz) {
    setQuiz(q)
    setStartedAt(new Date().toISOString())
    setIdx(0)
    setAnswers({})
    setDraft('')
    setGradeError(null)
    setRubricOpen(false)
    setMode('active')
  }

  // ── Grade the current answer ────────────────────────────────────────
  const submitAnswer = useCallback(async () => {
    if (!quiz || !draft.trim() || grading) return
    const q = quiz.questions[idx]
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
      setAnswers(prev => ({
        ...prev,
        [q.id]: { answer: draft.trim(), grade, skipped: false },
      }))
    } catch (e) {
      setGradeError(e instanceof Error ? e.message : 'הבדיקה נכשלה — נסה שוב')
    } finally {
      setGrading(false)
    }
  }, [quiz, idx, draft, grading, authedPost])

  const skipQuestion = useCallback(() => {
    if (!quiz) return
    const q = quiz.questions[idx]
    setAnswers(prev => ({ ...prev, [q.id]: { answer: '', grade: null, skipped: true } }))
    advance()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quiz, idx])

  function advance() {
    if (!quiz) return
    if (idx + 1 < quiz.questions.length) {
      setIdx(idx + 1)
      setDraft('')
      setGradeError(null)
      setRubricOpen(false)
    } else {
      void finishAttempt()
    }
  }

  async function finishAttempt() {
    if (!quiz) return
    const grades: PracticeAnswerGrade[] = quiz.questions.map(q => {
      const a = answers[q.id]
      return {
        question_id: q.id,
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
    await savePracticeAttempt({
      quiz_id: quiz.id,
      course_id: quiz.course_id,
      started_at: startedAt,
      completed_at: new Date().toISOString(),
      grades,
      score: mean,
    })
    void flushSave().catch(() => {})
    setMode('summary')
  }

  // ── Guards ──────────────────────────────────────────────────────────
  if (!ready) {
    return (
      <div className="course-v2"><main className="course-v2-main">
        <div className="flex items-center gap-2 py-24 justify-center text-neutral-500">
          <Loader2 size={18} className="animate-spin" /> טוען…
        </div>
      </main></div>
    )
  }
  if (!course) {
    return (
      <div className="course-v2"><main className="course-v2-main">
        <div className="py-24 text-center">
          <p className="mb-4 font-medium">הקורס לא נמצא</p>
          <Link href="/courses" className="course-v2-btn inline-flex">חזרה לקורסים</Link>
        </div>
      </main></div>
    )
  }

  const q = quiz?.questions[idx]
  const current = q ? answers[q.id] : undefined
  const answeredCount = quiz
    ? quiz.questions.filter(qq => answers[qq.id]).length
    : 0

  return (
    <div
      className="course-v2"
      style={{
        ['--course-color' as any]: palette.color,
        ['--course-soft' as any]: palette.soft,
      }}
    >
      <main className="course-v2-main">

        {/* Breadcrumb */}
        <nav className="course-v2-breadcrumb" aria-label="ניווט פירורים">
          <Link href="/summaries">המוח</Link>
          <span className="sep">·</span>
          <Link href={`/courses/${course.id}`}>{course.title}</Link>
          <span className="sep">·</span>
          <span className="current">תרגול</span>
        </nav>

        {/* ═══════════ SETUP ═══════════ */}
        {mode === 'setup' && (
          <motion.section initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
            <div className="mb-8">
              <h1 className="text-3xl font-extrabold tracking-tight">תרגול</h1>
              <p className="mt-2 max-w-xl text-[15px] text-neutral-600">
                בחר חומר מהקורס — שיעור, סיכום או תרגיל — ונבנה ממנו בוחן עם שאלות
                פתוחות. כל תשובה נבדקת מול מחוון, עם משוב על מה שהיה מדויק ומה שחסר.
              </p>
            </div>

            <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
              {/* File picker */}
              <div className="rounded-2xl border border-black/8 bg-[#fdf6e3] p-5 shadow-sm">
                <h2 className="mb-1 font-bold">החומר לבוחן</h2>
                <p className="mb-4 text-sm text-neutral-500">
                  עד {MAX_FILES} קבצים — PDF, Google Docs או מצגות. שבוע אחד של חומר עובד הכי טוב.
                </p>

                {allFiles.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-black/15 p-8 text-center text-sm text-neutral-500">
                    {course.drive_folder_ids?.course
                      ? 'אין עדיין קבצים בתיקיות הקורס. העלה חומר דרך עמוד הקורס או המוח.'
                      : 'לקורס עוד אין תיקיות Drive — פתח את עמוד הקורס כדי ליצור אותן.'}
                    <div className="mt-4">
                      <Link href={`/courses/${course.id}`} className="course-v2-btn inline-flex">
                        לעמוד הקורס
                      </Link>
                    </div>
                  </div>
                ) : (
                  <ul className="space-y-1.5">
                    {allFiles.map(f => {
                      const supported = SUPPORTED_MIME(f.mimeType)
                      const isSel = selected.has(f.id)
                      const atCap = !isSel && selected.size >= MAX_FILES
                      return (
                        <li key={f.id}>
                          <button
                            type="button"
                            disabled={!supported || atCap}
                            onClick={() => setSelected(prev => {
                              const next = new Set(prev)
                              if (next.has(f.id)) next.delete(f.id); else next.add(f.id)
                              return next
                            })}
                            className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-right text-sm transition
                              ${isSel
                                ? 'border-[var(--course-color)] bg-[var(--course-soft)]'
                                : 'border-black/8 bg-white/40 hover:bg-white/70'}
                              ${!supported || atCap ? 'cursor-not-allowed opacity-45' : ''}`}
                            title={supported ? f.name : 'סוג קובץ שלא נתמך לתרגול'}
                          >
                            <span
                              className={`grid h-5 w-5 shrink-0 place-items-center rounded-md border
                                ${isSel ? 'border-[var(--course-color)] bg-[var(--course-color)] text-white' : 'border-black/20'}`}
                            >
                              {isSel && <Check size={13} strokeWidth={3} />}
                            </span>
                            {f.mimeType.includes('presentation')
                              ? <Presentation size={16} className="shrink-0 text-neutral-500" />
                              : <FileText size={16} className="shrink-0 text-neutral-500" />}
                            <span className="min-w-0 flex-1 truncate">{f.name}</span>
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>

              {/* Length + generate */}
              <div className="flex flex-col gap-4">
                <div className="rounded-2xl border border-black/8 bg-[#fdf6e3] p-5 shadow-sm">
                  <h2 className="mb-3 font-bold">אורך הבוחן</h2>
                  <div className="grid grid-cols-3 gap-2">
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
                </div>

                <button
                  type="button"
                  onClick={generate}
                  disabled={generating || selected.size === 0}
                  className="course-v2-btn primary justify-center py-3 text-base"
                >
                  {generating
                    ? <><Loader2 size={16} className="course-v2-spin" /> בונה בוחן מהחומר…</>
                    : <><Sparkles size={16} /> צור בוחן ({selected.size} קבצים)</>}
                </button>
                {generating && (
                  <p className="text-center text-xs text-neutral-500">
                    קורא את החומר וכותב שאלות — זה לוקח עד דקה
                  </p>
                )}
                {setupError && (
                  <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{setupError}</p>
                )}
              </div>
            </div>

            {/* Past quizzes */}
            {quizzes.length > 0 && (
              <div className="mt-10">
                <h2 className="mb-3 font-bold">בחנים קודמים</h2>
                <ul className="space-y-2">
                  {quizzes.map(pq => {
                    const attempts = (db.practice_attempts ?? []).filter(a => a.quiz_id === pq.id)
                    const best = attempts.reduce<number | null>(
                      (m, a) => (a.score != null && (m == null || a.score > m) ? a.score : m),
                      null,
                    )
                    return (
                      <li
                        key={pq.id}
                        className="flex items-center gap-3 rounded-2xl border border-black/8 bg-[#fdf6e3] px-4 py-3 shadow-sm"
                      >
                        <ClipboardCheck size={18} style={{ color: palette.color }} className="shrink-0" />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-bold">{pq.title}</div>
                          <div className="text-xs text-neutral-500">
                            {pq.questions.length} שאלות
                            {attempts.length > 0 && <> · {attempts.length} נסיונות</>}
                            {best != null && <> · הכי טוב: {best}</>}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => beginAttempt(pq)}
                          className="course-v2-btn"
                        >
                          <RotateCcw size={13} /> תרגל שוב
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (confirmDelete === pq.id) {
                              void deletePracticeQuiz(pq.id)
                              setConfirmDelete(null)
                            } else setConfirmDelete(pq.id)
                          }}
                          className={`course-v2-btn ${confirmDelete === pq.id ? '!text-rose-600' : ''}`}
                          aria-label="מחק בוחן"
                        >
                          {confirmDelete === pq.id ? 'בטוח?' : <Trash2 size={13} />}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </div>
            )}
          </motion.section>
        )}

        {/* ═══════════ ACTIVE ═══════════ */}
        {mode === 'active' && quiz && q && (
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
                  style={{ background: palette.color }}
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
                      <button
                        type="button"
                        onClick={skipQuestion}
                        disabled={grading}
                        className="course-v2-btn"
                      >
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
        )}

        {/* ═══════════ SUMMARY ═══════════ */}
        {mode === 'summary' && quiz && (
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
              {finalScore != null
                ? 'הציון הוא ממוצע השאלות שנבדקו — הנסיון נשמר'
                : 'אף שאלה לא הוגשה לבדיקה בנסיון הזה'}
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
              <button
                type="button"
                onClick={() => { setMode('setup'); setSelected(new Set()); setQuiz(null) }}
                className="course-v2-btn"
              >
                <Sparkles size={14} /> בוחן חדש
              </button>
              <button
                type="button"
                onClick={() => beginAttempt(quiz)}
                className="course-v2-btn"
              >
                <RotateCcw size={14} /> נסה שוב
              </button>
              <Link href={`/courses/${course.id}`} className="course-v2-btn primary">
                חזרה לקורס
              </Link>
            </div>
          </motion.section>
        )}
      </main>
    </div>
  )
}
