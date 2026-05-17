'use client'

/**
 * Dashboard — v2 locked design.
 *
 * Source: teepo-design/mockup_dashboard.html. Layout (top → bottom):
 *   1. Hero strip
 *      - left  (RTL "start"): meta row [LCD date · LCD time · CountryClock]
 *        + headline "שלום {name}, השבוע שלך מאוזן." with wave-animated
 *          accent letters and a flowing SVG underline.
 *      - right (RTL "end"): puzzle zone = instructions card + SlidingPuzzle.
 *   2. Google Calendar week card (placeholder grid — wired to real data in a
 *      follow-up).
 *   3. Three bottom cards: today schedule · academic assignments · personal todos.
 *
 * Renders real user content from useDB() when present; falls back to
 * mockup-quality placeholders for missing data so an empty account still
 * looks alive.
 */

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { useDB } from '@/lib/db-context'
import { useWeekCalendar, type WeekCalendarSlot } from '@/lib/use-week-calendar'
import { matchCourseForEvent } from '@/lib/event-course-match'
import { resolveFirstName } from '@/lib/display-name'
import type { Course } from '@/types'
import { Plus } from 'lucide-react'
import LCDDisplay from '@/components/ui/LCDDisplay'
import CountryClock from '@/components/dashboard/CountryClock'
import SlidingPuzzle from '@/components/dashboard/SlidingPuzzle'

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

// First-name greeting derived from the shared name resolver. Priority:
// Drive setting → Google profile (full_name/name) → legacy → email prefix.
// See lib/display-name.ts.

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

