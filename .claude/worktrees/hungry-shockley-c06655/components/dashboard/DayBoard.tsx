'use client'

/**
 * DayBoard — today's chronological timeline (right) + live details
 * panel (left), per teepo-design/mockup_dashboard_v2.html §"היום שלך".
 *
 * Replaces the deleted .dash-v2-classes-row horizontal grid. Every
 * piece of data is real: events come from the same useWeekCalendar()
 * source as the weekly iframe further down the page.
 *
 * Wiring (per CLAUDE_CODE_HANDOFF.md "swap visuals, keep mechanics"):
 *   - Today's items: useWeekCalendar().slots, filtered to today's
 *     dayOfWeek, sorted by hour:minute.
 *   - Classification: matchCourseForEvent() decides type=course vs
 *     type=notes. Course-typed rows show course details
 *     (lecturer / location / credits / current avg / open assignments)
 *     pulled from useDB(). Notes-typed rows show
 *     location / description / prep checklist — the first two from
 *     Google Calendar, the prep checklist from a TBD EventNote store
 *     (proposed in the PR description; until that ships we render a
 *     clean empty state, never fake data).
 *   - "Open course page" → /summaries?course={id} (matches the existing
 *     class-card destination so we don't regress the URL contract).
 *   - "Open in Google Calendar" → slot.htmlLink (existing pattern).
 *
 * Auto-selects the first not-yet-finished event on mount so the panel
 * is never empty. The user can click any other row to swap it in.
 */

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ExternalLink, MapPin, CheckSquare } from 'lucide-react'
import type { Course, Assignment } from '@/types'
import type { WeekCalendarSlot } from '@/lib/use-week-calendar'
import { matchCourseForEvent } from '@/lib/event-course-match'

function pad2(n: number): string {
  return n.toString().padStart(2, '0')
}

/** Same palette the old dash-v2-class-card used so a single calendar
 *  event keeps the same accent color across the day-board, the weekly
 *  iframe, and the assignment widget. Picked deterministically by index
 *  in today's slot list (not by title hash) to match the mockup, which
 *  varies color per row regardless of repeated titles. */
const COURSE_PALETTE = ['#8b5cf6', '#d97706', '#0d9488', '#6366f1', '#e11d48', '#16a34a']

type DayBoardItem = {
  slot: WeekCalendarSlot
  /** Stable React key (event id, falls back to title+time if id missing). */
  key: string
  /** Matched course, if any. */
  course: Course | null
  /** 'courses' for course-matched, 'notes' otherwise. */
  type: 'courses' | 'notes'
  /** Course-color accent. */
  color: string
  /** Cooked start / end strings for the time pill. */
  timeStart: string
  timeEnd: string
  /** Status: 'done' if already ended, 'next' if first not-yet-started. */
  status: 'done' | 'next' | 'upcoming' | 'live'
}

function endTimeOf(slot: WeekCalendarSlot): { hour: number; minute: number } {
  const endTotal = slot.hour * 60 + slot.minute + slot.durationMins
  return { hour: Math.floor(endTotal / 60) % 24, minute: endTotal % 60 }
}

/** Build today's items list with classification + status. */
function buildTodayItems(slots: WeekCalendarSlot[], courses: Course[], now: Date): DayBoardItem[] {
  const todayDow = now.getDay()
  const nowMin = now.getHours() * 60 + now.getMinutes()

  const today = slots
    .filter(s => s.dayIndex === todayDow)
    .sort((a, b) => a.hour * 60 + a.minute - (b.hour * 60 + b.minute))

  let nextAssigned = false
  return today.map((slot, i) => {
    const startMin = slot.hour * 60 + slot.minute
    const endMin = startMin + slot.durationMins
    const isDone = endMin <= nowMin
    const isLive = startMin <= nowMin && nowMin < endMin
    const isNext = !isDone && !isLive && !nextAssigned
    if (isNext) nextAssigned = true

    const matchedCourse = matchCourseForEvent(slot.title, courses)
    const end = endTimeOf(slot)
    return {
      slot,
      key: slot.id || `${slot.dayIndex}-${slot.hour}-${slot.minute}-${slot.title}`,
      course: matchedCourse,
      type: matchedCourse ? 'courses' : 'notes',
      color: COURSE_PALETTE[i % COURSE_PALETTE.length],
      timeStart: `${pad2(slot.hour)}:${pad2(slot.minute)}`,
      timeEnd: `${pad2(end.hour)}:${pad2(end.minute)}`,
      status: isDone ? 'done' : isLive ? 'live' : isNext ? 'next' : 'upcoming',
    }
  })
}

