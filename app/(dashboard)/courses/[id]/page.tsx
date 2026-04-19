'use client'

/**
 * Course page — hi-fi implementation of design_handoff_course_page/design_kit.html.
 *
 * Layout (top → bottom):
 *  1. Course switcher pills (horizontal scroll) — real user courses
 *  2. Compact hero card — breadcrumb, code, title+tag, description, meta row,
 *     3 action buttons, progress bar with milestones
 *  3. Grid 1.6fr/1fr: Tasks card (tabs) + Lecturer card
 *  4. Grid 1.6fr/1fr: Lectures & reading + AI notebook card (purple-tinted)
 *  5. Full-width: Syllabus (description + numbered topics grid)
 *  6. Full-width: Weekly schedule (5 days, time-slot events)
 *
 * Per the handoff README: take layout/tokens/shadows exactly as specified;
 * treat all text as placeholder and wire real data where available. Where
 * the data model doesn't yet hold a field (lecturer contact, schedule
 * times, exam date, AI telemetry), show "—" rather than fake numbers.
 */

import './course.css'

import { useState, useMemo, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Calendar, MapPin, User, Clock, Plus, Upload, Star,
  Mail, FileText, Play, Search, Send,
  Brain, ArrowLeft, Check,
} from 'lucide-react'

import { useDB, useCourse, useCourses, useLessons } from '@/lib/db-context'
import ErrorAlert from '@/components/ui/ErrorAlert'
import type { Lesson, StudyTask, Assignment } from '@/types'

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Split a Hebrew/English title so the LAST word renders in gradient. */
function splitTitleForGradient(title: string): { head: string; tail: string } {
  const trimmed = (title || '').trim()
  if (!trimmed) return { head: '', tail: '' }
  const idx = trimmed.lastIndexOf(' ')
  if (idx < 0) return { head: '', tail: trimmed }
  return { head: trimmed.slice(0, idx), tail: trimmed.slice(idx + 1) }
}

/** Build a Latin tag from the course shortname (e.g. "201-1-1721-24" → "PHYS 101"-ish noop).
 *  Falls back to the shortname itself (first two segments) if we can't classify. */
function latinTagFromShortname(shortname?: string): string | null {
  if (!shortname) return null
  const parts = shortname.split('-')
  if (parts.length < 2) return shortname.toUpperCase()
  return `${parts[0]}-${parts[1]}`.toUpperCase()
}

/** Semester label with course's semester + academic year. */
function semesterHebrew(semester?: 'א' | 'ב' | 'קיץ'): string {
  if (!semester) return '—'
  return `סמסטר ${semester}`
}

/** "X days / weeks" style Hebrew distance phrase from now to deadline. */
function daysUntil(isoOrEpoch?: string | number): number | null {
  if (!isoOrEpoch) return null
  const t = typeof isoOrEpoch === 'string' ? Date.parse(isoOrEpoch) : isoOrEpoch * 1000
  if (!Number.isFinite(t)) return null
  return Math.ceil((t - Date.now()) / (1000 * 60 * 60 * 24))
}

function hebrewDue(days: number | null): { label: string; cls: '' | 'soon' | 'far' } {
  if (days === null) return { label: '—', cls: 'far' }
  if (days < 0) return { label: `איחור ${-days}י׳`, cls: '' }
  if (days === 0) return { label: 'היום', cls: '' }
  if (days === 1) return { label: 'מחר', cls: '' }
  if (days <= 3) return { label: `${days} ימים`, cls: '' }
  if (days <= 14) return { label: `${days} ימים`, cls: 'soon' }
  return { label: `${days} י׳`, cls: 'far' }
}

/** Start-of-week (Sunday) at 00:00 for the given date. */
function startOfWeekSun(d: Date): Date {
  const out = new Date(d)
  out.setHours(0, 0, 0, 0)
  out.setDate(out.getDate() - out.getDay())
  return out
}

