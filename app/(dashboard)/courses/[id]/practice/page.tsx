'use client'

/**
 * Practice page — retrieval-practice quizzes for one course.
 *
 * Flow (Phosphor-style, see docs/REBUILD_PLAN.md):
 *   1. setup — pick source files from the course's Drive folders (and/or
 *      paste text) + quiz length, or retake a previously generated quiz.
 *   2. QuizRunner (components/practice) — answer → grade → feedback → summary.
 *
 * Quizzes + attempts persist to the Drive db.json via useDB.
 */

import { useCallback, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { motion } from 'framer-motion'
import {
  Check, ClipboardCheck, FileText, Loader2, Presentation, RotateCcw, Sparkles, Trash2,
} from 'lucide-react'
import { useDB, useCourse, usePracticeQuizzes } from '@/lib/db-context'
import { useDriveFiles } from '@/lib/use-drive-files'
import type { DriveFile } from '@/lib/drive-files'
import { GeneratedQuizSchema } from '@/lib/practice/schemas'
import { useQuizApi } from '@/lib/practice/use-quiz-api'
import QuizRunner from '@/components/practice/QuizRunner'
import type { PracticeQuiz } from '@/types'

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
const MIN_PASTE_CHARS = 40

const LENGTH_OPTIONS = [
  { count: 3, label: 'קצר', hint: '3 שאלות' },
  { count: 5, label: 'רגיל', hint: '5 שאלות' },
  { count: 8, label: 'מעמיק', hint: '8 שאלות' },
] as const

export default function PracticePage() {
  const params = useParams<{ id: string }>()
  const courseId = params?.id
  const course = useCourse(courseId)
  const {
    ready, loading, createPracticeQuiz, deletePracticeQuiz, savePracticeAttempt, flushSave, db,
  } = useDB()
  const quizzes = usePracticeQuizzes(courseId)
  const authedPost = useQuizApi()

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

  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [pasted, setPasted] = useState('')
  const [questionCount, setQuestionCount] = useState<number>(5)
  const [generating, setGenerating] = useState(false)
  const [setupError, setSetupError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  const [quiz, setQuiz] = useState<PracticeQuiz | null>(null)
  const [runKey, setRunKey] = useState(0)

  const palette = COURSE_PALETTE[paletteIdx(courseId ?? '')]
  const hasMaterial = selected.size > 0 || pasted.trim().length >= MIN_PASTE_CHARS

  const generate = useCallback(async () => {
    if (!course || !hasMaterial) return
    setGenerating(true)
    setSetupError(null)
    try {
      const files = allFiles
        .filter(f => selected.has(f.id))
        .map(f => ({ id: f.id, name: f.name, mimeType: f.mimeType }))
      const res = await authedPost('/api/quiz/generate', {
        files,
        text: pasted.trim().length >= MIN_PASTE_CHARS ? pasted.trim() : undefined,
        courseName: course.title,
        questionCount,
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
      setQuiz(saved)
      setRunKey(k => k + 1)
    } catch (e) {
      setSetupError(e instanceof Error ? e.message : 'יצירת הבוחן נכשלה — נסה שוב')
    } finally {
      setGenerating(false)
    }
  }, [course, hasMaterial, selected, pasted, questionCount, allFiles, authedPost, createPracticeQuiz])

  // ── Guards ──────────────────────────────────────────────────────────
  if (!ready && loading) {
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
          <div className="flex justify-center gap-2">
            <Link href="/courses" className="course-v2-btn inline-flex">חזרה לקורסים</Link>
            <Link href="/practice" className="course-v2-btn primary inline-flex">תרגול חופשי</Link>
          </div>
        </div>
      </main></div>
    )
  }

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

        {quiz ? (
          <QuizRunner
            key={`${quiz.id}-${runKey}`}
            quiz={quiz}
            accent={palette}
            onSaveAttempt={async attempt => {
              await savePracticeAttempt(attempt)
              void flushSave().catch(() => {})
            }}
            onNewQuiz={() => { setQuiz(null); setSelected(new Set()); setPasted('') }}
            exitHref={`/courses/${course.id}`}
            exitLabel="חזרה לקורס"
          />
        ) : (
          <motion.section initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
            <div className="mb-8">
              <h1 className="text-3xl font-extrabold tracking-tight">תרגול</h1>
              <p className="mt-2 max-w-xl text-[15px] text-neutral-600">
                בחר חומר מהקורס — שיעור, סיכום או תרגיל — ונבנה ממנו בוחן עם שאלות
                פתוחות. כל תשובה נבדקת מול מחוון, עם משוב על מה שהיה מדויק ומה שחסר.
              </p>
            </div>

            <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
              {/* Material: Drive files + pasted text */}
              <div className="space-y-4">
                <div className="rounded-2xl border border-black/8 bg-[#fdf6e3] p-5 shadow-sm">
                  <h2 className="mb-1 font-bold">החומר לבוחן</h2>
                  <p className="mb-4 text-sm text-neutral-500">
                    עד {MAX_FILES} קבצים — PDF, Google Docs או מצגות. שבוע אחד של חומר עובד הכי טוב.
                  </p>

                  {allFiles.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-black/15 p-6 text-center text-sm text-neutral-500">
                      {course.drive_folder_ids?.course
                        ? 'אין עדיין קבצים בתיקיות הקורס — אפשר להדביק חומר כטקסט למטה.'
                        : 'לקורס עוד אין תיקיות Drive — אפשר להדביק חומר כטקסט למטה.'}
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

                <div className="rounded-2xl border border-black/8 bg-[#fdf6e3] p-5 shadow-sm">
                  <h2 className="mb-1 font-bold">או הדבק חומר כטקסט</h2>
                  <p className="mb-3 text-sm text-neutral-500">
                    סיכום, קטע מהרצאה, או כל טקסט שתרצה לתרגל עליו.
                  </p>
                  <textarea
                    value={pasted}
                    onChange={e => setPasted(e.target.value)}
                    rows={5}
                    placeholder="הדבק כאן את החומר…"
                    className="w-full resize-y rounded-xl border border-black/10 bg-white/70 p-3 text-sm leading-relaxed outline-none transition focus:border-[var(--course-color)] focus:bg-white"
                  />
                  {pasted.trim().length > 0 && pasted.trim().length < MIN_PASTE_CHARS && (
                    <p className="mt-1 text-xs text-neutral-400">
                      עוד קצת — צריך לפחות {MIN_PASTE_CHARS} תווים כדי לבנות שאלות
                    </p>
                  )}
                </div>
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
                  disabled={generating || !hasMaterial}
                  className="course-v2-btn primary justify-center py-3 text-base"
                >
                  {generating
                    ? <><Loader2 size={16} className="course-v2-spin" /> בונה בוחן מהחומר…</>
                    : <><Sparkles size={16} /> צור בוחן</>}
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
                          onClick={() => { setQuiz(pq); setRunKey(k => k + 1) }}
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
      </main>
    </div>
  )
}