export interface DayBoardProps {
  /** Today's slots from useWeekCalendar() (full week — the component
   *  filters down to today's dayOfWeek itself). */
  slots: WeekCalendarSlot[]
  /** Courses from useDB() — used both for classification and to pull
   *  course-card meta when a slot matches. */
  courses: Course[]
  /** All open + closed assignments, used to surface "מטלות פתוחות (N)"
   *  in the course panel. Passed in rather than re-derived so the
   *  parent owns the single source of truth. */
  assignments: Assignment[]
  /** Live clock — passed in so the parent's useNow drives re-render
   *  cadence (consistent with the rest of the dashboard). */
  now: Date
  /** Loading / error from useWeekCalendar() — surfaces empty states. */
  loading?: boolean
  error?: string | null
}

export default function DayBoard({
  slots,
  courses,
  assignments,
  now,
  loading = false,
  error = null,
}: DayBoardProps) {
  const items = useMemo(
    () => buildTodayItems(slots, courses, now),
    [slots, courses, now],
  )

  // Selection state — `null` means "auto-select on first render"
  const [selectedKey, setSelectedKey] = useState<string | null>(null)

  // Auto-select on mount + whenever the list changes. Prefer "next",
  // fall back to "live", fall back to first row. If the previously
  // selected key is still in the list, keep it.
  useEffect(() => {
    if (items.length === 0) {
      setSelectedKey(null)
      return
    }
    if (selectedKey && items.some(it => it.key === selectedKey)) return
    const next = items.find(it => it.status === 'next')
      ?? items.find(it => it.status === 'live')
      ?? items[0]
    setSelectedKey(next.key)
  }, [items, selectedKey])

  const selected = items.find(it => it.key === selectedKey) ?? null

  // ── Empty / loading shells ─────────────────────────────────────────
  if (loading && items.length === 0) {
    return (
      <div className="day-board" aria-busy="true">
        <div className="day-timeline" />
        <aside className="day-panel">
          <div className="dp-head"><span className="dp-type">…</span></div>
          <div className="dp-body"><p className="dp-empty">טוען את היומן…</p></div>
        </aside>
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className="day-board day-board-empty">
        <div className="day-board-empty-card">
          <p className="dp-title">
            {error
              ? `שגיאה בקריאת היומן: ${error.slice(0, 100)}`
              : 'אין אירועים היום ביומן.'}
          </p>
          <a
            href="https://calendar.google.com"
            target="_blank"
            rel="noopener noreferrer"
            className="dp-btn primary"
          >
            פתח Google Calendar
            <ExternalLink size={13} />
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="day-board">
      {/* ── Timeline (right) ───────────────────────────────────────── */}
      <div className="day-timeline" role="list" aria-label="היום שלך">
        {items.map(it => {
          const stateClasses = [
            'tl-row',
            it.status === 'next' ? 'next' : '',
            it.status === 'done' ? 'done' : '',
            it.key === selectedKey ? 'selected' : '',
          ].filter(Boolean).join(' ')
          return (
            <button
              key={it.key}
              type="button"
              role="listitem"
              className={stateClasses}
              style={{ ['--course-color' as any]: it.color }}
              onClick={() => setSelectedKey(it.key)}
              aria-current={it.key === selectedKey ? 'true' : undefined}
              data-type={it.type}
              data-id={it.key}
            >
              <span className="tl-time">
                {it.timeStart}
                <span className="arrow">→</span>
                {it.timeEnd}
              </span>
              <span className="tl-dot" aria-hidden />
              <span className="tl-card">
                <span className="tl-ctitle">{it.slot.title}</span>
                {it.status === 'next' && (
                  <span className="tl-ckind">השיעור הבא</span>
                )}
                {it.status === 'live' && (
                  <span className="tl-ckind">עכשיו</span>
                )}
              </span>
            </button>
          )
        })}
      </div>

      {/* ── Live details panel (left) ─────────────────────────────── */}
      <aside
        className="day-panel"
        style={selected ? { ['--course-color' as any]: selected.color } : undefined}
      >
        {selected && (
          <>
            <header className="dp-head">
              <span className="dp-type">{selected.type === 'courses' ? 'קורס' : 'אירוע'}</span>
              <h3 className="dp-title">{selected.slot.title}</h3>
              <span className="dp-time" dir="ltr">
                {selected.timeStart} → {selected.timeEnd}
              </span>
            </header>
            <div className="dp-body">
              {selected.type === 'courses'
                ? <CoursePanelBody item={selected} assignments={assignments} />
                : <NotesPanelBody item={selected} />}
            </div>
            <footer className="dp-actions">
              <PanelActions item={selected} />
            </footer>
          </>
        )}
      </aside>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────
// Course panel body — lecturer / location / credits / current avg /
// open assignments. Pulls from the matched Course + the assignment
// list passed down from the parent.
// ─────────────────────────────────────────────────────────────────────

function CoursePanelBody({ item, assignments }: { item: DayBoardItem; assignments: Assignment[] }) {
  const c = item.course
  // Open assignments for this course = anything not submitted/graded.
  const openAssignments = useMemo(() => {
    if (!c) return []
    return assignments.filter(a =>
      a.course_id === c.id && a.status !== 'submitted' && a.status !== 'graded'
    )
  }, [c, assignments])

  // Each row may be missing — render only what we have. Empty-state
  // rows say "—" so the layout stays consistent without inventing data.
  const rows: Array<[string, string]> = []
  const lecturer = (c as any)?.lecturer_name || (c as any)?.lecturer_email
  if (lecturer) rows.push(['מרצה', String(lecturer)])
  const location = item.slot.meta || (c as any)?.category_name
  if (location) rows.push(['מיקום', String(location)])
  const credits = (c as any)?.credits
  if (typeof credits === 'number') rows.push(['נק"ז', String(credits)])

  return (
    <>
      <section className="dp-section">
        <span className="ds-label">פרטי הקורס</span>
        {rows.length === 0 ? (
          <p className="ds-content ds-empty">אין פרטי קורס נוספים — סנכרן מ-Moodle כדי לעדכן.</p>
        ) : rows.map(([k, v]) => (
          <div key={k} className="ds-row">
            <strong>{k}</strong>
            <span style={{ marginInlineStart: 'auto' }}>{v}</span>
          </div>
        ))}
      </section>

      <section className="dp-section">
        <span className="ds-label">
          מטלות פתוחות {openAssignments.length > 0 && `(${openAssignments.length})`}
        </span>
        {openAssignments.length === 0 ? (
          <p className="ds-content ds-empty">אין מטלות פתוחות 🎉</p>
        ) : (
          <ul className="ds-list">
            {openAssignments.slice(0, 5).map(a => (
              <li key={a.id}>
                <Link
                  href={`/assignments?focus=${encodeURIComponent(a.id)}`}
                  className="ds-link"
                >
                  {a.title}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  )
}

// ─────────────────────────────────────────────────────────────────────
// Notes panel body — location, description, prep checklist.
// `description` comes from Google Calendar (now exposed via the
// extended WeekCalendarSlot). `prep_items` does NOT exist in the
// schema today; we render an empty state until the proposed EventNote
// model lands (see PR description).
// ─────────────────────────────────────────────────────────────────────

function NotesPanelBody({ item }: { item: DayBoardItem }) {
  return (
    <>
      <section className="dp-section">
        <span className="ds-label">מיקום</span>
        {item.slot.meta ? (
          <p className="ds-content">{item.slot.meta}</p>
        ) : (
          <p className="ds-content ds-empty">לא צוין מיקום ב-Google Calendar.</p>
        )}
      </section>

      <section className="dp-section">
        <span className="ds-label">תיאור</span>
        {item.slot.description ? (
          <p className="ds-content" style={{ whiteSpace: 'pre-wrap' }}>
            {item.slot.description}
          </p>
        ) : (
          <p className="ds-content ds-empty">אין תיאור — הוסף ב-Google Calendar.</p>
        )}
      </section>

      <section className="dp-section">
        <span className="ds-label">הכן מראש</span>
        <p className="ds-content ds-empty">
          אין רשימת הכנה עדיין — תכונת הרשימה תגיע בקרוב.
        </p>
      </section>
    </>
  )
}

// ─────────────────────────────────────────────────────────────────────
// Action buttons row.
// ─────────────────────────────────────────────────────────────────────

function PanelActions({ item }: { item: DayBoardItem }) {
  if (item.type === 'courses' && item.course) {
    return (
      <>
        <Link
          href={`/summaries?course=${encodeURIComponent(item.course.id)}&lesson=${encodeURIComponent(item.slot.title)}`}
          className="dp-btn"
        >
          סיכומי שיעור
        </Link>
        <Link
          href={`/courses/${encodeURIComponent(item.course.id)}`}
          className="dp-btn primary"
        >
          פתח דף קורס
          <ChevronLeft size={14} />
        </Link>
      </>
    )
  }

  // notes-type — surface "פתח ב-Google Calendar" as the primary action.
  return (
    <>
      {item.slot.meta && (
        <a
          href={`https://www.google.com/maps/search/?q=${encodeURIComponent(item.slot.meta)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="dp-btn"
          aria-label={`פתח מפה ל${item.slot.meta}`}
        >
          <MapPin size={13} />
          מפה
        </a>
      )}
      <a
        href={item.slot.htmlLink || 'https://calendar.google.com'}
        target="_blank"
        rel="noopener noreferrer"
        className="dp-btn primary"
      >
        <CheckSquare size={13} />
        פתח ב-Google Calendar
      </a>
    </>
  )
}