const HEB_DAYS = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳']

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export default function CourseDetailPage() {
  const params = useParams()
  const router = useRouter()
  const courseId = params.id as string

  const { db, ready, loading, error: dbError, updateLesson } = useDB()
  const course = useCourse(courseId)
  const courses = useCourses()
  const lessons = useLessons(courseId)

  const courseTasks = useMemo<StudyTask[]>(
    () => db.tasks.filter(t => t.course_id === courseId),
    [db.tasks, courseId]
  )
  const courseAssignments = useMemo<Assignment[]>(
    () => db.assignments.filter(a => a.course_id === courseId),
    [db.assignments, courseId]
  )

  const [error, setError] = useState<string | null>(dbError || null)
  const [tasksTab, setTasksTab] = useState<'open' | 'done' | 'all'>('open')
  const [aiQuery, setAiQuery] = useState('')

  // ── Loading ──
  if (loading || !ready) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto space-y-6 animate-fade-in">
        <div className="h-8 w-64 shimmer rounded-lg" />
        <div className="h-32 shimmer rounded-2xl" />
        <div className="grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-4">
          <div className="h-64 shimmer rounded-2xl" />
          <div className="h-64 shimmer rounded-2xl" />
        </div>
      </div>
    )
  }

  if (!course) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto animate-fade-in">
        <ErrorAlert message={error || 'הקורס לא נמצא'} />
        <Link
          href="/courses"
          className="mt-4 inline-flex items-center gap-2 text-sm text-accent-400 hover:text-accent-300 transition-colors"
        >
          <ArrowLeft size={14} /> חזרה לקורסים
        </Link>
      </div>
    )
  }

  // ── Derived values ──
  const completedLessons = lessons.filter(l => l.is_completed).length
  const progressPct =
    lessons.length > 0
      ? Math.round((completedLessons / lessons.length) * 100)
      : course.progress_percentage || 0

  const { head, tail } = splitTitleForGradient(course.title)
  const latinTag = latinTagFromShortname(course.shortname)
  const courseCode = course.shortname || '—'

  const openTasks = courseTasks.filter(t => !t.is_completed)
  const doneTasks = courseTasks.filter(t => t.is_completed)
  const openAssignments = courseAssignments.filter(a => a.status !== 'submitted' && a.status !== 'graded')
  const doneAssignments = courseAssignments.filter(a => a.status === 'submitted' || a.status === 'graded')
  const totalOpen = openTasks.length + openAssignments.length
  const totalDone = doneTasks.length + doneAssignments.length

  const currentLesson = lessons.find(l => !l.is_completed) || null

  // ── Handlers ──
  const toggleLesson = async (lesson: Lesson) => {
    try {
      await updateLesson(lesson.id, { is_completed: !lesson.is_completed })
    } catch {
      setError('שגיאה בעדכון השיעור.')
    }
  }

  const submitAiQuery = useCallback(
    (q: string) => {
      const query = q.trim()
      if (!query) return
      // Route to the first lesson's notebook with the question pre-loaded via query string.
      // If no lessons yet, fall back to the standalone /notebooks index.
      if (currentLesson) {
        router.push(
          `/courses/${courseId}/lessons/${currentLesson.id}?q=${encodeURIComponent(query)}`
        )
      } else {
        router.push(`/notebooks?q=${encodeURIComponent(query)}`)
      }
    },
    [courseId, currentLesson, router]
  )

  // ── Render ──
  return (
    <div className="course-scope p-4 sm:p-6 lg:p-8 max-w-[1400px] mx-auto animate-fade-in">
      <ErrorAlert message={error} onDismiss={() => setError(null)} />

      {/* ── Course switcher ─────────────────────────────────────────── */}
      <div className="c-switcher" role="tablist" aria-label="החלף קורס">
        {courses.map(c => (
          <Link
            key={c.id}
            href={`/courses/${c.id}`}
            className={`c-switcher-pill${c.id === courseId ? ' on' : ''}`}
            aria-current={c.id === courseId ? 'page' : undefined}
          >
            {c.title}
            {c.shortname && <span className="code">{c.shortname}</span>}
          </Link>
        ))}
      </div>

      {/* ── Compact hero ────────────────────────────────────────────── */}
      <div className="c-hero">
        <div className="c-hero-top">
          <div className="c-hero-l">
            <div className="c-breadcrumb">
              <Link href="/courses">קורסים</Link>
              <span className="sep">/</span>
              <span>{semesterHebrew(course.semester)}</span>
              <span className="sep">/</span>
              <span style={{ color: '#B8A9FF' }}>{course.title}</span>
            </div>
            <span className="c-code">
              {courseCode}
            </span>
            <h1 className="c-title">
              {head ? <>{head} <em>{tail}</em></> : <em>{tail}</em>}
              {latinTag && <span className="tag">{latinTag}</span>}
            </h1>
            {course.description && <p className="c-sub">{course.description}</p>}
            <div className="c-meta-row">
              <div className="c-meta">
                <Calendar size={13} />
                <span>—</span>
              </div>
              <div className="c-meta">
                <MapPin size={13} />
                <span>—</span>
              </div>
              <div className="c-meta">
                <User size={13} />
                <span>—</span>
              </div>
              <div className="c-meta">
                <Clock size={13} />
                <span>{semesterHebrew(course.semester)}</span>
              </div>
            </div>
          </div>
          <div className="c-hero-r">
            <button
              type="button"
              className="c-action-btn primary"
              onClick={() => router.push('/assignments')}
            >
              <Plus size={13} />
              מטלה חדשה
            </button>
            <button
              type="button"
              className="c-action-btn"
              onClick={() => {
                if (currentLesson) router.push(`/courses/${courseId}/lessons/${currentLesson.id}`)
              }}
            >
              <Upload size={13} />
              העלה חומר
            </button>
            {course.source_url && (
              <a
                href={course.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="c-action-btn"
              >
                <Star size={13} />
                פתח ב-Moodle
              </a>
            )}
          </div>
        </div>

        <div className="c-progress">
          <div className="c-progress-head">
            <span>
              SEMESTER PROGRESS · {completedLessons} מתוך {lessons.length || '—'} שיעורים
            </span>
            <span className="pct">{progressPct}%</span>
          </div>
          <div className="c-progress-bar">
            <div className="f" style={{ width: `${progressPct}%` }} />
          </div>
          <div className="c-progress-milestones">
            <span>Start</span>
            <span>¼</span>
            <span className="cur">You</span>
            <span>¾</span>
            <span>End</span>
          </div>
        </div>
      </div>

      {/* ── Row 1: Tasks + Lecturer ─────────────────────────────────── */}
      <div className="c-grid">
        <div className="c-card c-tasks">
          <div className="c-sec-title">
            מטלות הקורס
            <span className="count">
              {totalOpen} פתוחות · {totalDone} הושלמו
            </span>
            <Link href="/assignments" className="more">
              הצג הכל ←
            </Link>
          </div>
          <div className="tabs">
            <button
              className={`tab${tasksTab === 'open' ? ' on' : ''}`}
              onClick={() => setTasksTab('open')}
            >
              פתוחות<span className="n">{totalOpen}</span>
            </button>
            <button
              className={`tab${tasksTab === 'done' ? ' on' : ''}`}
              onClick={() => setTasksTab('done')}
            >
              עברו<span className="n">{totalDone}</span>
            </button>
            <button
              className={`tab${tasksTab === 'all' ? ' on' : ''}`}
              onClick={() => setTasksTab('all')}
            >
              הכל<span className="n">{totalOpen + totalDone}</span>
            </button>
          </div>

          {(() => {
            const items = buildTaskList(
              tasksTab,
              openTasks,
              doneTasks,
              openAssignments,
              doneAssignments
            )
            if (items.length === 0) {
              return (
                <div className="py-6 text-center text-[13px] text-[#64748b]">
                  אין מטלות {tasksTab === 'done' ? 'שהושלמו' : 'פתוחות'} בקורס הזה כרגע.
                </div>
              )
            }
            return items.map(it => (
              <div key={it.key} className={`c-task${it.done ? ' done' : ''}`}>
                <div className={`tbox${it.done ? ' done' : ''}`}>
                  {it.done && <Check size={11} strokeWidth={3} />}
                </div>
                <div className="c-task-body">
                  <div className="c-task-name">{it.title}</div>
                  <div className="c-task-meta">
                    {it.priority === 'high' && <span className="pri-h">דחוף</span>}
                    {it.priority === 'medium' && <span className="pri-m">בינוני</span>}
                    {it.priority === 'low' && <span className="pri-l">נמוך</span>}
                    {it.metaLeft && <span>{it.metaLeft}</span>}
                    {it.metaRight && (
                      <>
                        <span className="sep"></span>
                        <span>{it.metaRight}</span>
                      </>
                    )}
                  </div>
                </div>
                {it.done ? (
                  <div className="c-task-grade">{it.gradeLabel || '✓'}</div>
                ) : (
                  <div className={`c-task-due ${it.dueClass}`}>{it.dueLabel}</div>
                )}
              </div>
            ))
          })()}
        </div>

        {/* Lecturer card — placeholders until we have the data model for this */}
        <div className="c-card c-prof">
          <div className="c-sec-title">מרצה הקורס</div>
          <div className="c-prof-top">
            <div className="c-prof-av">—</div>
            <div className="c-prof-info">
              <div className="c-prof-name">—</div>
              <div className="c-prof-role">Dept. · BGU</div>
            </div>
          </div>
          <div className="c-prof-contact">
            <div className="c-prof-row">
              <Mail size={14} />
              <span className="muted">—</span>
            </div>
            <div className="c-prof-row">
              <MapPin size={14} />
              <span>—</span>
            </div>
            <div className="c-prof-row">
              <Clock size={14} />
              <span>
                שעות קבלה: <b>—</b>
              </span>
            </div>
          </div>
          <div className="c-prof-hours">
            פרטי המרצה יופיעו כאן ברגע שנחבר את הקורס למערכת BGU.
            <br />
            <span style={{ color: '#64748b', fontSize: 11 }}>
              הודעות בקורס נשלחות דרך Moodle
            </span>
          </div>
          {course.source_url && (
            <div className="c-prof-actions">
              <a
                href={course.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="c-action-btn"
              >
                <Star size={12} />
                פתח ב-Moodle
              </a>
            </div>
          )}
        </div>
      </div>

      {/* ── Row 2: Lectures + AI notebook ───────────────────────────── */}
      <div className="c-grid">
        <div className="c-card">
          <div className="c-sec-title">
            הרצאות וחומרי קריאה
            <span className="count">
              {completedLessons} מתוך {lessons.length || '—'}
            </span>
            {/* Removed external "more" link — this card IS the list. */}
          </div>

          {lessons.length === 0 ? (
            <div className="py-6 text-center text-[13px] text-[#64748b]">
              עוד אין הרצאות לקורס הזה. הוסף שיעור כדי להתחיל.
            </div>
          ) : (
            lessons.map(lesson => {
              const isCurrent = currentLesson?.id === lesson.id
              const klass = lesson.is_completed ? 'done' : isCurrent ? 'current' : ''
              const hasSummary = !!(lesson.ai_summary || (lesson.content && lesson.content.trim()))
              const hasRecording = !!lesson.transcript
              const hasFiles = (lesson.files?.length || 0) > 0
              return (
                <Link
                  key={lesson.id}
                  href={`/courses/${courseId}/lessons/${lesson.id}`}
                  className={`c-lec${klass ? ` ${klass}` : ''}`}
                >
                  <div className="c-lec-num">
                    <div className="n">{String(lesson.order_index + 1).padStart(2, '0')}</div>
                    <div className="lab">{isCurrent ? 'Now' : 'Lec'}</div>
                  </div>
                  <div className="c-lec-body">
                    <div className="c-lec-title">{lesson.title}</div>
                    <div className="c-lec-meta">
                      {lesson.duration_minutes ? (
                        <span>{lesson.duration_minutes} דקות</span>
                      ) : null}
                      {hasSummary && <span className="pill sum">סיכום מוכן</span>}
                      {hasFiles && <span className="pill read">{lesson.files?.length} חומרים</span>}
                      {hasRecording && <span className="pill rec">הקלטה</span>}
                    </div>
                  </div>
                  <div
                    className="c-lec-actions"
                    onClick={e => {
                      // Only intercept clicks on the action icons, not the whole row
                      const target = e.target as HTMLElement
                      if (target.closest('.c-lec-ico')) e.preventDefault()
                    }}
                  >
                    <div
                      className="c-lec-ico"
                      title={lesson.is_completed ? 'סמן כלא הושלם' : 'סמן כהושלם'}
                      onClick={e => {
                        e.preventDefault()
                        toggleLesson(lesson)
                      }}
                    >
                      {lesson.is_completed ? <Check size={14} /> : <FileText size={14} />}
                    </div>
                    {hasRecording && (
                      <div className="c-lec-ico" title="הקלטה">
                        <Play size={14} />
                      </div>
                    )}
                  </div>
                </Link>
              )
            })
          )}
        </div>

        <div className="c-card c-ai">
          <div className="c-ai-head">
            <div className="c-ai-icon">
              <Brain size={20} />
            </div>
            <div>
              <div className="c-ai-title">מחברת AI · {course.title}</div>
              <div className="c-ai-subtitle">מכיר את כל חומר הקורס שלך</div>
            </div>
          </div>

          <div className="c-ai-stats">
            <div className="c-ai-stat">
              <div className="v">{lessons.length || '—'}</div>
              <div className="l">lectures</div>
            </div>
            <div className="c-ai-stat">
              <div className="v">
                {lessons.reduce((acc, l) => acc + (l.files?.length || 0), 0) || '—'}
              </div>
              <div className="l">sources</div>
            </div>
            <div className="c-ai-stat">
              <div className="v">
                {lessons.filter(l => l.ai_summary || l.content).length || '—'}
              </div>
              <div className="l">summaries</div>
            </div>
          </div>

          <form
            className="c-ai-input"
            onSubmit={e => {
              e.preventDefault()
              submitAiQuery(aiQuery)
            }}
          >
            <Search size={16} style={{ color: '#64748b', flexShrink: 0 }} />
            <input
              placeholder="שאל על חומר הקורס..."
              value={aiQuery}
              onChange={e => setAiQuery(e.target.value)}
            />
            <button type="submit" className="c-ai-send" aria-label="שלח">
              <Send size={14} style={{ transform: 'scaleX(-1)' }} />
            </button>
          </form>

          <div className="c-ai-suggestions">
            <button className="c-ai-chip" onClick={() => submitAiQuery('סכם את ההרצאה האחרונה')}>
              סכם את ההרצאה האחרונה
            </button>
            <button className="c-ai-chip" onClick={() => submitAiQuery('מה הנושאים המרכזיים בקורס?')}>
              נושאים מרכזיים
            </button>
            <button className="c-ai-chip" onClick={() => submitAiQuery('איזה חומר צריך לדעת לבחינה?')}>
              מה לבחינה?
            </button>
            <button className="c-ai-chip" onClick={() => submitAiQuery('יצירת שאלות חזרה על החומר')}>
              שאלות חזרה
            </button>
          </div>
        </div>
      </div>

      {/* ── Row 3: Syllabus (full width) ────────────────────────────── */}
      <div className="c-grid-full">
        <div className="c-card">
          <div className="c-sec-title">
            סילבוס הקורס
            <span className="count">
              {lessons.length} נושאים · {completedLessons} נלמדו
            </span>
          </div>
          <div className="c-syll">
            {course.description && <p>{course.description}</p>}
            {!course.description && (
              <p style={{ color: '#64748b' }}>
                תיאור הקורס עוד לא הוגדר — ניתן להוסיף דרך דף ההגדרות של הקורס.
              </p>
            )}
            {lessons.length > 0 && (
              <div className="c-syll-topics">
                {lessons.map(l => (
                  <div
                    key={l.id}
                    className={`c-syll-topic${l.is_completed ? ' done' : ''}`}
                  >
                    <span className="num">{String(l.order_index + 1).padStart(2, '0')}</span>
                    {l.title}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Row 4: Weekly schedule (full width) ─────────────────────── */}
      <WeeklySchedule
        courseId={courseId}
        tasks={courseTasks}
        assignments={courseAssignments}
      />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Task list builder — merges tasks + assignments and picks fields for display
// ─────────────────────────────────────────────────────────────────────────────

type TaskRow = {
  key: string
  title: string
  done: boolean
  priority: 'high' | 'medium' | 'low' | null
  metaLeft: string | null
  metaRight: string | null
  dueLabel: string
  dueClass: '' | 'soon' | 'far'
  gradeLabel: string | null
}

function buildTaskList(
  tab: 'open' | 'done' | 'all',
  openTasks: StudyTask[],
  doneTasks: StudyTask[],
  openAssignments: Assignment[],
  doneAssignments: Assignment[]
): TaskRow[] {
  const out: TaskRow[] = []

  const pushAssignment = (a: Assignment, done: boolean) => {
    const days = daysUntil(a.deadline)
    const due = hebrewDue(days)
    out.push({
      key: `a-${a.id}`,
      title: a.title,
      done,
      priority: a.priority,
      metaLeft: a.description ? a.description.slice(0, 60) : null,
      metaRight: null,
      dueLabel: due.label,
      dueClass: due.cls,
      gradeLabel: done ? '✓' : null,
    })
  }

  const pushTask = (t: StudyTask, done: boolean) => {
    const days = daysUntil(t.scheduled_date)
    const due = hebrewDue(days)
    out.push({
      key: `t-${t.id}`,
      title: t.title,
      done,
      priority: null,
      metaLeft: t.category === 'study' ? 'לימוד' : t.category === 'review' ? 'חזרה' : t.category === 'practice' ? 'תרגול' : 'פרויקט',
      metaRight: null,
      dueLabel: due.label,
      dueClass: due.cls,
      gradeLabel: done ? '✓' : null,
    })
  }

  if (tab === 'open' || tab === 'all') {
    openAssignments.forEach(a => pushAssignment(a, false))
    openTasks.forEach(t => pushTask(t, false))
  }
  if (tab === 'done' || tab === 'all') {
    doneAssignments.forEach(a => pushAssignment(a, true))
    doneTasks.forEach(t => pushTask(t, true))
  }

  return out
}

// ─────────────────────────────────────────────────────────────────────────────
// Weekly schedule — places assignments w/ deadlines this week into day columns
// ─────────────────────────────────────────────────────────────────────────────

function WeeklySchedule({
  tasks,
  assignments,
}: {
  courseId: string
  tasks: StudyTask[]
  assignments: Assignment[]
}) {
  const now = new Date()
  const weekStart = startOfWeekSun(now)
  // We show Sunday → Thursday (BGU teaching week); match the design which shows 5 day columns.
  const days: { date: Date; label: string; isToday: boolean }[] = []
  for (let i = 0; i < 5; i++) {
    const d = new Date(weekStart)
    d.setDate(weekStart.getDate() + i)
    days.push({
      date: d,
      label: `${HEB_DAYS[d.getDay()]} · ${d.getDate()}/${d.getMonth() + 1}`,
      isToday: sameDay(d, now),
    })
  }

  const rangeEnd = new Date(days[days.length - 1].date)
  rangeEnd.setHours(23, 59, 59, 999)

  // Events sourced from real data
  type Evt = { day: number; t: string; nm: string; loc: string; kind?: 'lab' | 'hof' }
  const events: Evt[] = []

  for (const a of assignments) {
    if (!a.deadline) continue
    const t = new Date(a.deadline)
    if (t < weekStart || t > rangeEnd) continue
    const dayIdx = days.findIndex(d => sameDay(d.date, t))
    if (dayIdx < 0) continue
    events.push({
      day: dayIdx,
      t: `${t.getHours().toString().padStart(2, '0')}:${t.getMinutes().toString().padStart(2, '0')}`,
      nm: a.title,
      loc: 'מטלה · מוגדר בקורס',
      kind: 'hof',
    })
  }

  for (const s of tasks) {
    if (!s.scheduled_date) continue
    const t = new Date(s.scheduled_date)
    if (t < weekStart || t > rangeEnd) continue
    const dayIdx = days.findIndex(d => sameDay(d.date, t))
    if (dayIdx < 0) continue
    events.push({
      day: dayIdx,
      t: s.time_slot || 'כל היום',
      nm: s.title,
      loc: s.category === 'practice' ? 'תרגול' : 'לימוד',
      kind: s.category === 'practice' ? 'lab' : undefined,
    })
  }

  const weekLabel = `${days[0].date.getDate()}/${days[0].date.getMonth() + 1} – ${days[4].date.getDate()}/${days[4].date.getMonth() + 1}`

  return (
    <div className="c-grid-full">
      <div className="c-card">
        <div className="c-sec-title">
          לוח שבועי<span className="count">{weekLabel}</span>
        </div>
        <div className="c-week">
          <div className="c-week-hr"></div>
          {days.map((d, i) => {
            const dayEvents = events.filter(e => e.day === i)
            return (
              <div
                key={i}
                className={`c-week-day${d.isToday ? ' today' : ''}`}
              >
                <div className="day-lab">{d.label}</div>
                {dayEvents.length === 0 ? null : (
                  dayEvents.map((evt, j) => (
                    <div
                      key={j}
                      className={`c-week-evt${evt.kind === 'lab' ? ' lab' : ''}${evt.kind === 'hof' ? ' hof' : ''}`}
                    >
                      <div className="t">{evt.t}</div>
                      <div className="nm">{evt.nm}</div>
                      <div className="loc">{evt.loc}</div>
                    </div>
                  ))
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}
