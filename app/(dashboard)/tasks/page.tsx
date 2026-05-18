'use client'

/**
 * /tasks (המטלות שלי) — academic-assignment surface.
 *
 * Source mockup: teepo-design/mockup_tasks_v2.html. Layout:
 *   - Page head: title + summary pills (דחוף / פתוחות / קבוצתיות) + "מטלה חדשה" add CTA
 *   - Tab strip: הכל · לפי תאריך · לפי קורס
 *   - Tab "הכל": flat list, sorted by deadline ascending
 *   - Tab "לפי תאריך": 3 buckets — השבוע (≤7d) · השבוע הבא (8-14d) · בהמשך (15d+ or undated)
 *   - Tab "לפי קורס": one section per course, only courses with open assignments
 *
 * Data: db.assignments (Assignment type). The topnav has been routing
 * `/tasks` → "מטלות" → assignment counts for a while; this page replaces
 * the legacy personal-task kanban that lived here. Personal tasks moved
 * to /todos.
 *
 * Course colors are deterministic per course.id (rotating palette) so the
 * same course always renders the same color across renders + tabs.
 *
 * Card click opens the assignment expand state on /assignments (the
 * detailed view with breakdown + status transitions). "פתח בדרייב" deep-
 * links straight to the course's מטלות Drive folder if the user has one
 * (otherwise we fall back to opening Drive root).
 */

import { useMemo, useState } from 'react'
import Link from 'next/link'
import {
  Plus, ListChecks, Calendar as CalendarIcon, Library,
  Clock, User, Users, FolderOpen, X, Loader2,
} from 'lucide-react'
import { useDB } from '@/lib/db-context'
import type { Assignment, Course } from '@/types'

// ──────────────────────────────────────────────────────────────────────
// Palette: same rotation we use on /summaries chips, so the visual
// language stays consistent across the two pages.
// ──────────────────────────────────────────────────────────────────────
const COURSE_PALETTE: Array<{ color: string; soft: string; emoji: string }> = [
  // emoji per-palette mirrors mockup_tasks_v2.html (📘 / 📕 / 📗 / 📙) —
  // shown as the section icon on the "לפי קורס" tab so adjacent course
  // groups read as visually distinct even without the color stripe.
  { color: '#d97706', soft: '#fef3c7', emoji: '📘' },
  { color: '#8b5cf6', soft: '#ede9fe', emoji: '📕' },
  { color: '#0d9488', soft: '#ccfbf1', emoji: '📗' },
  { color: '#e11d48', soft: '#fee2e2', emoji: '📙' },
  { color: '#6366f1', soft: '#e0e7ff', emoji: '📘' },
  { color: '#16a34a', soft: '#dcfce7', emoji: '📗' },
]

/** Deterministic palette index from any string (course.id or "uncategorized"). */
function paletteIdx(key: string): number {
  let h = 0
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0
  return Math.abs(h) % COURSE_PALETTE.length
}

// ──────────────────────────────────────────────────────────────────────
// Date helpers (no date-fns dependency — keep this page light).
// ──────────────────────────────────────────────────────────────────────

const HEB_MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר']
const HEB_DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת']

function daysUntil(deadline?: string): number | null {
  if (!deadline) return null
  const d = new Date(deadline)
  if (Number.isNaN(d.getTime())) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  d.setHours(0, 0, 0, 0)
  return Math.round((d.getTime() - today.getTime()) / 86_400_000)
}

/** Human-friendly relative due label: "מחר 09:00" / "שישי · 23:59" / "17 במאי". */
function formatDue(deadline?: string): { label: string; tone: 'urgent' | 'soon' | 'normal' | 'undated' } {
  if (!deadline) return { label: 'ללא תאריך', tone: 'undated' }
  const d = new Date(deadline)
  if (Number.isNaN(d.getTime())) return { label: 'ללא תאריך', tone: 'undated' }
  const now = new Date()
  const dn = daysUntil(deadline)!
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  const hasTime = !(d.getHours() === 0 && d.getMinutes() === 0)
  const timeStr = hasTime ? `${hh}:${mm}` : ''

  if (dn < 0) return { label: `איחור · ${Math.abs(dn)} ימים`, tone: 'urgent' }
  if (dn === 0) return { label: hasTime ? `היום · ${timeStr}` : 'היום', tone: 'urgent' }
  if (dn === 1) return { label: hasTime ? `מחר · ${timeStr}` : 'מחר', tone: 'urgent' }
  if (dn <= 6) {
    const dayName = HEB_DAYS[d.getDay()]
    return { label: hasTime ? `${dayName} · ${timeStr}` : dayName, tone: 'soon' }
  }
  // > 6 days: show date in "DD בMMM" form, e.g. "17 במאי"
  return { label: `${d.getDate()} ב${HEB_MONTHS[d.getMonth()]}`, tone: 'normal' }
}