export default function DashboardPage() {
  const router = useRouter()
  const { user } = useAuth()
  const { db, ready, createTask, flushSave } = useDB()
  const greetName = resolveFirstName({
    userMetadata: user?.user_metadata as Record<string, unknown> | undefined,
    email: user?.email,
    driveDisplayName: db?.settings?.display_name as string | undefined,
  })
  const accentWord = useRotatingAccent()

  // First-run redirect: a brand-new account (DB loaded, no courses, hasn't
  // dismissed the wizard) lands on /setup instead of staring at an empty
  // dashboard. `setup_seen` is set when the user finishes or skips the
  // wizard, so this only fires once.
  useEffect(() => {
    if (!ready) return
    const noCourses = (db?.courses?.length ?? 0) === 0
    const seenSetup = Boolean(db?.settings?.setup_seen)
    if (noCourses && !seenSetup) {
      router.replace('/setup')
    }
  }, [ready, db?.courses?.length, db?.settings?.setup_seen, router])

  // Three card data — derived from the real DB only. Empty arrays render
  // a CTA (see EmptyHint below) instead of fake mockup rows.

  // Today's schedule is sourced from Google Calendar (the same useWeekCalendar
  // that powers the week grid above) and fuzzy-matched against the user's
  // TEEPO courses. Each row links into /summaries with the course + the
  // calendar event title so the user can act on that lesson immediately.
  const calendar = useWeekCalendar()
  const courses = useMemo<Course[]>(() => (db?.courses ?? []) as Course[], [db?.courses])
  const todaySchedule = useMemo(() => {
    const todayDow = new Date().getDay() // 0..6, matches WeekCalendarSlot.dayIndex
    const rows = calendar.slots
      .filter(s => s.dayIndex === todayDow)
      .sort((a, b) => a.hour * 60 + a.minute - (b.hour * 60 + b.minute))
      .slice(0, 6)
    const palette = ['#8b5cf6', '#d97706', '#0d9488', '#6366f1', '#e11d48', '#16a34a']
    return rows.map((s, i) => {
      const match = matchCourseForEvent(s.title, courses)
      const href = match
        ? `/summaries?course=${encodeURIComponent(match.id)}&lesson=${encodeURIComponent(s.title)}`
        : '/summaries'
      return {
        time: `${pad2(s.hour)}:${pad2(s.minute)}`,
        title: s.title,
        meta: match ? `${match.title}${s.meta ? ' · ' + s.meta : ''}` : (s.meta || 'לא משויך לקורס'),
        color: palette[i % palette.length],
        href,
        matched: !!match,
      }
    })
  }, [calendar.slots, courses])

  const assignments = useMemo(() => {
    const real = (db?.assignments ?? []).filter((a: any) => !a.is_completed).slice(0, 4)
    return real.map((a: any) => ({
      title: a.title ?? a.name ?? 'מטלה',
      meta: a.due_date ? `דדליין ${a.due_date.slice(0, 10)}` : '',
      tag: a.priority === 'high' ? 'דחוף' : a.priority === 'medium' ? 'השבוע' : 'בעבודה',
      tagClass: a.priority === 'high' ? 't-rose' : a.priority === 'medium' ? 't-amber' : 't-blue',
      color: '#d97706',
    }))
  }, [db])

  const todos: Array<{ title: string; meta: string; tag: string; tagClass: string }> = useMemo(() => {
    const real = (db?.tasks ?? []).filter((t: any) => !t.is_completed).slice(0, 4)
    return real.map((t: any) => ({
      title: t.title,
      meta: t.description ?? '',
      tag: t.scheduled_date ?? '',
      tagClass: 't-soft',
    }))
  }, [db])

  return (
    <div className="cream-page dashboard-v2">
      <main className="dash-main">
        <div className="dash-wrap">

          {/* ===== HERO ===== */}
          <section className="dash-hero">
            <div className="hero-content">
              <div className="hero-meta">
                <LCDDisplay kind="date" />
                <LCDDisplay kind="time" />
                <CountryClock />
              </div>
              {/* One line, no wave. The accent word inside .accent gets the
               *  green underline (CSS ::after) but is otherwise static — and
               *  cycles every 30 minutes via useRotatingAccent above. */}
              <h1 className="dash-h1">
                שלום {greetName}, השבוע שלך{' '}
                <span className="accent">{accentWord}</span>
                .
              </h1>
            </div>

            <div className="puzzle-zone">
              <div className="puzzle-instructions">
                <div className="pi-title">הוראות המשחק</div>
                <ol>
                  <li><strong>סדר</strong> את המספרים 1-8</li>
                  <li><strong>לחץ</strong> משבצת ליד הריק</li>
                  <li><strong>פחות</strong> מהלכים = ניצחון</li>
                </ol>
                <div className="pi-goal">
                  <span>הסדר הסופי:</span>
                  <div className="pi-goal-mini" aria-hidden>
                    {[1, 2, 3, 4, 5, 6, 7, 8, 0].map((n, i) => (
                      <span key={i} className={n === 0 ? 'empty' : ''}>{n !== 0 ? n : ''}</span>
                    ))}
                  </div>
                </div>
              </div>
              <SlidingPuzzle />
            </div>
          </section>

          {/* ===== CALENDAR — week-view placeholder ===== */}
          <div className="calendar-card-v2">
            <div className="cal-head">
              <div className="gcal-logo">{new Date().getDate()}</div>
              <h3>Google Calendar</h3>
              <span className="month">שבוע נוכחי</span>
              <a
                href="https://calendar.google.com"
                target="_blank"
                rel="noopener noreferrer"
              >
                פתח →
              </a>
            </div>
            <CalendarWeek courses={courses} />
          </div>

          {/* ===== BOTTOM 3 CARDS ===== */}
          <div className="bottom-row-v2">
            <div className="dcard">
              <div className="dcard-head">
                <h3>היום בלוח <span className="badge-num">{todaySchedule.length} שיעורים</span></h3>
                <Link href="/tasks">השבוע →</Link>
              </div>
              {todaySchedule.length === 0 ? (
                <EmptyCard
                  text={
                    calendar.error
                      ? `שגיאה בקריאת היומן: ${calendar.error.slice(0, 80)}`
                      : calendar.loading
                        ? 'טוען את היומן…'
                        : 'אין שיעורים היום ביומן.'
                  }
                  ctaHref="https://calendar.google.com"
                  ctaText="פתח Google Calendar"
                  external
                />
              ) : (
                todaySchedule.map((row, i) => (
                  <Link
                    href={row.href}
                    key={i}
                    className={`sch-row sch-row-link${row.matched ? '' : ' is-unmatched'}`}
                    title={row.matched ? 'פתח במוח לבחירת פעולה' : 'אין קורס תואם — פתח את עמוד המוח'}
                  >
                    <div className="sch-time">{row.time}</div>
                    <div className="sch-bar" style={{ background: row.color }} />
                    <div className="sch-info">
                      <strong>{row.title}</strong>
                      <small>{row.meta}</small>
                    </div>
                  </Link>
                ))
              )}
            </div>

            <div className="dcard">
              <div className="dcard-head">
                <h3>מטלות ועבודות <span className="badge-num">{assignments.length} פעילות</span></h3>
                <Link href="/tasks">הכל →</Link>
              </div>
              {assignments.length === 0 ? (
                <EmptyCard
                  text="אין מטלות פתוחות."
                  ctaHref="/tasks"
                  ctaText="הוסף מטלה"
                />
              ) : (
                assignments.map((a, i) => (
                  <div className="course" key={i}>
                    <div className="course-bar" style={{ background: a.color }} />
                    <div className="course-info">
                      <strong>{a.title}</strong>
                      <small>{a.meta}</small>
                    </div>
                    <div className={`course-tag ${a.tagClass}`}>{a.tag}</div>
                  </div>
                ))
              )}
            </div>

            <div className="dcard">
              <div className="dcard-head">
                <h3>משימות <span className="badge-num">{todos.length} פעילות</span></h3>
                <Link href="/todos">פתח הכל →</Link>
              </div>
              {todos.length === 0 ? (
                <div className="dcard-empty dcard-empty-compact">
                  <p>אין משימות פתוחות.</p>
                </div>
              ) : (
                todos.map((t, i) => (
                  <div className="task" key={i}>
                    <div className="checkbox" aria-hidden />
                    <div className="task-info">
                      <strong>{t.title}</strong>
                      <small>{t.meta}</small>
                    </div>
                    <div className={`task-tag ${t.tagClass}`}>{t.tag}</div>
                  </div>
                ))
              )}
              <QuickAddTask
                onAdd={async (title) => {
                  try {
                    await createTask({
                      title,
                      scheduled_date: new Date().toISOString().slice(0, 10),
                      category: 'study',
                    })
                    await flushSave()
                  } catch (e) {
                    console.warn('[quick-add-task] failed', e)
                  }
                }}
              />
            </div>
          </div>

        </div>
      </main>
    </div>
  )
}

