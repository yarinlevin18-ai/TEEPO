'use client'

/**
 * Course detail page — v2 layout per teepo-design/mockup_course.html.
 *
 * Structure top → bottom:
 *   1. Breadcrumb (המוח · dept · semester · current course)
 *   2. Course hero — vertical color stripe + title + dept pill + actions
 *      + 4-up meta grid (lecturer / meeting time / meeting location / extensible)
 *   3. 4-pill stats strip (קבצים / מטלות פתוחות / ימים עד הבא / סיכומים)
 *   4. 2-column layout:
 *        - main column: tabs (קבצים / מטלות / סיכומים) + always-visible
 *          quick-add at the bottom that creates a StudyTask tagged to
 *          this course (suggestion chips just populate the input)
 *        - sticky sidebar: lecturer card + next class + syllabus +
 *          quick links (Moodle / Drive / portal)
 *
 * Per the "swap visuals, keep mechanics" rule: all data + handlers
 * are existing hooks (useDB/useCourse/useDriveFiles/useWeekCalendar/
 * useAuth) + the existing CourseLessonsActions / FolderSection
 * components — only the layout is new. The legacy "על הקורס" cards +
 * the bottom משימות-ומטלות grid are replaced by the tabs interface.
 *
 * NO FAKE DATA per spec §12: every visible field comes from real Drive DB
 * / Drive API / Google Calendar match, with explicit empty states when
 * a value is missing.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowRight, CheckCircle2, Check, X, Mail, Trash2,
  RefreshCw, Loader2, Plus, MapPin, Calendar as CalendarIcon,
  User as UserIcon, FileText, ExternalLink, Folder, Link as LinkIcon,
  BookOpen, ClipboardCheck, NotebookPen, Pencil, Clock, GraduationCap,
} from 'lucide-react'
import { useDB, useCourse } from '@/lib/db-context'
import { FolderSection } from '@/components/summaries/CourseDrivePanel'
import { useDriveFiles } from '@/lib/use-drive-files'
import { useAuth } from '@/lib/auth-context'
import { useWeekCalendar, type WeekCalendarSlot } from '@/lib/use-week-calendar'
import { matchCourseForEvent } from '@/lib/event-course-match'
import { groupFilesByLesson } from '@/lib/lesson-grouping'
import { ensureSubfolder } from '@/lib/drive-folders'
import { moveFile } from '@/lib/drive-files'
import { supabase } from '@/lib/supabase'
import { BACKEND_URL } from '@/lib/backend-url'
import type { Assignment, Course, CourseNote, StudyTask, TeachingAssistant } from '@/types'

// ──────────────────────────────────────────────────────────────────────
// Per-course color: deterministic from id, matches the palette used on
// /tasks and /summaries so a course renders the same color everywhere.
// ──────────────────────────────────────────────────────────────────────
const COURSE_PALETTE = [
  { color: '#8b5cf6', soft: '#ede9fe' }, // violet
  { color: '#d97706', soft: '#fef3c7' }, // amber
  { color: '#0d9488', soft: '#ccfbf1' }, // teal
  { color: '#e11d48', soft: '#fee2e2' }, // rose
  { color: '#6366f1', soft: '#e0e7ff' }, // indigo
  { color: '#16a34a', soft: '#dcfce7' }, // accent
] as const

function paletteIdx(key: string): number {
  let h = 0
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0
  return Math.abs(h) % COURSE_PALETTE.length
}

const HEB_DAYS_SHORT = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת']
const HEB_DAYS_SHORTER = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש']

function pad2(n: number): string {
  return n.toString().padStart(2, '0')
}

/** Find the next future Google Calendar slot matched to this course.
 *  Returns `null` if no matching slot is found in the visible week. */
function findNextClass(slots: WeekCalendarSlot[], courses: Course[], course: Course): WeekCalendarSlot | null {
  const matches = slots.filter(s => {
    const m = matchCourseForEvent(s.title, courses)
    return m?.id === course.id
  })
  if (matches.length === 0) return null
  const now = new Date()
  const todayDow = now.getDay()
  const nowMin = now.getHours() * 60 + now.getMinutes()
  // Sort by "how soon from now" — assumes weekly recurring schedule
  // mapped onto the current week. (slot.dayIndex relative to current
  // week's Sunday.)
  const sorted = matches
    .map(s => {
      // Distance in minutes from now to slot, treating the slot as the
      // upcoming occurrence of that dayIndex+hour:minute.
      let dayDelta = (s.dayIndex - todayDow + 7) % 7
      const slotMin = s.hour * 60 + s.minute
      if (dayDelta === 0 && slotMin <= nowMin) dayDelta = 7  // already past today → next week
      return { slot: s, distance: dayDelta * 24 * 60 + slotMin - nowMin }
    })
    .sort((a, b) => a.distance - b.distance)
  return sorted[0].slot
}

/** Find any slot today/this week matched to the course — used for the
 *  hero meta-grid "מועד" + "מקום" derivation. We take the FIRST match
 *  (earliest in the week) as the representative slot. */
function findCourseSchedule(slots: WeekCalendarSlot[], courses: Course[], course: Course): WeekCalendarSlot | null {
  const matches = slots
    .filter(s => {
      const m = matchCourseForEvent(s.title, courses)
      return m?.id === course.id
    })
    .sort((a, b) => (a.dayIndex - b.dayIndex) || ((a.hour * 60 + a.minute) - (b.hour * 60 + b.minute)))
  return matches[0] ?? null
}

