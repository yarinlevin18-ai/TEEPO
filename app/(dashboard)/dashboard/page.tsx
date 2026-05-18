'use client'

/**
 * Dashboard — v2 utility-focused layout per
 * teepo-design/mockup_dashboard_v2.html.
 *
 * Structure (top → bottom):
 *   1. Hero — LCD date pill + LCD time pill + h1 "שלום {name}, השבוע שלך {accent}."
 *   2. השיעורים של היום — auto-fit grid of class cards with
 *      .done / .live / .next state derived from the current time.
 *   3. Two widgets side-by-side:
 *        - המטלות שלי (read-only) — 3 most-urgent open assignments,
 *          each row links to /assignments?focus=<id>.
 *        - המשימות שלי (interactive) — quick-add + working checkbox +
 *          delete. Wired to useDB() createTask / updateTask / deleteTask.
 *   4. הלוז השבועי — section header + wrapper card around the
 *      existing <CalendarWeek> grid (preserved verbatim; the iframe in
 *      the mockup is a placeholder for whatever real calendar we ship).
 *
 * Per the "swap visuals, keep mechanics" rule: every data source +
 * handler below is an existing hook from db-context / use-week-calendar
 * / auth-context — only the UI shape is new.
 *
 * Removed from the v1 dashboard (per CLAUDE_CODE_HANDOFF.md §16-20):
 *   - SlidingPuzzle widget
 *   - CountryClock guessing game
 *   - Old 3-card bottom row ("היום בלוח" / "מטלות ועבודות" / "משימות")
 *   - Time-aware "now" hero card
 */

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { useDB } from '@/lib/db-context'
import { useWeekCalendar, type WeekCalendarSlot } from '@/lib/use-week-calendar'
import { matchCourseForEvent } from '@/lib/event-course-match'
import { resolveFirstName } from '@/lib/display-name'
import type { Course, Assignment, StudyTask } from '@/types'
import {
  Plus, Check, X, MapPin, Clock, User as UserIcon,
  ClipboardCheck, ListTodo,
} from 'lucide-react'
import LCDDisplay from '@/components/ui/LCDDisplay'

// Accent word at the end of the greeting cycles through this list every
// 30 minutes (a slow, deterministic rotation — same word for all clients
// within the same half-hour slot). The user can refresh and see the same
// word, then come back after lunch and find a new one. Every entry must
// be a single-word positive descriptor that ends the sentence cleanly
// ("השבוע שלך <word>.").
const ACCENT_WORDS = [
  'מאוזן',
  'ממוקד',
  'מסודר',
  'פרודוקטיבי',
  'מאתגר',
  'נמרץ',
  'מתקדם',
  'מלא',
] as const

const ACCENT_SLOT_MS = 30 * 60 * 1000  // 30 minutes

function pad2(n: number): string {
  return n.toString().padStart(2, '0')
}

/** Hook: which accent word to render right now. Same word for every
 *  client during the same 30-minute slot (slot = floor(now / 30min) mod
 *  WORDS.length). Re-checks every minute so we catch the transition. */
function useRotatingAccent(): string {
  const pick = () => ACCENT_WORDS[
    Math.floor(Date.now() / ACCENT_SLOT_MS) % ACCENT_WORDS.length
  ]
  const [word, setWord] = useState<string>(pick)
  useEffect(() => {
    const tick = () => setWord(pick())
    const id = setInterval(tick, 60_000)
    return () => clearInterval(id)
  }, [])
  return word
}

/** Hook: returns the current Date, refreshed every minute. Drives the
 *  .done / .live / .next state on the today's-classes cards (and the
 *  red current-time line inside <CalendarWeek>). */
