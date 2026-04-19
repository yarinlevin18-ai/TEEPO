'use client'

/**
 * Course page — shell that lists lessons and wraps them in CourseWorkspace.
 *
 * Clicking a lesson navigates to `/courses/[id]/lessons/[lessonId]` — the
 * "lesson notebook" — where all the heavy lifting (rich summary, AI
 * chat, files, per-lesson tasks) happens. This page stays intentionally
 * light: header, lesson list, and course-level side panels.
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
  BookOpen, ExternalLink, ArrowRight, CheckCircle2,
  Plus, X, StickyNote, ChevronLeft, FileUp, Sparkles,
  Trash2,
} from 'lucide-react'
import Link from 'next/link'
import { useDB, useCourse, useLessons } from '@/lib/db-context'
import { CourseWorkspace, TasksMini, AssignmentsMini } from '@/components/course/CourseTabs'
import CourseNotebookStack from '@/components/course/CourseNotebookStack'
import ErrorAlert from '@/components/ui/ErrorAlert'
import { semesterLabel } from '@/lib/semester-classifier'
import type { Lesson } from '@/types'

// ── Component ───────────────────────────────────────────────

export default function CourseDetailPage() {
  const params = useParams()
  const router = useRouter()
  const courseId = params.id as string

  const {
    ready, loading, error: dbError,
    createLesson: dbCreateLesson,
    deleteLesson: dbDeleteLesson,
    updateLesson: dbUpdateLesson,
  } = useDB()
  const course = useCourse(courseId)
  const lessons = useLessons(courseId)

  const [error, setError] = useState<string | null>(null)
  const [showNewLesson, setShowNewLesson] = useState(false)
  const [newLessonTitle, setNewLessonTitle] = useState('')
  const newLessonInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (dbError) setError(dbError)
  }, [dbError])

  // ── Create lesson ──
  const createLesson = useCallback(async () => {
    const title = newLessonTitle.trim()
    if (!title) return
    try {
      const created = await dbCreateLesson(courseId, { title })
      setNewLessonTitle('')
      setShowNewLesson(false)
      // Jump straight into the notebook for the new lesson
      router.push(`/courses/${courseId}/lessons/${created.id}`)
    } catch {
      setError('שגיאה ביצירת שיעור.')
    }
  }, [courseId, newLessonTitle, dbCreateLesson, router])

  const toggleLesson = useCallback(async (lesson: Lesson) => {
    try {
      await dbUpdateLesson(lesson.id, { is_completed: !lesson.is_completed })
    } catch {
      setError('שגיאה בעדכון השיעור.')
    }
  }, [dbUpdateLesson])

  const deleteLesson = useCallback(async (id: string) => {
    if (!confirm('למחוק את השיעור?')) return
    try {
      await dbDeleteLesson(id)
    } catch {
      setError('שגיאה במחיקת שיעור.')
    }
  }, [dbDeleteLesson])

  // ── Loading ──
  if (loading || !ready) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto space-y-6 animate-fade-in">
        <div className="h-8 w-64 shimmer rounded-lg" />
        <div className="h-4 w-48 shimmer rounded-lg" />
        <div className="space-y-3 mt-8">
          {[1, 2, 3].map(i => <div key={i} className="h-20 shimmer rounded-xl" />)}
        </div>
      </div>
    )
  }

  if (!course) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto animate-fade-in">
        <ErrorAlert message={error || 'הקורס לא נמצא'} />
        <Link href="/courses" className="mt-4 inline-flex items-center gap-2 text-sm text-accent-400 hover:text-accent-300 transition-colors">
          <ArrowRight size={14} /> חזרה לקורסים
        </Link>
      </div>
    )
  }

  const completedLessons = lessons.filter(l => l.is_completed).length
  const progress = lessons.length > 0
    ? Math.round((completedLessons / lessons.length) * 100)
    : 0

  const crumbClass = course.year_of_study || course.semester
    ? semesterLabel(course.year_of_study, course.semester)
    : null

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto space-y-5 animate-fade-in">
      <ErrorAlert message={error} onDismiss={() => setError(null)} />

      {/* ── Breadcrumb ── */}
      <div className="flex items-center gap-2 text-xs text-ink-muted flex-wrap">
        <Link href="/courses" className="inline-flex items-center gap-1.5 hover:text-ink transition-colors">
          <ChevronLeft size={14} /> חזרה לקורסים
        </Link>
        {crumbClass && (
          <>
            <span className="text-ink-subtle">·</span>
            <span>{crumbClass}</span>
          </>
        )}
      </div>

      {/* ── Course Header ── */}
      <div className="glass rounded-2xl p-5 sm:p-6">
        <div className="flex items-start gap-4">
          <div className="w-11 h-11 rounded-xl bg-indigo-500/15 flex items-center justify-center flex-shrink-0">
            <BookOpen size={22} className="text-indigo-400" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold text-ink">{course.title}</h1>
            {course.description && (
              <p className="text-sm text-ink-muted mt-1 line-clamp-2">{course.description}</p>
            )}
            <div className="flex items-center gap-3 mt-3 flex-wrap">
              <span className={`text-xs px-2.5 py-1 rounded-full ${
                course.source === 'bgu'
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                  : 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'
              }`}>
                {course.source === 'bgu' ? 'BGU Moodle' : course.source}
              </span>
              {course.source_url && (
                <a href={course.source_url} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs text-accent-400 hover:text-accent-300 transition-colors">
                  <ExternalLink size={12} /> פתח ב-Moodle
                </a>
              )}
              <span className="text-xs text-ink-muted">{lessons.length} שיעורים</span>
              <Link
                href={`/courses/${courseId}/preview`}
                className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-violet-500/15 text-violet-300 border border-violet-500/20 hover:bg-violet-500/25 transition-colors"
                title="תצוגה חדשה (ספייק) — מחברת כמרכז"
              >
                <Sparkles size={12} /> נסה תצוגה חדשה
              </Link>
            </div>
          </div>
        </div>

        {/* Progress */}
        {lessons.length > 0 && (
          <div className="mt-5">
            <div className="flex justify-between text-xs text-ink-muted mb-2">
              <span>התקדמות</span>
              <span>{completedLessons}/{lessons.length} ({progress}%)</span>
            </div>
            <div className="w-full h-2 rounded-full bg-white/5">
              <motion.div
                className="h-2 rounded-full"
                style={{ background: 'linear-gradient(90deg, #6366f1, #8b5cf6)' }}
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.6, ease: 'easeOut' }}
              />
            </div>
          </div>
        )}

        {/* Tasks + Assignments, embedded in the course header */}
        <div className="mt-5 pt-5 border-t border-white/5 grid gap-4 md:grid-cols-2">
          <TasksMini courseId={courseId} />
          <AssignmentsMini courseId={courseId} />
        </div>
      </div>

      {/* ── Workspace (Lessons + side panels) ── */}
      <CourseWorkspace
        courseId={courseId}
        courseTitle={course.title}
        lessonsSlot={
          <>
            {/* Header */}
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-ink flex items-center gap-2">
                <StickyNote size={16} className="text-indigo-400" />
                שיעורים
              </h2>
              <button
                onClick={() => { setShowNewLesson(true); setTimeout(() => newLessonInputRef.current?.focus(), 100) }}
                className="btn-gradient px-3.5 py-2 rounded-xl text-sm text-white font-medium flex items-center gap-1.5 shadow-lg shadow-indigo-500/20"
              >
                <Plus size={15} />
                שיעור חדש
              </button>
            </div>

            {/* New Lesson Input */}
            <AnimatePresence>
              {showNewLesson && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <div className="glass rounded-xl p-4 flex items-center gap-3">
                    <input
                      ref={newLessonInputRef}
                      type="text"
                      value={newLessonTitle}
                      onChange={e => setNewLessonTitle(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') createLesson()
                        if (e.key === 'Escape') setShowNewLesson(false)
                      }}
                      placeholder='שם השיעור, למשל "שיעור 1 — מבוא"'
                      className="input-dark flex-1 text-sm"
                    />
                    <button
                      onClick={createLesson}
                      disabled={!newLessonTitle.trim()}
                      className="btn-gradient px-4 py-2 rounded-lg text-sm text-white font-medium disabled:opacity-40"
                    >
                      הוסף
                    </button>
                    <button
                      onClick={() => { setShowNewLesson(false); setNewLessonTitle('') }}
                      className="p-2 text-ink-muted hover:text-ink transition-colors"
                    >
                      <X size={16} />
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* The chapters stack — unveil-style cascade */}
            <CourseNotebookStack
              courseId={courseId}
              lessons={lessons}
              onAddLesson={() => {
                setShowNewLesson(true)
                setTimeout(() => newLessonInputRef.current?.focus(), 100)
              }}
            />

            {/* Compact linear index — power-user fallback under the stack */}
            {lessons.length > 0 && (
              <details className="mt-1">
                <summary className="text-[11px] text-ink-subtle cursor-pointer hover:text-ink px-1 py-1">
                  רשימה קומפקטית ({lessons.length})
                </summary>
                <div className="space-y-1 mt-2">
                  {lessons.map((lesson, index) => (
                    <LessonCard
                      key={lesson.id}
                      lesson={lesson}
                      index={index}
                      courseId={courseId}
                      onToggleCompleted={() => toggleLesson(lesson)}
                      onDelete={() => deleteLesson(lesson.id)}
                    />
                  ))}
                </div>
              </details>
            )}
          </>
        }
      />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Lesson card — clickable row that navigates to the notebook