/**
 * Empty-card helper — used by the three bottom dashboard cards when the
 * user's DB has no data of that kind yet. Replaces the previous
 * mockup-data fallback rows so a fresh account doesn't show fictional
 * courses (אלגברה / חדו"א / etc.) as if they were real.
 */
/** Inline single-row task adder at the bottom of the משימות widget.
 *  Type a title → Enter or click + → creates a StudyTask for today.
 *  Esc clears. Optimistic UX (clear input immediately on submit). */
function QuickAddTask({ onAdd }: { onAdd: (title: string) => Promise<void> }) {
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    const t = value.trim()
    if (!t || busy) return
    setBusy(true)
    setValue('') // optimistic clear so the user can type the next one
    try {
      await onAdd(t)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form
      className="quick-add-task"
      onSubmit={(e) => { e.preventDefault(); void submit() }}
    >
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Escape') setValue('') }}
        placeholder="הוסף משימה ולחץ Enter…"
        maxLength={200}
        dir="rtl"
        disabled={busy}
      />
      <button
        type="submit"
        aria-label="הוסף משימה"
        disabled={!value.trim() || busy}
      >
        <Plus size={14} />
      </button>
    </form>
  )
}

function EmptyCard({
  text,
  ctaHref,
  ctaText,
  external,
}: {
  text: string
  ctaHref: string
  ctaText: string
  external?: boolean
}) {
  return (
    <div className="dcard-empty">
      <p>{text}</p>
      {external ? (
        <a
          href={ctaHref}
          target="_blank"
          rel="noopener noreferrer"
          className="dcard-empty-cta"
        >
          {ctaText} →
        </a>
      ) : (
        <Link href={ctaHref} className="dcard-empty-cta">{ctaText} →</Link>
      )}
    </div>
  )
}