function useNow(intervalMs: number = 60_000): Date {
  const [now, setNow] = useState<Date>(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}

/** Derive a small kind label for the class card eyebrow. The Google
 *  Calendar event title is the only signal we have — heuristic match
 *  on Hebrew keywords. Default → "הרצאה" (lecture). */
function deriveClassKind(title: string): string {
  const t = title.toLowerCase()
  if (t.includes('תרגול') || t.includes('targul')) return 'תרגול'
  if (t.includes('סמינר')) return 'סמינר'
  if (t.includes('מעבדה')) return 'מעבדה'
  if (t.includes('בוחן') || t.includes('מבחן')) return 'מבחן'
  return 'הרצאה'
}

/** Map an Assignment to the .ar-due pill tone. */
function assignmentTone(a: Assignment, daysUntil: number | null): 'urgent' | 'soon' | 'normal' {
  if (a.priority === 'high') return 'urgent'
  if (daysUntil !== null && daysUntil <= 1) return 'urgent'
  if (a.priority === 'medium' || (daysUntil !== null && daysUntil <= 7)) return 'soon'
  return 'normal'
}

/** Short Hebrew label for an assignment's due chip — "דחוף" / "השבוע" / "בעבודה". */
function assignmentLabel(tone: 'urgent' | 'soon' | 'normal'): string {
  if (tone === 'urgent') return 'דחוף'
  if (tone === 'soon') return 'השבוע'
  return 'בעבודה'
}

/** Format a deadline date (ISO) → "מחר 09:00" / "שישי" / "17 במאי". */
const HEB_MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר']
const HEB_DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת']

function daysUntilDate(iso?: string | null): number | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  d.setHours(0, 0, 0, 0)
  return Math.round((d.getTime() - today.getTime()) / 86_400_000)
}

function formatAssignmentDue(iso?: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const dn = daysUntilDate(iso)!
  const hh = pad2(d.getHours())
  const mm = pad2(d.getMinutes())
  const hasTime = !(d.getHours() === 0 && d.getMinutes() === 0)
  if (dn < 0) return `איחור ${Math.abs(dn)} ימים`
  if (dn === 0) return hasTime ? `היום ${hh}:${mm}` : 'היום'
  if (dn === 1) return hasTime ? `מחר ${hh}:${mm}` : 'מחר'
  if (dn <= 6) {
    const day = HEB_DAYS[d.getDay()]
    return hasTime ? `${day} ${hh}:${mm}` : day
  }
  return `${d.getDate()} ב${HEB_MONTHS[d.getMonth()]}`
}

function formatTodoDue(t: StudyTask): { label: string; today: boolean } {
  if (t.is_completed) return { label: 'הושלם', today: false }
  if (!t.scheduled_date) return { label: '', today: false }
  const dn = daysUntilDate(t.scheduled_date)
  if (dn === null) return { label: '', today: false }
  if (dn < 0) return { label: `איחור ${Math.abs(dn)} ימים`, today: false }
  if (dn === 0) return { label: 'היום', today: true }
  if (dn === 1) return { label: 'מחר', today: false }
  if (dn <= 6) {
    const d = new Date(t.scheduled_date)
    return { label: HEB_DAYS[d.getDay()], today: false }
  }
  const d = new Date(t.scheduled_date)
  return { label: `${d.getDate()} ב${HEB_MONTHS[d.getMonth()]}`, today: false }
}