const PRIORITY_META: Record<Assignment['priority'], { label: string; cls: string }> = {
  high:   { label: 'דחוף',  cls: 'high' },
  medium: { label: 'רגיל',  cls: 'med'  },
  low:    { label: 'נמוכה', cls: 'low'  },
}

// ──────────────────────────────────────────────────────────────────────

type Tab = 'all' | 'deadline' | 'course'

export default function TasksPage() {
  const { db, ready, createAssignment } = useDB()
  const [tab, setTab] = useState<Tab>('all')
  const [addOpen, setAddOpen] = useState(false)

  const courses = useMemo<Course[]>(() => (db?.courses ?? []) as Course[], [db?.courses])
  const courseById = useMemo(() => {
    const m = new Map<string, Course>()
    for (const c of courses) m.set(c.id, c)
    return m
  }, [courses])

  // Only "open" assignments — submitted/graded are out of scope for this surface.
  const open = useMemo<Assignment[]>(() => {
    const all = (db?.assignments ?? []) as Assignment[]
    return all.filter(a => a.status !== 'submitted' && a.status !== 'graded')
  }, [db?.assignments])

  // Sort all assignments by deadline asc (undated last).
  const sortedAll = useMemo(() => {
    return [...open].sort((a, b) => {
      const da = daysUntil(a.deadline) ?? Infinity
      const db_ = daysUntil(b.deadline) ?? Infinity
      return da - db_
    })
  }, [open])

  // Summary pills for the header.
  const urgentCount = useMemo(
    () => open.filter(a => a.priority === 'high' || (daysUntil(a.deadline) !== null && daysUntil(a.deadline)! <= 1)).length,
    [open],
  )

  // "By deadline" buckets.
  const byDeadline = useMemo(() => {
    const week: Assignment[] = []
    const nextWeek: Assignment[] = []
    const later: Assignment[] = []
    for (const a of sortedAll) {
      const d = daysUntil(a.deadline)
      if (d === null) { later.push(a); continue }
      if (d <= 7) week.push(a)
      else if (d <= 14) nextWeek.push(a)
      else later.push(a)
    }
    return { week, nextWeek, later }
  }, [sortedAll])

  // "By course" — courses with at least one open assignment, alphabetical.
  const byCourse = useMemo(() => {
    const map = new Map<string, Assignment[]>()
    for (const a of sortedAll) {
      const key = a.course_id ?? 'uncategorized'
      const arr = map.get(key) ?? []
      arr.push(a)
      map.set(key, arr)
    }
    const rows = Array.from(map.entries()).map(([id, list]) => ({
      id,
      course: id === 'uncategorized' ? null : courseById.get(id) ?? null,
      list,
    }))
    rows.sort((a, b) => (a.course?.title ?? 'ללא קורס').localeCompare(b.course?.title ?? 'ללא קורס'))
    return rows
  }, [sortedAll, courseById])

  if (!ready) {
    return (
      <div className="cream-page tasks-v2">
        <main className="t-main">
          <div className="t-skel" aria-busy="true" />
        </main>
      </div>
    )
  }

  return (
    <div className="cream-page tasks-v2">
      <main className="t-main">

        {/* ===== PAGE HEAD ===== */}
        <header className="t-page-head">
          <div className="t-title-block">
            <h1>המטלות שלי</h1>
            <div className="t-summary">
              {urgentCount > 0 && (
                <span className="t-pill urgent">דחוף · <span className="num">{urgentCount}</span></span>
              )}
              <span className="t-pill">פתוחות · <span className="num">{open.length}</span></span>
            </div>
          </div>
          <button type="button" className="t-add-btn" onClick={() => setAddOpen(true)}>
            <Plus size={16} />
            מטלה חדשה
          </button>
        </header>

        {/* ===== TABS ===== */}
        <div className="t-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'all'}
            className={`t-tab ${tab === 'all' ? 'active' : ''}`}
            onClick={() => setTab('all')}
          >
            <ListChecks size={14} />
            הכל <span className="t-tab-count">{open.length}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'deadline'}
            className={`t-tab ${tab === 'deadline' ? 'active' : ''}`}
            onClick={() => setTab('deadline')}
          >
            <CalendarIcon size={14} />
            לפי תאריך
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'course'}
            className={`t-tab ${tab === 'course' ? 'active' : ''}`}
            onClick={() => setTab('course')}
          >
            <Library size={14} />
            לפי קורס
          </button>
        </div>

        {/* ===== TAB PANELS ===== */}
        {tab === 'all' && (
          <div className="t-panel">
            {sortedAll.length === 0 ? (
              <EmptyState />
            ) : (
              <div className="t-list">
                {sortedAll.map(a => <TaskCard key={a.id} assignment={a} course={a.course_id ? courseById.get(a.course_id) ?? null : null} />)}
              </div>
            )}
          </div>
        )}

        {tab === 'deadline' && (
          <div className="t-panel">
            {sortedAll.length === 0 ? (
              <EmptyState />
            ) : (
              <>
                <DeadlineSection
                  title="השבוע"
                  emoji="🔥"
                  modifier="urgent"
                  items={byDeadline.week}
                  courseById={courseById}
                />
                <DeadlineSection
                  title="השבוע הבא"
                  emoji="📅"
                  modifier="week"
                  items={byDeadline.nextWeek}
                  courseById={courseById}
                />
                <DeadlineSection
                  title="בהמשך"
                  emoji="💭"
                  modifier="later"
                  items={byDeadline.later}
                  courseById={courseById}
                />
              </>
            )}
          </div>
        )}

        {tab === 'course' && (
          <div className="t-panel">
            {byCourse.length === 0 ? (
              <EmptyState />
            ) : (
              byCourse.map(row => (
                <CourseSection
                  key={row.id}
                  course={row.course}
                  list={row.list}
                  courseById={courseById}
                />
              ))
            )}
          </div>
        )}

      </main>

      {addOpen && (
        <NewAssignmentModal
          courses={courses}
          onClose={() => setAddOpen(false)}
          onCreate={async (data) => {
            await createAssignment(data)
            setAddOpen(false)
          }}
        />
      )}
    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────