/**
 * Live week-view backed by the user's primary Google Calendar.
 *
 * - Hour range auto-fits to the events present this week (with a ±1h
 *   buffer). Empty calendar falls back to 09–15.
 * - Each event lands at its day-of-week column + hour row, with the
 *   bar colored deterministically by title-hash so the same lecture
 *   always renders in the same color across renders.
 * - Click on an event whose title matches a TEEPO course opens that
 *   course in /summaries (with the lesson context bar). Click on an
 *   unmatched event opens it in Google Calendar — same affordance the
 *   "היום בלוח" widget below uses.
 */
function CalendarWeek({ courses }: { courses: Course[] }) {
  const { slots, hourRange, loading, error } = useWeekCalendar()

  const today = new Date()
  const dow = today.getDay()
  const weekStart = new Date(today)
  weekStart.setDate(today.getDate() - dow)

  const DAYS = ['א\'', 'ב\'', 'ג\'', 'ד\'', 'ה\'', 'ו\'', 'ש\'']
  const hours: number[] = []
  for (let h = hourRange.min; h <= hourRange.max; h++) hours.push(h)

  // Index events by `${dayIndex}-${hour}` so each cell can look up its event in O(1).
  // We anchor the event at its START hour cell; the absolute-positioned event
  // element then extends downward by its duration (see CAL_ROW_PX math below).
  const slotByCell = new Map<string, WeekCalendarSlot>()
  for (const s of slots) {
    slotByCell.set(`${s.dayIndex}-${s.hour}`, s)
  }

  // Each hour row is 56px tall (matches .cal-cell height in globals.css).
  // Used to translate event minute-offset + duration into top/height pixels
  // so the event block actually spans its real time range instead of being
  // clipped to a 1-hour cell. Must stay in sync with the CSS rule.
  const CAL_ROW_PX = 56

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
            const ev = slotByCell.get(`${di}-${h}`)
            if (!ev) return <div key={`c-${di}-${h}`} className="cal-cell" />
            const matched = matchCourseForEvent(ev.title, courses)
            const className = `cal-event ev-${ev.color}${matched ? ' is-matched' : ''}`
            const titleAttr =
              `${ev.title}${ev.meta ? ' · ' + ev.meta : ''}` +
              (matched ? ` — לחץ לפתיחה במוח` : ' — לחץ לפתיחה ב-Google Calendar')
            // Compute pixel-precise top/height so the event spans its full
            // duration. Top accounts for the minute offset within the starting
            // hour, height covers the full duration (clamped to a minimum of
            // 22px so very short events stay readable). 3px inset top/bottom
            // matches the original cal-event styling.
            const topPx = Math.round((ev.minute / 60) * CAL_ROW_PX) + 3
            const heightPx = Math.max(22, Math.round((ev.durationMins / 60) * CAL_ROW_PX) - 6)
            const eventStyle = { top: `${topPx}px`, height: `${heightPx}px` }
            return (
              <div key={`c-${di}-${h}`} className="cal-cell">
                {matched ? (
                  <Link
                    href={`/summaries?course=${encodeURIComponent(matched.id)}&lesson=${encodeURIComponent(ev.title)}`}
                    className={className}
                    title={titleAttr}
                    style={eventStyle}
                  >
                    {ev.title}
                    {ev.meta && <small>{ev.meta}</small>}
                  </Link>
                ) : (
                  <a
                    href={ev.htmlLink || 'https://calendar.google.com'}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={className}
                    title={titleAttr}
                    style={eventStyle}
                  >
                    {ev.title}
                    {ev.meta && <small>{ev.meta}</small>}
                  </a>
                )}
              </div>
            )
          }),
        ])}
      </div>
    </>
  )
}