export default function DashboardPage() {
  const router = useRouter()
  const { user } = useAuth()
  const { db, ready, createTask, updateTask, deleteTask, flushSave } = useDB() as any
  const greetName = resolveFirstName({
    userMetadata: user?.user_metadata as Record<string, unknown> | undefined,
    email: user?.email,
    driveDisplayName: db?.settings?.display_name as string | undefined,
  })
  const accentWord = useRotatingAccent()
  const now = useNow()

  // First-run redirect: a brand-new account (DB loaded, no courses,
  // hasn't dismissed the wizard) lands on /setup instead of staring at
  // an empty dashboard. `setup_seen` is set when the user finishes or
  // skips the wizard, so this only fires once.
  useEffect(() => {
    if (!ready) return
    const noCourses = (db?.courses?.length ?? 0) === 0
    const seenSetup = Boolean(db?.settings?.setup_seen)
    if (noCourses && !seenSetup) {
      router.replace('/setup')
    }
  }, [ready, db?.courses?.length, db?.settings?.setup_seen, router])

  const calendar = useWeekCalendar()
  const courses = useMemo<Course[]>(() => (db?.courses ?? []) as Course[], [db?.courses])

  // ── Today's classes ─────────────────────────────────────────────────
  // Same source as the legacy "היום בלוח" widget: filter to today's
  // dayIndex, sort by hour:minute. Derive .done / .live / .next state
  // from the current time + each slot's duration.
  const todaysClasses = useMemo(() => {
    const todayDow = now.getDay()
    const nowMin = now.getHours() * 60 + now.getMinutes()
    const palette = ['#8b5cf6', '#d97706', '#0d9488', '#6366f1', '#e11d48', '#16a34a']
    const slots = calendar.slots
      .filter(s => s.dayIndex === todayDow)
      .sort((a, b) => a.hour * 60 + a.minute - (b.hour * 60 + b.minute))

    // First-future-slot wins the "next" badge; subsequent future slots
    // render in the default state.
    let nextAssigned = false

    return slots.map((s, i) => {
      const startMin = s.hour * 60 + s.minute
      const endMin = startMin + s.durationMins
      const isDone = endMin <= nowMin
      const isLive = startMin <= nowMin && nowMin < endMin
      const isNext = !isDone && !isLive && !nextAssigned
      if (isNext) nextAssigned = true

      const match = matchCourseForEvent(s.title, courses)
      const color = palette[i % palette.length]
      const href = match
        ? `/summaries?course=${encodeURIComponent(match.id)}&lesson=${encodeURIComponent(s.title)}`
        : s.htmlLink || 'https://calendar.google.com'

      return {
        slot: s,
        kind: deriveClassKind(s.title),
        title: s.title,
        time: `${pad2(s.hour)}:${pad2(s.minute)}`,
        location: s.meta || '',
        durationMins: s.durationMins,
        color,
        state: isDone ? 'done' : isLive ? 'live' : isNext ? 'next' : 'default',
        href,
        external: !match,
      } as const
    })
  }, [calendar.slots, courses, now])

  // ── Assignments widget — 3 most urgent open ─────────────────────────
  const openAssignments = useMemo(() => {
    const list = ((db?.assignments ?? []) as Assignment[])
      .filter(a => a.status !== 'submitted' && a.status !== 'graded')
    // Sort by deadline asc (no-deadline last), then by priority high→low.
    const priorityRank: Record<Assignment['priority'], number> = { high: 0, medium: 1, low: 2 }
    return list
      .map(a => ({
        a,
        days: daysUntilDate(a.deadline),
      }))
      .sort((x, y) => {
        const dx = x.days ?? Number.POSITIVE_INFINITY
        const dy = y.days ?? Number.POSITIVE_INFINITY
        if (dx !== dy) return dx - dy
        return priorityRank[x.a.priority] - priorityRank[y.a.priority]
      })
      .slice(0, 3)
      .map(({ a, days }) => {
        const course = a.course_id ? courses.find(c => c.id === a.course_id) ?? null : null
        const tone = assignmentTone(a, days)
        return {
          a,
          course,
          tone,
          dueLabel: formatAssignmentDue(a.deadline),
          chipLabel: assignmentLabel(tone),
        }
      })
  }, [db?.assignments, courses])

  // ── Todos widget — open + a few done at the bottom ──────────────────
  const todoRows = useMemo(() => {
    const all = (db?.tasks ?? []) as StudyTask[]
    const open = all.filter(t => !t.is_completed)
    const done = all.filter(t => t.is_completed)
    // Sort open by scheduled_date asc (no-date last), done by completed_at desc.
    open.sort((a, b) => (a.scheduled_date ?? '').localeCompare(b.scheduled_date ?? ''))
    done.sort((a, b) => (b.completed_at ?? '').localeCompare(a.completed_at ?? ''))
    // Show up to 6 open + 2 most-recent done so the user can quickly
    // un-check something they did by mistake.
    return [...open.slice(0, 6), ...done.slice(0, 2)]
  }, [db?.tasks])

  const todayOpenCount = useMemo(() => {
    return ((db?.tasks ?? []) as StudyTask[])
      .filter(t => !t.is_completed && daysUntilDate(t.scheduled_date) === 0)
      .length
  }, [db?.tasks])

  // ── Todo handlers — straight pass-through to existing DB methods ────
  const onAddTodo = useCallback(async (title: string) => {
    if (typeof createTask !== 'function') return
    try {
      await createTask({
        title,
        category: 'study',
        scheduled_date: new Date().toISOString().slice(0, 10),
      })
      if (typeof flushSave === 'function') {
        try { await flushSave() } catch { /* non-fatal */ }
      }
    } catch (e) {
      console.warn('[dash-v2] createTask failed', e)
    }
  }, [createTask, flushSave])

  const onToggleTodo = useCallback(async (t: StudyTask) => {
    if (typeof updateTask !== 'function') return
    try {
      await updateTask(t.id, {
        is_completed: !t.is_completed,
        completed_at: !t.is_completed ? new Date().toISOString() : undefined,
      })
    } catch (e) {
      console.warn('[dash-v2] updateTask failed', e)
    }
  }, [updateTask])

  const onDeleteTodo = useCallback(async (t: StudyTask) => {
    if (typeof deleteTask !== 'function') return
    try {
      await deleteTask(t.id)
    } catch (e) {
      console.warn('[dash-v2] deleteTask failed', e)
    }
  }, [deleteTask])

  // ── Render ──────────────────────────────────────────────────────────
  return (
    <div className="cream-page dashboard-v2">
      <main className="dash-v2-main">

        {/* ===== HERO ===== */}
        <section className="dash-v2-hero">
          <div className="dash-v2-hero-meta">
            <LCDDisplay kind="date" />
            <LCDDisplay kind="time" />
          </div>
          <h1 className="dash-v2-h1">
            שלום {greetName}, השבוע שלך{' '}
            <span className="accent">{accentWord}</span>
            .
          </h1>
        </section>

        {/* ===== TODAY'S CLASSES ===== */}
        <div className="dash-v2-section-head">
          <h2>
            השיעורים של היום{' '}
            <span className="badge">
              {todaysClasses.length === 0
                ? 'אין שיעורים'
                : todaysClasses.length === 1
                  ? 'שיעור אחד'
                  : `${todaysClasses.length} שיעורים`}
            </span>
          </h2>
        </div>
        {todaysClasses.length === 0 ? (
          <div className="dash-v2-empty">
            {calendar.error
              ? `שגיאה בקריאת היומן: ${calendar.error.slice(0, 80)}`
              : calendar.loading
                ? 'טוען את היומן…'
                : 'אין שיעורים היום ביומן.'}
            <a
              className="dash-v2-empty-cta"
              href="https://calendar.google.com"
              target="_blank"
              rel="noopener noreferrer"
            >
              פתח Google Calendar →
            </a>
          </div>
        ) : (
          <div className="dash-v2-classes-row">
            {todaysClasses.map((c, i) => {
              const eyebrow = c.state === 'done'
                ? `${c.kind} · הסתיים`
                : c.state === 'next'
                  ? 'השיעור הבא'
                  : c.kind
              const link = c.external
                ? (
                  <a
                    key={i}
                    href={c.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`dash-v2-class-card ${c.state}`}
                    style={{ ['--course-color' as any]: c.color }}
                  >
                    {classCardInner(eyebrow, c)}
                  </a>
                )
                : (
                  <Link
                    key={i}
                    href={c.href}
                    className={`dash-v2-class-card ${c.state}`}
                    style={{ ['--course-color' as any]: c.color }}
                  >
                    {classCardInner(eyebrow, c)}
                  </Link>
                )
              return link
            })}
          </div>
        )}

        {/* ===== TWO WIDGETS ===== */}
        <div className="dash-v2-widgets">

          {/* Assignments — read-only, click to open detail */}
          <section
            className="dash-v2-widget"
            style={{
              ['--w-color' as any]: '#fef3c7',
              ['--w-icon-color' as any]: '#d97706',
            }}
          >
            <header className="w-head">
              <div className="w-icon"><ClipboardCheck size={16} /></div>
              <span className="w-title">המטלות שלי</span>
              <span className="w-count">{openAssignments.length} פתוחות</span>
              <Link href="/tasks" className="w-all">הכל →</Link>
            </header>
            <div className="w-body">
              {openAssignments.length === 0 ? (
                <div className="w-empty">אין מטלות פתוחות כרגע 🎉</div>
              ) : openAssignments.map(({ a, course, tone, dueLabel, chipLabel }) => (
                <Link
                  key={a.id}
                  href={`/assignments?focus=${encodeURIComponent(a.id)}`}
                  className="assn-row"
                  style={{ ['--course-color' as any]: courseColorFor(course?.id ?? '') }}
                >
                  <span className="ar-tag">
                    <span className="dot" />
                    {course?.title ?? 'ללא קורס'}
                  </span>
                  <div className="ar-info">
                    <strong>{a.title}</strong>
                    {dueLabel && <small>{dueLabel}</small>}
                  </div>
                  <span className={`ar-due ${tone}`}>{chipLabel}</span>
                </Link>
              ))}
            </div>
          </section>

          {/* Todos — interactive: add, toggle, delete */}
          <section
            className="dash-v2-widget"
            style={{
              ['--w-color' as any]: '#dcfce7',
              ['--w-icon-color' as any]: '#16a34a',
            }}
          >
            <header className="w-head">
              <div className="w-icon"><ListTodo size={16} /></div>
              <span className="w-title">המשימות שלי</span>
              <span className="w-count">{todayOpenCount} להיום</span>
              <Link href="/todos" className="w-all">הכל →</Link>
            </header>
            <div className="w-body">
              <TodoQuickAdd onAdd={onAddTodo} />
              {todoRows.length === 0 ? (
                <div className="w-empty">הוסף משימה ראשונה למעלה.</div>
              ) : todoRows.map((t) => {
                const due = formatTodoDue(t)
                return (
                  <div key={t.id} className={`todo-row ${t.is_completed ? 'done' : ''}`}>
                    <button
                      type="button"
                      className="check"
                      onClick={() => onToggleTodo(t)}
                      aria-label={t.is_completed ? 'סמן כלא הושלם' : 'סמן כהושלם'}
                      aria-pressed={t.is_completed}
                    >
                      <Check size={12} strokeWidth={3.5} />
                    </button>
                    <span className="tr-text">{t.title}</span>
                    {due.label && (
                      <span className={`tr-due ${due.today ? 'today' : ''}`}>{due.label}</span>
                    )}
                    <button
                      type="button"
                      className="tr-del"
                      onClick={() => onDeleteTodo(t)}
                      aria-label="מחק"
                    >
                      <X size={13} />
                    </button>
                  </div>
                )
              })}
            </div>
          </section>

        </div>

        {/* ===== WEEKLY CALENDAR — wraps the existing CalendarWeek grid ===== */}
        <div className="dash-v2-section-head">
          <h2>
            הלוז השבועי{' '}
            <span className="badge">{calendarBadge(now)}</span>
          </h2>
        </div>
        <div className="dash-v2-calendar-card">
          <div className="cal-head">
            <div className="gcal-logo">{new Date().getDate()}</div>
            <h3>Google Calendar</h3>
            <span className="month">{calendar.loading ? 'מסונכרן…' : 'מסונכרן'}</span>
            <a
              href="https://calendar.google.com"
              target="_blank"
              rel="noopener noreferrer"
              className="cal-open"
            >
              פתח →
            </a>
          </div>
          <CalendarWeek courses={courses} />
        </div>

      </main>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────
// Small leaf components / helpers
// ──────────────────────────────────────────────────────────────────────

function classCardInner(
  eyebrow: string,
  c: { time: string; title: string; location: string; durationMins: number },
): React.ReactNode {
  return (
    <>
      <div className="ctop">
        <span className="ckind">{eyebrow}</span>
        <span className="ctime">{c.time}</span>
      </div>
      <div className="ctitle">{c.title}</div>
      <div className="cmeta">
        {c.location && (
          <span><MapPin size={11} /> {c.location}</span>
        )}
        {c.durationMins > 0 && (
          <span><Clock size={11} /> {c.durationMins} דק'</span>
        )}
      </div>
    </>
  )
}

/** Inline single-row task adder at the top of the todos widget. */
function TodoQuickAdd({ onAdd }: { onAdd: (title: string) => Promise<void> }) {
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const t = value.trim()
    if (!t || busy) return
    setBusy(true)
    setValue('')  // optimistic clear
    try {
      await onAdd(t)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="todo-add" onSubmit={submit}>
      <button
        type="submit"
        className="ta-plus"
        aria-label="הוסף משימה"
        disabled={!value.trim() || busy}
      >
        <Plus size={13} strokeWidth={2.8} />
      </button>
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Escape') setValue('') }}
        placeholder="הוסף משימה חדשה..."
        maxLength={200}
        disabled={busy}
      />
    </form>
  )
}

/** Deterministic course-color picker for assignment-widget rows.
 *  Same palette as todaysClasses so a course renders identically in
 *  both surfaces. */
const ASSIGNMENT_PALETTE = ['#8b5cf6', '#d97706', '#0d9488', '#6366f1', '#e11d48', '#16a34a']
function courseColorFor(courseId: string): string {
  if (!courseId) return ASSIGNMENT_PALETTE[5]  // green-default for "no course"
  let h = 0
  for (let i = 0; i < courseId.length; i++) h = (h * 31 + courseId.charCodeAt(i)) | 0
  return ASSIGNMENT_PALETTE[Math.abs(h) % ASSIGNMENT_PALETTE.length]
}

const HEB_MONTHS_LONG = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר']
function calendarBadge(now: Date): string {
  // ISO week number — start counting weeks from Jan 1.
  const start = new Date(now.getFullYear(), 0, 1)
  const dayOfYear = Math.floor((now.getTime() - start.getTime()) / 86_400_000) + 1
  const week = Math.ceil((dayOfYear + start.getDay()) / 7)
  return `${HEB_MONTHS_LONG[now.getMonth()]} ${now.getFullYear()} · שבוע ${week}`
}

/**
 * Live week-view backed by the user's primary Google Calendar.
 *
 * Preserved verbatim from the v1 dashboard (per "swap visuals, keep
 * mechanics") — the only thing that changed is the wrapping card around
 * it, not the grid itself.
 *
 * - Hour range auto-fits to the events present this week (with a ±1h
 *   buffer). Empty calendar falls back to 09–15.
 * - Each event lands at its day-of-week column + hour row, with the
 *   bar colored deterministically by title-hash so the same lecture
 *   always renders in the same color across renders.
 * - Click on an event whose title matches a TEEPO course opens that
 *   course in /summaries (with the lesson context bar). Click on an
 *   unmatched event opens it in Google Calendar.
 */
function CalendarWeek({ courses }: { courses: Course[] }) {
  const { slots, hourRange, loading, error } = useWeekCalendar()

  // "Now" tick — drives the red current-time line. Re-renders every
  // 60s so the indicator inches down the grid in real time without
  // waiting for the next data refresh.
  const [now, setNow] = useState<Date>(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(id)
  }, [])
  const dow = now.getDay()
  const nowHour = now.getHours()
  const nowMinute = now.getMinutes()
  const weekStart = new Date(now)
  weekStart.setDate(now.getDate() - dow)

  const DAYS = ['א\'', 'ב\'', 'ג\'', 'ד\'', 'ה\'', 'ו\'', 'ש\'']
  const hours: number[] = []
  for (let h = hourRange.min; h <= hourRange.max; h++) hours.push(h)

  // Index events by `${dayIndex}-${hour}` so each cell can look up its event in O(1).
  // We anchor the event at its START hour cell; the absolute-positioned event
  // element then extends downward by its duration (see CAL_ROW_PX math below).
  // Note: when MULTIPLE events start in the same cell (same day + hour), we
  // keep all of them in an array and let the renderer side-by-side them
  // via the layout map below.
  const slotsByCell = new Map<string, WeekCalendarSlot[]>()
  for (const s of slots) {
    const k = `${s.dayIndex}-${s.hour}`
    const arr = slotsByCell.get(k) ?? []
    arr.push(s)
    slotsByCell.set(k, arr)
  }

  // Each hour row is 56px tall (matches .cal-cell height in globals.css).
  const CAL_ROW_PX = 56

  // Side-by-side columns for overlapping events. Greedy interval coloring.
  const layoutByEvent = new Map<string, { col: number; of: number }>()
  function evKey(s: WeekCalendarSlot): string {
    return `${s.dayIndex}-${s.hour * 60 + s.minute}-${s.title}`
  }
  for (let di = 0; di < 7; di++) {
    const dayEvents = slots
      .filter(s => s.dayIndex === di)
      .sort((a, b) => (a.hour * 60 + a.minute) - (b.hour * 60 + b.minute))
    const colEnd: number[] = []
    const eventCol: number[] = []
    for (const ev of dayEvents) {
      const start = ev.hour * 60 + ev.minute
      const end = start + ev.durationMins
      let placed = false
      for (let i = 0; i < colEnd.length; i++) {
        if (colEnd[i] <= start) {
          colEnd[i] = end
          eventCol.push(i)
          placed = true
          break
        }
      }
      if (!placed) {
        eventCol.push(colEnd.length)
        colEnd.push(end)
      }
    }
    for (let i = 0; i < dayEvents.length; i++) {
      const ev = dayEvents[i]
      const start = ev.hour * 60 + ev.minute
      const end = start + ev.durationMins
      let groupMax = eventCol[i] + 1
      for (let j = 0; j < dayEvents.length; j++) {
        if (i === j) continue
        const other = dayEvents[j]
        const oStart = other.hour * 60 + other.minute
        const oEnd = oStart + other.durationMins
        const overlaps = oStart < end && oEnd > start
        if (overlaps) groupMax = Math.max(groupMax, eventCol[j] + 1)
      }
      layoutByEvent.set(evKey(ev), { col: eventCol[i], of: groupMax })
    }
  }

  return (
    <>
      <div className="cal-grid">
        <div className="cal-empty" />
        {DAYS.map((dn, i) => {
          const d = new Date(weekStart)
          d.setDate(weekStart.getDate() + i)
          const isToday = i === dow
          return (
            <div key={dn} className={`cal-day-head ${isToday ? 'today' : ''}`}>
              <div className="dn">{isToday ? 'היום' : dn}</div>
              <div className="dnum">{d.getDate()}</div>
            </div>
          )
        })}
      </div>

      {error && !loading && (
        <div className="cal-error" role="alert">
          {error.includes('TOKEN_EXPIRED') || error.includes('401')
            ? 'הטוקן של Google פג. צא והתחבר מחדש כדי לראות את היומן.'
            : 'הטעינה של היומן נכשלה. נסה לרענן.'}
        </div>
      )}

      <div className="cal-body">
        {hours.flatMap(h => [
          <div key={`t-${h}`} className="cal-time">{pad2(h)}:00</div>,
          ...Array.from({ length: 7 }, (_, di) => {
            const isNowCell =
              di === dow &&
              h === nowHour &&
              h >= hourRange.min &&
              h <= hourRange.max
            const nowIndicator = isNowCell ? (
              <div
                className="cal-now"
                style={{ top: `${(nowMinute / 60) * CAL_ROW_PX}px` }}
                aria-label={`עכשיו ${pad2(nowHour)}:${pad2(nowMinute)}`}
              >
                <span className="cal-now-dot" />
              </div>
            ) : null
            const cellEvents = slotsByCell.get(`${di}-${h}`) ?? []
            if (cellEvents.length === 0) return (
              <div key={`c-${di}-${h}`} className="cal-cell">
                {nowIndicator}
              </div>
            )
            return (
              <div key={`c-${di}-${h}`} className="cal-cell">
                {nowIndicator}
                {cellEvents.map((ev, evIdx) => {
                  const matched = matchCourseForEvent(ev.title, courses)
                  const className = `cal-event ev-${ev.color}${matched ? ' is-matched' : ''}`
                  const titleAttr =
                    `${ev.title}${ev.meta ? ' · ' + ev.meta : ''}` +
                    (matched ? ` — לחץ לפתיחה במוח` : ' — לחץ לפתיחה ב-Google Calendar')
                  const topPx = Math.round((ev.minute / 60) * CAL_ROW_PX) + 3
                  const heightPx = Math.max(22, Math.round((ev.durationMins / 60) * CAL_ROW_PX) - 6)
                  const layout = layoutByEvent.get(evKey(ev)) ?? { col: 0, of: 1 }
                  let horizStyle: React.CSSProperties
                  if (layout.of <= 1) {
                    horizStyle = { left: '3px', right: '3px' }
                  } else {
                    const widthPct = 100 / layout.of
                    horizStyle = {
                      left: `calc(${widthPct * layout.col}% + 2px)`,
                      width: `calc(${widthPct}% - 4px)`,
                      right: 'auto',
                    }
                  }
                  const eventStyle: React.CSSProperties = {
                    top: `${topPx}px`,
                    height: `${heightPx}px`,
                    ...horizStyle,
                  }
                  const startStr = `${pad2(ev.hour)}:${pad2(ev.minute)}`
                  const endTotal = ev.hour * 60 + ev.minute + ev.durationMins
                  const endStr = `${pad2(Math.floor(endTotal / 60) % 24)}:${pad2(endTotal % 60)}`
                  const showRange = ev.durationMins >= 60 && layout.of === 1
                  const timeLabel = showRange ? `${startStr}–${endStr}` : startStr
                  const showTime = ev.durationMins >= 30
                  const eventContent = (
                    <>
                      {showTime && <span className="cal-event-time">{timeLabel}</span>}
                      <span className="cal-event-title">{ev.title}</span>
                      {ev.meta && <small>{ev.meta}</small>}
                    </>
                  )
                  const evReactKey = `e-${di}-${h}-${evIdx}`
                  return matched ? (
                    <Link
                      key={evReactKey}
                      href={`/summaries?course=${encodeURIComponent(matched.id)}&lesson=${encodeURIComponent(ev.title)}`}
                      className={className}
                      title={`${timeLabel} · ${titleAttr}`}
                      style={eventStyle}
                    >
                      {eventContent}
                    </Link>
                  ) : (
                    <a
                      key={evReactKey}
                      href={ev.htmlLink || 'https://calendar.google.com'}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={className}
                      title={`${timeLabel} · ${titleAttr}`}
                      style={eventStyle}
                    >
                      {eventContent}
                    </a>
                  )
                })}
              </div>
            )
          }),
        ])}
      </div>
    </>
  )
}