function DeadlineSection({
  title, emoji, modifier, items, courseById,
}: {
  title: string
  emoji: string
  modifier: 'urgent' | 'week' | 'later'
  items: Assignment[]
  courseById: Map<string, Course>
}) {
  if (items.length === 0) return null
  return (
    <section className={`t-section ${modifier}`}>
      <div className="t-sec-head">
        <span className="t-sec-icon" aria-hidden>{emoji}</span>
        <span className="t-sec-label">{title}</span>
        <span className="t-sec-count">{items.length} {items.length === 1 ? 'מטלה' : 'מטלות'}</span>
      </div>
      <div className="t-list">
        {items.map(a => (
          <TaskCard
            key={a.id}
            assignment={a}
            course={a.course_id ? courseById.get(a.course_id) ?? null : null}
          />
        ))}
      </div>
    </section>
  )
}

function CourseSection({
  course, list, courseById,
}: {
  course: Course | null
  list: Assignment[]
  courseById: Map<string, Course>
}) {
  const id = course?.id ?? 'uncategorized'
  const p = COURSE_PALETTE[paletteIdx(id)]
  return (
    <section className="t-section">
      <div className="t-sec-head">
        <span className="t-sec-icon" style={{ color: p.color }} aria-hidden>{p.emoji}</span>
        <span className="t-sec-label">{course?.title ?? 'ללא קורס'}</span>
        <span className="t-sec-count">{list.length} פתוחות</span>
      </div>
      <div className="t-list">
        {list.map(a => (
          <TaskCard
            key={a.id}
            assignment={a}
            course={a.course_id ? courseById.get(a.course_id) ?? null : null}
          />
        ))}
      </div>
    </section>
  )
}