/** Format a slot's day-of-week + time range — "יום ב' · 10:00-12:00". */
function formatScheduleTime(slot: WeekCalendarSlot): string {
  const day = HEB_DAYS_SHORT[slot.dayIndex]
  const start = `${pad2(slot.hour)}:${pad2(slot.minute)}`
  const endTotal = slot.hour * 60 + slot.minute + slot.durationMins
  const end = `${pad2(Math.floor(endTotal / 60) % 24)}:${pad2(endTotal % 60)}`
  return `יום ${day} · ${start}-${end}`
}

/** "בעוד 3 ימים · 10:00" or "מחר · 10:00" or "היום · 10:00". */
function formatNextClassRelative(slot: WeekCalendarSlot): { headline: string; sub: string } {
  const now = new Date()
  const todayDow = now.getDay()
  const nowMin = now.getHours() * 60 + now.getMinutes()
  const slotMin = slot.hour * 60 + slot.minute
  let dayDelta = (slot.dayIndex - todayDow + 7) % 7
  if (dayDelta === 0 && slotMin <= nowMin) dayDelta = 7
  const start = `${pad2(slot.hour)}:${pad2(slot.minute)}`
  let headline: string
  if (dayDelta === 0) headline = `היום · ${start}`
  else if (dayDelta === 1) headline = `מחר · ${start}`
  else headline = `בעוד ${dayDelta} ימים · ${start}`
  return { headline, sub: slot.meta || '' }
}

// Hebrew academic year → "תשפ״ה" etc. Limited cover — fine for the
// 2019..2030 window typical students live in.
const HEBREW_YEAR: Record<string, string> = {
  '2019': 'תש"פ', '2020': 'תשפ"א', '2021': 'תשפ"ב', '2022': 'תשפ"ג',
  '2023': 'תשפ"ד', '2024': 'תשפ"ה', '2025': 'תשפ"ו', '2026': 'תשפ"ז',
  '2027': 'תשפ"ח', '2028': 'תשפ"ט', '2029': 'תש"צ', '2030': 'תשצ"א',
}

function semesterLabel(course: Course): string {
  const sem = course.semester
    ? `סמסטר ${course.semester}'`.replace("'", "'")
    : ''
  const year = course.academic_year ? HEBREW_YEAR[course.academic_year] ?? course.academic_year : ''
  return [sem, year].filter(Boolean).join(' ')
}

// ──────────────────────────────────────────────────────────────────────