// ─────────────────────────────────────────────────────────────

function LessonCard({
  lesson, index, courseId, onToggleCompleted, onDelete,
}: {
  lesson: Lesson
  index: number
  courseId: string
  onToggleCompleted: () => void
  onDelete: () => void
}) {
  const files = lesson.files || []
  const hasContent = !!(lesson.content && lesson.content.replace(/<[^>]*>/g, '').trim())

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.03 }}
      whileHover={{ scale: 1.005 }}
      whileTap={{ scale: 0.995 }}
      className="glass rounded-xl overflow-hidden group"
    >
      <Link
        href={`/courses/${courseId}/lessons/${lesson.id}`}
        className="flex items-center gap-3 p-4 hover:bg-white/[0.03] transition-colors"
      >
        {/* Completion circle */}
        <span
          onClick={e => { e.preventDefault(); e.stopPropagation(); onToggleCompleted() }}
          className={`w-7 h-7 rounded-full text-xs flex items-center justify-center flex-shrink-0 font-medium cursor-pointer transition-all hover:scale-110 ${
            lesson.is_completed
              ? 'bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25'
              : 'bg-white/5 text-ink-muted hover:bg-indigo-500/15 hover:text-indigo-400'
          }`}
          title={lesson.is_completed ? 'סמן כלא הושלם' : 'סמן כהושלם'}
        >
          {lesson.is_completed ? <CheckCircle2 size={14} /> : index + 1}
        </span>

        {/* Title */}
        <span className={`text-sm flex-1 text-right font-medium truncate ${
          lesson.is_completed ? 'text-ink-muted line-through' : 'text-ink'
        }`}>
          {lesson.title}
        </span>

        {/* Badges */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {files.length > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 inline-flex items-center gap-1">
              <FileUp size={9} /> {files.length}
            </span>
          )}
          {hasContent && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400">
              סיכום
            </span>
          )}
          {lesson.ai_summary && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-violet-500/10 text-violet-400 inline-flex items-center gap-1">
              <Sparkles size={9} /> AI
            </span>
          )}
        </div>

        {/* Delete (hidden until hover) */}
        <button
          onClick={e => { e.preventDefault(); e.stopPropagation(); onDelete() }}
          className="p-1.5 rounded-lg text-ink-subtle hover:text-red-400 hover:bg-red-500/10 opacity-0 group-hover:opacity-100 transition-all flex-shrink-0"
          title="מחק שיעור"
        >
          <Trash2 size={11} />
        </button>

        <ChevronLeft
          size={14}
          className="text-ink-subtle group-hover:text-indigo-400 group-hover:-translate-x-0.5 transition-all flex-shrink-0"
        />
      </Link>
    </motion.div>
  )
}