function TaskCard({ assignment, course }: { assignment: Assignment; course: Course | null }) {
  const due = formatDue(assignment.deadline)
  const paletteKey = course?.id ?? 'uncategorized'
  const p = COURSE_PALETTE[paletteIdx(paletteKey)]
  const priority = PRIORITY_META[assignment.priority]
  const driveAssignmentsId = (course?.drive_folder_ids as any)?.assignments as string | undefined
  const driveHref = driveAssignmentsId
    ? `https://drive.google.com/drive/folders/${driveAssignmentsId}`
    : 'https://drive.google.com/drive/my-drive'

  return (
    <Link
      href={`/assignments?focus=${encodeURIComponent(assignment.id)}`}
      className="t-card"
      style={{ ['--course-color' as any]: p.color, ['--course-soft' as any]: p.soft }}
    >
      <span className="t-course-badge">
        <span className="t-dot" />
        {course?.title ?? 'ללא קורס'}
      </span>
      <div className="t-card-body">
        <div className="t-card-title">{assignment.title}</div>
        <div className="t-card-meta">
          <span className={`t-meta-item due ${due.tone}`}>
            <Clock size={12} />
            {due.label}
          </span>
          {/* Solo/group hint isn't in the Assignment shape yet — show a
              neutral "יחיד" label so the row reads complete. */}
          <span className="t-meta-item solo">
            <User size={12} />
            יחיד
          </span>
        </div>
      </div>
      <div className="t-card-right">
        <span className={`t-priority ${priority.cls}`}>{priority.label}</span>
        <a
          href={driveHref}
          target="_blank"
          rel="noopener noreferrer"
          className="t-drive-btn"
          onClick={(e) => e.stopPropagation()}
          title={driveAssignmentsId
            ? 'פתח את תיקיית המטלות של הקורס ב-Drive'
            : 'פתח את Google Drive'}
        >
          <FolderOpen size={12} />
          פתח בדרייב
        </a>
      </div>
    </Link>
  )
}

function EmptyState() {
  return (
    <div className="t-empty">
      <span className="em" aria-hidden>📭</span>
      אין מטלות פתוחות כרגע. כל הכבוד! 🎉
    </div>
  )
}

// ── New-assignment modal ───────────────────────────────────────────────

function NewAssignmentModal({
  courses, onClose, onCreate,
}: {
  courses: Course[]
  onClose: () => void
  onCreate: (data: Partial<Assignment> & { title: string }) => Promise<void>
}) {
  const [title, setTitle] = useState('')
  const [courseId, setCourseId] = useState('')
  const [deadline, setDeadline] = useState('')
  const [priority, setPriority] = useState<Assignment['priority']>('medium')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canSave = title.trim().length > 0 && !busy

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSave) return
    setBusy(true)
    setError(null)
    try {
      await onCreate({
        title: title.trim(),
        course_id: courseId || undefined,
        deadline: deadline || undefined,
        priority,
        status: 'todo',
      })
    } catch (err) {
      setError((err as Error)?.message ?? 'שגיאה ביצירת המטלה')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="t-modal-overlay"
      role="dialog"
      aria-modal="true"
      onClick={(e) => { if (e.target === e.currentTarget && !busy) onClose() }}
    >
      <form className="t-modal" dir="rtl" onSubmit={submit}>
        <header className="t-modal-head">
          <h3>מטלה חדשה</h3>
          <button
            type="button"
            className="t-modal-close"
            onClick={onClose}
            disabled={busy}
            aria-label="סגור"
          >
            <X size={16} />
          </button>
        </header>

        <div className="t-modal-body">
          <label className="t-field">
            <span>כותרת *</span>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder='לדוגמה: תרגיל 4 — מטריצות הפיכות'
              autoFocus
              required
            />
          </label>

          <label className="t-field">
            <span>קורס</span>
            <select value={courseId} onChange={(e) => setCourseId(e.target.value)}>
              <option value="">ללא קורס</option>
              {courses.map(c => (
                <option key={c.id} value={c.id}>{c.title}</option>
              ))}
            </select>
          </label>

          <div className="t-field-row">
            <label className="t-field">
              <span>דדליין</span>
              <input
                type="datetime-local"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
              />
            </label>
            <label className="t-field">
              <span>עדיפות</span>
              <select value={priority} onChange={(e) => setPriority(e.target.value as Assignment['priority'])}>
                <option value="low">נמוכה</option>
                <option value="medium">רגילה</option>
                <option value="high">דחופה</option>
              </select>
            </label>
          </div>

          {error && <div className="t-modal-error">{error}</div>}
        </div>

        <footer className="t-modal-foot">
          <button type="button" onClick={onClose} disabled={busy}>ביטול</button>
          <button type="submit" className="primary" disabled={!canSave}>
            {busy ? <><Loader2 size={14} className="spin" /> שומר…</> : 'צור מטלה'}
          </button>
        </footer>
      </form>
    </div>
  )
}