export default function CoursePage() {
  const params = useParams()
  const router = useRouter()
  const courseId = params.id as string

  const {
    db, ready, updateCourse, flushSave,
    createTask, updateTask, deleteTask,
    createAssignment, updateAssignment, deleteAssignment,
  } = useDB() as any
  const course = useCourse(courseId)
  const courses = useMemo<Course[]>(() => (db?.courses ?? []) as Course[], [db?.courses])
  const calendar = useWeekCalendar()

  // Transient notice slot for action results (sync/organize toasts).
  const [notice, setNotice] = useState<string | null>(null)
  useEffect(() => {
    if (!notice) return
    const id = setTimeout(() => setNotice(null), 4500)
    return () => clearTimeout(id)
  }, [notice])

  // Tab state — defaults to קבצים (mockup's default landing).
  type Tab = 'files' | 'tasks' | 'notes'
  const [tab, setTab] = useState<Tab>('files')

  // Per-course Moodle resync — pulls the global course list from the
  // backend (same endpoint /moodle's "סנכרן הכל" uses) and merges only
  // THIS course's fresh metadata into the local DB.
  const [syncing, setSyncing] = useState(false)
  const syncFromMoodle = async () => {
    if (!course || syncing) return
    setSyncing(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const headers: Record<string, string> = session?.access_token
        ? { Authorization: `Bearer ${session.access_token}` }
        : {}
      const res = await fetch(`${BACKEND_URL}/api/university/courses`, {
        headers,
        signal: AbortSignal.timeout(60_000),
      })
      if (!res.ok) throw new Error(`Backend ${res.status}`)
      const data = await res.json()
      if (data.status === 'error') throw new Error(data.message || 'הסנכרון נכשל')
      const scraped: any[] = data.courses || []
      const match = scraped.find((c: any) =>
        (course.source_url && c.url === course.source_url) ||
        c.title === course.title
      )
      if (!match) {
        setNotice('הקורס לא נמצא בסנכרון. אולי הוא הוסר מ-Moodle?')
        return
      }
      await updateCourse(course.id, {
        source: 'bgu',
        source_url: match.url || course.source_url,
        shortname: match.shortname,
        moodle_startdate: match.startdate || undefined,
        moodle_enddate: match.enddate || undefined,
        category_name: match.category_name,
        ...(match.lecturer_email !== undefined ? { lecturer_email: match.lecturer_email ?? undefined } : {}),
        ...(match.syllabus_url !== undefined ? { syllabus_url: match.syllabus_url ?? undefined } : {}),
        ...(match.teaching_assistants !== undefined ? { teaching_assistants: match.teaching_assistants } : {}),
        ...(match.course_links !== undefined ? { course_links: match.course_links } : {}),
        ...(match.portal_metadata !== undefined ? { portal_metadata: match.portal_metadata } : {}),
      })
      if (typeof flushSave === 'function') {
        try { await flushSave() } catch {}
      }
      setNotice('הקורס סונכרן בהצלחה מ-Moodle ✓')
    } catch (e: any) {
      if (e?.name === 'TimeoutError' || e?.name === 'AbortError') {
        setNotice('השרת לא הגיב — נסה שוב בעוד דקה')
      } else {
        console.warn('[course-sync]', e)
        setNotice('שגיאה בסנכרון: ' + (e?.message || 'נסה שוב'))
      }
    } finally {
      setSyncing(false)
    }
  }

  // Quick-add a StudyTask tagged to this course. The mockup's "הוסף
  // מטלה או משימה במהירות" footer maps to this single call.
  const [quickAddValue, setQuickAddValue] = useState('')
  const [quickAddBusy, setQuickAddBusy] = useState(false)
  const onQuickAdd = useCallback(async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    const title = quickAddValue.trim()
    if (!title || quickAddBusy || typeof createTask !== 'function') return
    setQuickAddBusy(true)
    setQuickAddValue('')  // optimistic clear
    try {
      await createTask({
        title,
        category: 'study',
        course_id: courseId,
        scheduled_date: new Date().toISOString().slice(0, 10),
      })
      setNotice('נוספה משימה לקורס ✓')
    } catch (err) {
      console.warn('[course-quick-add] failed', err)
      setNotice('שגיאה ביצירת המשימה')
    } finally {
      setQuickAddBusy(false)
    }
  }, [createTask, courseId, quickAddValue, quickAddBusy])

  // ── Derived data ───────────────────────────────────────────────────
  const filesCount = useDriveFiles(course?.drive_folder_ids?.course ?? null).files.length

  // All assignments scoped to this course — pending vs done split for the tab body.
  const courseAssignments = useMemo<Assignment[]>(() => {
    return ((db?.assignments ?? []) as Assignment[])
      .filter(a => a.course_id === courseId)
  }, [db?.assignments, courseId])
  const openAssignments = useMemo(() => {
    return courseAssignments
      .filter(a => a.status !== 'submitted' && a.status !== 'graded')
      .sort((a, b) => {
        // Sort by deadline ascending, undefined deadlines last.
        if (!a.deadline && !b.deadline) return 0
        if (!a.deadline) return 1
        if (!b.deadline) return -1
        return a.deadline.localeCompare(b.deadline)
      })
  }, [courseAssignments])
  const openAssignmentsCount = openAssignments.length

  // Personal study tasks scoped to this course — pending vs done split.
  const courseTasks = useMemo<StudyTask[]>(() => {
    return ((db?.tasks ?? []) as StudyTask[]).filter(t => t.course_id === courseId)
  }, [db?.tasks, courseId])
  const pendingTasks = useMemo(() => courseTasks.filter(t => !t.is_completed), [courseTasks])
  const doneTasks = useMemo(() => courseTasks.filter(t => t.is_completed), [courseTasks])

  const courseNotes = useMemo<CourseNote[]>(() => {
    return ((db?.notes ?? []) as CourseNote[]).filter(n => n.course_id === courseId)
  }, [db?.notes, courseId])

  const courseSchedule = useMemo(() => {
    if (!course) return null
    return findCourseSchedule(calendar.slots, courses, course)
  }, [calendar.slots, courses, course])

  const nextClass = useMemo(() => {
    if (!course) return null
    return findNextClass(calendar.slots, courses, course)
  }, [calendar.slots, courses, course])

  const daysUntilNext = useMemo(() => {
    if (!nextClass) return null
    const todayDow = new Date().getDay()
    let delta = (nextClass.dayIndex - todayDow + 7) % 7
    const nowMin = new Date().getHours() * 60 + new Date().getMinutes()
    const slotMin = nextClass.hour * 60 + nextClass.minute
    if (delta === 0 && slotMin <= nowMin) delta = 7
    return delta
  }, [nextClass])

  // ── Early returns ───────────────────────────────────────────────────
  if (!ready) {
    return <div className="course-v2-loading">טוען קורס…</div>
  }
  if (!course) {
    return (
      <div className="course-v2-missing">
        <p>הקורס לא נמצא.</p>
        <button onClick={() => router.push('/courses')}>חזרה לרשימת הקורסים</button>
      </div>
    )
  }

  const palette = COURSE_PALETTE[paletteIdx(course.id)]
  const driveUrl = course.drive_folder_ids?.course
    ? `https://drive.google.com/drive/folders/${course.drive_folder_ids.course}`
    : 'https://drive.google.com/drive/my-drive'

  return (
    <div
      className="course-v2"
      style={{
        ['--course-color' as any]: palette.color,
        ['--course-soft' as any]: palette.soft,
      }}
    >
      <main className="course-v2-main">

        {/* ===== BREADCRUMB ===== */}
        <nav className="course-v2-breadcrumb" aria-label="ניווט פירורים">
          <Link href="/summaries">המוח</Link>
          {course.category_name && (
            <>
              <span className="sep">·</span>
              <Link href="/courses">{course.category_name}</Link>
            </>
          )}
          {(course.semester || course.academic_year) && (
            <>
              <span className="sep">·</span>
              <span>{semesterLabel(course)}</span>
            </>
          )}
          <span className="sep">·</span>
          <span className="current">{course.title}</span>
        </nav>

        {/* ===== TRANSIENT NOTICE TOAST ===== */}
        <AnimatePresence>
          {notice && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="course-v2-notice"
            >
              <CheckCircle2 size={18} />
              <span className="flex-1">{notice}</span>
              <button onClick={() => setNotice(null)} aria-label="סגור"><X size={16} /></button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ===== COURSE HERO ===== */}
        <section className="course-v2-hero">
          <div className="course-v2-hero-top">
            <div>
              <h1>{course.title}</h1>
              <div className="course-v2-subtitle">
                {course.category_name && (
                  <span className="dept">{course.category_name}</span>
                )}
                {(course.semester || course.academic_year) && (
                  <>
                    <span>·</span>
                    <span>{semesterLabel(course)}</span>
                  </>
                )}
                {course.credits != null && (
                  <>
                    <span>·</span>
                    <span>{course.credits} נק"ז</span>
                  </>
                )}
                {/* Shortname moved here from the meta grid (its slot now shows ממוצע). */}
                {course.shortname && (
                  <>
                    <span>·</span>
                    <span dir="ltr">{course.shortname}</span>
                  </>
                )}
              </div>
            </div>
            <div className="course-v2-hero-actions">
              {course.source === 'bgu' && (
                <button
                  type="button"
                  onClick={syncFromMoodle}
                  disabled={syncing}
                  className="course-v2-btn"
                >
                  {syncing
                    ? <Loader2 size={14} className="course-v2-spin" />
                    : <RefreshCw size={14} />}
                  {syncing ? 'מסנכרן…' : 'סנכרן מ-Moodle'}
                </button>
              )}
              <a
                href={driveUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="course-v2-btn primary"
                title={course.drive_folder_ids?.course
                  ? 'פתח את תיקיית הקורס ב-Drive'
                  : 'פתח את Google Drive'}
              >
                <Plus size={14} />
                הוסף תוכן
              </a>
            </div>
          </div>

          {/* 4-up meta grid: lecturer · meeting time · location · 4th slot */}
          <div className="course-v2-meta">
            <MetaItem icon={<UserIcon size={16} />} label="מרצה">
              {course.lecturer_name
                ? <strong>{course.lecturer_name}</strong>
                : course.lecturer_email
                  ? <strong dir="ltr" className="course-v2-meta-email">{course.lecturer_email}</strong>
                  : <span className="course-v2-meta-empty">אין מרצה משויך</span>}
            </MetaItem>
            <MetaItem icon={<CalendarIcon size={16} />} label="מועד">
              {courseSchedule
                ? <strong>{formatScheduleTime(courseSchedule)}</strong>
                : <span className="course-v2-meta-empty">אין שעות בלוח</span>}
            </MetaItem>
            <MetaItem icon={<MapPin size={16} />} label="מקום">
              {/* Manual meeting_location wins over the calendar-derived value. */}
              <InlineEditableValue
                value={course.meeting_location}
                fallback={courseSchedule?.meta}
                emptyLabel="אין מיקום בלוח"
                placeholder='למשל "בניין 90 חדר 141"'
                editLabel="ערוך מיקום"
                onSave={(v) => updateCourse(course.id, { meeting_location: v || undefined })}
              />
            </MetaItem>
            <MetaItem icon={<GraduationCap size={16} />} label="ממוצע">
              {/* 0 is a valid average — parse, don't truthy-check. */}
              <InlineEditableValue
                value={course.course_average != null ? String(course.course_average) : undefined}
                emptyLabel="אין ממוצע"
                placeholder="0-100"
                editLabel="ערוך ממוצע"
                inputMode="decimal"
                onSave={(v) => {
                  const n = v === '' ? undefined : Number(v)
                  if (n !== undefined && (!Number.isFinite(n) || n < 0 || n > 100)) return
                  updateCourse(course.id, { course_average: n })
                }}
              />
            </MetaItem>
          </div>
        </section>

        {/* ===== STAT PILLS ===== */}
        <div className="course-v2-stats">
          <StatPill
            value={filesCount}
            label="קבצים"
            icon={<FileText size={17} />}
            tone="default"
          />
          <StatPill
            value={openAssignmentsCount}
            label="מטלות פתוחות"
            icon={<ClipboardCheck size={17} />}
            tone="amber"
          />
          <StatPill
            value={daysUntilNext ?? '—'}
            label="ימים עד הבא"
            icon={<CalendarIcon size={17} />}
            tone="indigo"
          />
          <StatPill
            value={courseNotes.length}
            label="סיכומים"
            icon={<NotebookPen size={17} />}
            tone="rose"
          />
        </div>

        {/* ===== 2-COLUMN LAYOUT ===== */}
        <div className="course-v2-layout">

          {/* MAIN COLUMN — tabs */}
          <div className="course-v2-main-col">

            <div className="course-v2-tabs" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'files'}
                className={`course-v2-tab ${tab === 'files' ? 'active' : ''}`}
                onClick={() => setTab('files')}
              >
                <Folder size={14} />
                קבצים <span className="course-v2-tab-count">{filesCount}</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'tasks'}
                className={`course-v2-tab ${tab === 'tasks' ? 'active' : ''}`}
                onClick={() => setTab('tasks')}
              >
                <ClipboardCheck size={14} />
                מטלות <span className="course-v2-tab-count">{openAssignmentsCount}</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'notes'}
                className={`course-v2-tab ${tab === 'notes' ? 'active' : ''}`}
                onClick={() => setTab('notes')}
              >
                <NotebookPen size={14} />
                סיכומים <span className="course-v2-tab-count">{courseNotes.length}</span>
              </button>
            </div>

            {/* PANEL: FILES — Drive folder shelf (3 folders) + organize action */}
            {tab === 'files' && (
              <div className="course-v2-panel">
                {course.drive_folder_ids?.course ? (
                  <>
                    {course.drive_folder_ids?.lessons && (
                      <CourseLessonsActions
                        lessonsFolderId={course.drive_folder_ids.lessons}
                        onResult={setNotice}
                      />
                    )}
                    <div className="course-v2-folders">
                      <FolderSection
                        label="שיעורים"
                        hint="הרצאות, תרגולים, מצגות"
                        folderId={course.drive_folder_ids.lessons ?? null}
                      />
                      <FolderSection
                        label="מטלות"
                        hint="תרגילים, פרויקטים, בחנים"
                        folderId={course.drive_folder_ids.assignments ?? null}
                      />
                      <FolderSection
                        label="סיכומים"
                        hint="הסיכומים האישיים שלך"
                        folderId={course.drive_folder_ids.notes ?? null}
                      />
                    </div>
                  </>
                ) : (
                  <div className="course-v2-empty">
                    <p>תיקיות הקורס עדיין לא נוצרו ב-Drive.</p>
                    <Link href="/summaries" className="course-v2-empty-cta">
                      לחץ ליצירת התיקיות בעמוד המוח <ArrowRight size={14} />
                    </Link>
                  </div>
                )}
              </div>
            )}

            {/* PANEL: TASKS — cream-styled inline lists matching mockup.
                Mockup shows "מטלות פתוחות (N)" + quick-add + chips + a
                "synced from Moodle" footnote. We expand on it by showing
                the actual lists (assignments + personal tasks) inline so
                the user can act without bouncing to /assignments. The
                Moodle sync footnote and the /assignments link are kept. */}
            {tab === 'tasks' && (
              <div className="course-v2-panel">
                {/* Assignments (academic) */}
                <section className="course-v2-card">
                  <h2 className="course-v2-card-title">
                    <span className="h2-icon"><ClipboardCheck size={14} /></span>
                    מטלות פתוחות ({openAssignmentsCount})
                  </h2>

                  <AssignmentsQuickAdd
                    busy={false}
                    onAdd={async (title) => {
                      if (typeof createAssignment !== 'function') return
                      try {
                        await createAssignment({
                          title,
                          course_id: courseId,
                          priority: 'medium',
                        })
                        setNotice('נוספה מטלה לקורס ✓')
                      } catch (err) {
                        console.warn('[course-assignment-add] failed', err)
                        setNotice('שגיאה ביצירת המטלה')
                      }
                    }}
                  />

                  {courseAssignments.length === 0 ? (
                    <div className="course-v2-empty" style={{ marginTop: 12 }}>
                      <p>אין עדיין מטלות לקורס.</p>
                      <span className="course-v2-empty-hint">
                        סנכרן מ-Moodle או הוסף מטלה חדשה למעלה.
                      </span>
                    </div>
                  ) : (
                    <div className="course-v2-rows" role="list">
                      {openAssignments.map(a => (
                        <AssignmentRow
                          key={a.id}
                          a={a}
                          onUpdate={updateAssignment}
                          onDelete={deleteAssignment}
                        />
                      ))}
                    </div>
                  )}

                  <div className="course-v2-card-foot">
                    <Link href="/assignments" className="course-v2-foot-link">
                      פתח את כל המטלות בעמוד המטלות <ArrowRight size={12} />
                    </Link>
                  </div>
                </section>

                {/* Personal study tasks (todos scoped to this course) */}
                <section className="course-v2-card" style={{ marginTop: 14 }}>
                  <h2 className="course-v2-card-title">
                    <span className="h2-icon"><Check size={14} /></span>
                    משימות ({pendingTasks.length})
                  </h2>

                  {courseTasks.length === 0 ? (
                    <div className="course-v2-empty">
                      <p>אין עדיין משימות אישיות לקורס.</p>
                      <span className="course-v2-empty-hint">
                        השתמש בהוסף מהיר למטה כדי להוסיף משימה ראשונה.
                      </span>
                    </div>
                  ) : (
                    <div className="course-v2-rows" role="list">
                      {pendingTasks.map(t => (
                        <StudyTaskRow
                          key={t.id}
                          task={t}
                          onToggle={updateTask}
                          onDelete={deleteTask}
                        />
                      ))}
                      {doneTasks.length > 0 && (
                        <details className="course-v2-done-group">
                          <summary>הושלמו ({doneTasks.length})</summary>
                          {doneTasks.map(t => (
                            <StudyTaskRow
                              key={t.id}
                              task={t}
                              onToggle={updateTask}
                              onDelete={deleteTask}
                            />
                          ))}
                        </details>
                      )}
                    </div>
                  )}
                </section>
              </div>
            )}

            {/* PANEL: NOTES — list from db.notes filtered by course_id */}
            {tab === 'notes' && (
              <div className="course-v2-panel">
                {courseNotes.length === 0 ? (
                  <div className="course-v2-empty">
                    <p>אין עדיין סיכומים לקורס.</p>
                    <span className="course-v2-empty-hint">
                      העלה PDF/Word לתיקיית "סיכומים" ב-Drive או צור סיכום חדש מהלוח של הקורס.
                    </span>
                  </div>
                ) : (
                  <div className="course-v2-notes">
                    {courseNotes.map(n => (
                      <div key={n.id} className="course-v2-note-card">
                        <div className="course-v2-note-head">
                          <NotebookPen size={14} />
                          <strong>{n.title || 'ללא כותרת'}</strong>
                        </div>
                        {n.content && (
                          <p className="course-v2-note-body">
                            {n.content.slice(0, 240)}{n.content.length > 240 ? '…' : ''}
                          </p>
                        )}
                        {n.created_at && (
                          <small className="course-v2-note-meta">
                            נוצר: {new Date(n.created_at).toLocaleDateString('he-IL')}
                          </small>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ALWAYS-VISIBLE QUICK ADD at the bottom of the main column */}
            <section className="course-v2-card">
              <h2 className="course-v2-card-title">
                <span className="h2-icon"><Plus size={14} /></span>
                הוסף משימה במהירות
              </h2>
              <div className="course-v2-chips">
                {['שיעורי בית', 'קריאה', 'פרזנטציה', 'חזרה למבחן', 'פרויקט'].map(label => (
                  <button
                    key={label}
                    type="button"
                    className="course-v2-chip"
                    onClick={() => setQuickAddValue(label)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <form className="course-v2-quick-add" onSubmit={onQuickAdd}>
                <input
                  type="text"
                  value={quickAddValue}
                  onChange={(e) => setQuickAddValue(e.target.value)}
                  placeholder="מה אתה צריך לעשות לקורס הזה? (Enter להוספה)"
                  maxLength={200}
                  disabled={quickAddBusy}
                />
                <button
                  type="submit"
                  className="course-v2-qa-btn"
                  aria-label="הוסף משימה"
                  disabled={!quickAddValue.trim() || quickAddBusy}
                >
                  {quickAddBusy ? <Loader2 size={13} className="course-v2-spin" /> : <Plus size={13} />}
                </button>
              </form>
            </section>

          </div>

          {/* SIDE COLUMN — sticky cards */}
          <aside className="course-v2-side-col">

            {/* Lecturer */}
            <LecturerSidebar
              name={course.lecturer_name}
              email={course.lecturer_email}
              dept={course.category_name}
              palette={palette}
              officeHours={course.lecturer_office_hours}
              onSaveOfficeHours={(v) => updateCourse(course.id, { lecturer_office_hours: v || undefined })}
            />

            {/* Next class */}
            <div className="course-v2-side-card">
              <h3>השיעור הבא</h3>
              {nextClass ? (
                <NextClassPanel slot={nextClass} />
              ) : (
                <p className="course-v2-side-empty">אין שיעור קרוב בלוח</p>
              )}
            </div>

            {/* Syllabus */}
            <div className="course-v2-side-card">
              <h3>סילבוס</h3>
              {course.syllabus_url ? (
                <a
                  href={course.syllabus_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="course-v2-syllabus-link"
                >
                  <FileText size={16} />
                  <span style={{ flex: 1 }}>פתח סילבוס</span>
                  <ExternalLink size={14} />
                </a>
              ) : (
                <p className="course-v2-side-empty">אין סילבוס משויך</p>
              )}
            </div>

            {/* TAs — list with mail/office-hours */}
            {course.teaching_assistants && course.teaching_assistants.length > 0 && (
              <div className="course-v2-side-card">
                <h3>מתרגלים</h3>
                <ul className="course-v2-tas">
                  {course.teaching_assistants.map((ta, i) => (
                    <TaListItem key={i} ta={ta} />
                  ))}
                </ul>
              </div>
            )}

            {/* Quick links */}
            <div className="course-v2-side-card">
              <h3>קישורים מהירים</h3>
              <div className="course-v2-links">
                {course.source_url && (
                  <a href={course.source_url} target="_blank" rel="noopener noreferrer">
                    <BookOpen size={13} /> Moodle של הקורס
                  </a>
                )}
                {course.drive_folder_ids?.course && (
                  <a href={driveUrl} target="_blank" rel="noopener noreferrer">
                    <Folder size={13} /> תיקיית Drive
                  </a>
                )}
                {course.course_links?.map((link, i) => (
                  <a key={i} href={link.url} target="_blank" rel="noopener noreferrer">
                    <LinkIcon size={13} /> {link.label}
                  </a>
                ))}
                {!course.source_url && !course.drive_folder_ids?.course && (!course.course_links || course.course_links.length === 0) && (
                  <p className="course-v2-side-empty">אין קישורים</p>
                )}
              </div>
            </div>

          </aside>

        </div>
      </main>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────
// Leaf components
// ──────────────────────────────────────────────────────────────────────

/**
 * Tiny click-to-edit value used for the schema-gap fields (meeting_location,
 * course_average, lecturer_office_hours). Display mode shows the manual
 * `value` (or read-only `fallback`, or an empty-state CTA); edit mode is a
 * small input with Check/X buttons. Saving calls `onSave` — persistence goes
 * through updateCourse's optimistic mutate, so the UI updates instantly.
 */
function InlineEditableValue({
  value, fallback, emptyLabel, placeholder, editLabel, inputMode, onSave,
}: {
  value?: string
  /** Read-only derived value shown when no manual value is set (e.g. calendar location). */
  fallback?: string
  emptyLabel: string
  placeholder: string
  editLabel: string
  inputMode?: 'decimal'
  onSave: (value: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')

  const startEdit = () => {
    setDraft(value ?? '')
    setEditing(true)
  }
  const commit = () => {
    onSave(draft.trim())
    setEditing(false)
  }

  if (editing) {
    return (
      <span className="course-v2-inline-edit">
        <input
          type="text"
          value={draft}
          inputMode={inputMode}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); commit() }
            if (e.key === 'Escape') setEditing(false)
          }}
          placeholder={placeholder}
          maxLength={120}
          autoFocus
        />
        <button type="button" onClick={commit} aria-label="שמור"><Check size={13} /></button>
        <button type="button" onClick={() => setEditing(false)} aria-label="בטל"><X size={13} /></button>
      </span>
    )
  }

  if (value) {
    return (
      <span className="course-v2-inline-edit">
        <strong>{value}</strong>
        <button type="button" onClick={startEdit} aria-label={editLabel} title={editLabel}>
          <Pencil size={11} />
        </button>
      </span>
    )
  }
  if (fallback) {
    return (
      <span className="course-v2-inline-edit">
        <strong>{fallback}</strong>
        <button type="button" onClick={startEdit} aria-label={editLabel} title={editLabel}>
          <Pencil size={11} />
        </button>
      </span>
    )
  }
  return (
    <button type="button" className="course-v2-meta-empty course-v2-inline-add" onClick={startEdit}>
      {emptyLabel}
    </button>
  )
}

function MetaItem({
  icon, label, children,
}: {
  icon: React.ReactNode
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="course-v2-meta-item">
      <div className="course-v2-meta-icon">{icon}</div>
      <div>
        <span className="course-v2-meta-label">{label}</span>
        <span className="course-v2-meta-value">{children}</span>
      </div>
    </div>
  )
}

function StatPill({
  value, label, icon, tone,
}: {
  value: number | string
  label: string
  icon: React.ReactNode
  tone: 'default' | 'amber' | 'indigo' | 'rose'
}) {
  return (
    <div className={`course-v2-stat-pill ${tone}`}>
      <div className="course-v2-stat-icon">{icon}</div>
      <div className="course-v2-stat-meta">
        <span className="course-v2-stat-num">{value}</span>
        <span className="course-v2-stat-label">{label}</span>
      </div>
    </div>
  )
}

function NextClassPanel({ slot }: { slot: WeekCalendarSlot }) {
  const dayShort = HEB_DAYS_SHORTER[slot.dayIndex]
  const now = new Date()
  // Compute the date number for the next occurrence of this dayIndex.
  const todayDow = now.getDay()
  let delta = (slot.dayIndex - todayDow + 7) % 7
  const nowMin = now.getHours() * 60 + now.getMinutes()
  const slotMin = slot.hour * 60 + slot.minute
  if (delta === 0 && slotMin <= nowMin) delta = 7
  const target = new Date(now)
  target.setDate(now.getDate() + delta)
  const dateNum = target.getDate()
  const { headline, sub } = formatNextClassRelative(slot)
  return (
    <div className="course-v2-next-class">
      <div className="course-v2-nc-day">
        <div className="ncd-day">{dayShort}</div>
        <div className="ncd-date">{dateNum}</div>
      </div>
      <div className="course-v2-nc-info">
        <strong>{headline}</strong>
        {sub && <small>{sub}</small>}
      </div>
    </div>
  )
}

function LecturerSidebar({
  name, email, dept, palette, officeHours, onSaveOfficeHours,
}: {
  name?: string
  email?: string
  dept?: string
  palette: { color: string; soft: string }
  officeHours?: string
  onSaveOfficeHours?: (value: string) => void
}) {
  const display = name || email
  if (!display) {
    return (
      <div className="course-v2-side-card">
        <h3>מרצה</h3>
        <p className="course-v2-side-empty">אין פרטי מרצה. סנכרן מ-Moodle לשליפה אוטומטית.</p>
      </div>
    )
  }
  // Initials: prefer the name's first two parts; fall back to email prefix.
  const initials = (() => {
    if (name) {
      const parts = name.trim().split(/\s+/).slice(0, 2)
      return parts.map(p => p[0]).join('')
    }
    if (email) return email[0].toUpperCase()
    return '?'
  })()
  return (
    <div className="course-v2-side-card">
      <h3>מרצה</h3>
      <div className="course-v2-lecturer">
        <div className="av" style={{ background: palette.color }}>{initials}</div>
        <div>
          <div className="lname">{name || email}</div>
          {dept && <div className="lrole">{dept}</div>}
        </div>
      </div>
      {email && (
        <div className="course-v2-lecturer-actions">
          <a href={`mailto:${email}`} className="course-v2-btn">
            <Mail size={13} /> מייל
          </a>
        </div>
      )}
      {onSaveOfficeHours && (
        <div className="ta-office-hours course-v2-office-hours">
          <Clock size={12} />
          <InlineEditableValue
            value={officeHours}
            emptyLabel="+ הוסף שעות קבלה"
            placeholder='למשל "יום ג׳ 14:00-16:00, בניין 37 חדר 204"'
            editLabel="ערוך שעות קבלה"
            onSave={onSaveOfficeHours}
          />
        </div>
      )}
    </div>
  )
}

function TaListItem({ ta }: { ta: TeachingAssistant }) {
  return (
    <li>
      <div className="ta-name">
        {ta.name}
        {ta.role && <span className="ta-role"> · {ta.role}</span>}
      </div>
      {ta.email && (
        <a href={`mailto:${ta.email}`} className="ta-mail" dir="ltr">
          <Mail size={11} />
          <span>{ta.email}</span>
        </a>
      )}
      {ta.office_hours && (
        <div className="ta-office-hours">{ta.office_hours}</div>
      )}
    </li>
  )
}

// ──────────────────────────────────────────────────────────────────────
// Preserved verbatim — organize-by-lesson action, kept identical to v1.
// Only the wrapping CSS class names changed; the algorithm is the same.
// ──────────────────────────────────────────────────────────────────────

function CourseLessonsActions({
  lessonsFolderId,
  onResult,
}: {
  lessonsFolderId: string
  onResult: (msg: string) => void
}) {
  const { files } = useDriveFiles(lessonsFolderId)
  const { googleToken, refreshGoogleToken } = useAuth()
  const [busy, setBusy] = useState(false)

  const { groups } = groupFilesByLesson(files)
  const totalFiles = groups.reduce((n, g) => n + g.files.length, 0)
  const canOrganize = groups.length > 0 && !busy

  const organize = async () => {
    if (!canOrganize) return
    setBusy(true)
    try {
      const tok = googleToken || (await refreshGoogleToken())
      if (!tok) {
        onResult('לא ניתן להתחבר ל-Drive')
        return
      }
      let failures = 0
      for (const g of groups) {
        try {
          const subId = await ensureSubfolder(tok, g.folderName, lessonsFolderId)
          for (const f of g.files) {
            try { await moveFile(tok, f.id, subId, lessonsFolderId) }
            catch { failures++ }
          }
        } catch { failures += g.files.length }
      }
      if (failures > 0) onResult(`סודרו עם ${failures} כשלים`)
      else onResult(`סודר! ${groups.length} תיקיות שיעורים נוצרו (${totalFiles} קבצים).`)
    } catch (e: any) {
      onResult('שגיאה בארגון: ' + (e?.message || 'נסה שוב'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="course-v2-organize">
      <button
        type="button"
        onClick={organize}
        disabled={!canOrganize}
        className="course-v2-btn"
        title={
          groups.length === 0
            ? 'אין קבצי שיעור עם תאריכים מזוהים (Week N / שיעור N) — העלה קבצים תחילה'
            : `ארגן ${totalFiles} קבצים ב-${groups.length} תיקיות לפי שבוע`
        }
      >
        {busy
          ? <Loader2 size={14} className="course-v2-spin" />
          : <Folder size={14} />}
        {busy ? 'מסדר…' : groups.length > 0 ? `ארגן לפי שיעור (${groups.length})` : 'ארגן לפי שיעור'}
      </button>
      <span className="course-v2-organize-hint">
        קבצים בעלי שם "Week N" / "שיעור N" יקובצו לתת-תיקיות.
      </span>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────
// Tasks-tab leaf components: cream-themed inline rows + quick-add. These
// replace the legacy `TasksMini` / `AssignmentsMini` widgets (which
// shipped with dark-theme `glass` styling). All call-sites of useDB
// stay the same — only the markup changes.
// ──────────────────────────────────────────────────────────────────────

function AssignmentsQuickAdd({
  busy,
  onAdd,
}: {
  busy: boolean
  onAdd: (title: string) => Promise<void>
}) {
  const [value, setValue] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const submit = useCallback(async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    const title = value.trim()
    if (!title || submitting || busy) return
    setSubmitting(true)
    setValue('')
    try { await onAdd(title) }
    catch { /* surfaced via the page-level toast */ }
    finally { setSubmitting(false) }
  }, [value, busy, submitting, onAdd])

  return (
    <>
      <form className="course-v2-quick-add" onSubmit={submit}>
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder='הוסף מטלה — למשל "תרגיל 3 — סיכום פרק 4"'
          maxLength={200}
          disabled={submitting}
        />
        <button
          type="submit"
          className="course-v2-qa-btn"
          aria-label="הוסף מטלה"
          disabled={!value.trim() || submitting}
        >
          {submitting ? <Loader2 size={13} className="course-v2-spin" /> : <Plus size={13} />}
        </button>
      </form>
      <div className="course-v2-chips" style={{ marginTop: 10 }}>
        {['תרגיל', 'מבחן', 'פרויקט', 'חזרה', 'קריאה'].map(label => (
          <button
            key={label}
            type="button"
            className="course-v2-chip"
            onClick={() => setValue(label)}
          >
            {label}
          </button>
        ))}
      </div>
    </>
  )
}

function AssignmentRow({
  a, onUpdate, onDelete,
}: {
  a: Assignment
  onUpdate: (id: string, patch: Partial<Assignment>) => Promise<void>
  onDelete: (id: string) => Promise<void>
}) {
  const priorityChip = a.priority === 'high'
    ? { color: '#9f1239', bg: '#fee2e2', label: 'דחוף' }
    : a.priority === 'low'
      ? { color: '#15803d', bg: '#dcfce7', label: 'רגיל' }
      : { color: '#b45309', bg: '#fef3c7', label: 'בינוני' }
  return (
    <div className="course-v2-row" role="listitem">
      <span
        className="course-v2-row-prio"
        style={{ background: priorityChip.bg, color: priorityChip.color }}
        title={`עדיפות: ${priorityChip.label}`}
      >
        {priorityChip.label}
      </span>
      <span className="course-v2-row-title">{a.title}</span>
      {a.deadline && (
        <span className="course-v2-row-due">
          <CalendarIcon size={11} /> {a.deadline.slice(5)}
        </span>
      )}
      <select
        value={a.status}
        onChange={(e) => onUpdate(a.id, { status: e.target.value as Assignment['status'] })}
        className="course-v2-row-status"
        aria-label="סטטוס המטלה"
      >
        <option value="todo">לא התחיל</option>
        <option value="in_progress">בתהליך</option>
        <option value="submitted">הוגש</option>
        <option value="graded">נבדק</option>
      </select>
      <button
        type="button"
        onClick={() => onDelete(a.id)}
        className="course-v2-row-del"
        aria-label="מחק מטלה"
      >
        <Trash2 size={12} />
      </button>
    </div>
  )
}

function StudyTaskRow({
  task, onToggle, onDelete,
}: {
  task: StudyTask
  onToggle: (id: string, patch: Partial<StudyTask>) => Promise<void>
  onDelete: (id: string) => Promise<void>
}) {
  return (
    <div className={`course-v2-row ${task.is_completed ? 'done' : ''}`} role="listitem">
      <button
        type="button"
        className="course-v2-row-check"
        aria-label={task.is_completed ? 'בטל סימון כהושלם' : 'סמן כהושלם'}
        aria-pressed={task.is_completed}
        onClick={() => onToggle(task.id, { is_completed: !task.is_completed })}
      >
        {task.is_completed && <Check size={11} />}
      </button>
      <span className="course-v2-row-title">{task.title}</span>
      {task.scheduled_date && (
        <span className="course-v2-row-due">
          <CalendarIcon size={11} /> {task.scheduled_date.slice(5)}
        </span>
      )}
      <button
        type="button"
        onClick={() => onDelete(task.id)}
        className="course-v2-row-del"
        aria-label="מחק משימה"
      >
        <Trash2 size={12} />
      </button>
    </div>
  )
}
