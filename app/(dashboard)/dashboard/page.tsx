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
import { useMemo } from 'react'
import { useAuth } from '@/lib/auth-context'
import { useDB } from '@/lib/db-context'
import LCDDisplay from '@/components/ui/LCDDisplay'
import CountryClock from '@/components/dashboard/CountryClock'
import SlidingPuzzle from '@/components/dashboard/SlidingPuzzle'

const ACCENT_WORD = 'מאוזן' // each letter gets its own wave animation

function firstName(user: { user_metadata?: { display_name?: string }; email?: string | null } | null): string {
  const full = user?.user_metadata?.display_name ?? user?.email?.split('@')[0] ?? 'סטודנט'
  return full.split(/\s+/)[0] || 'סטודנט'
}

function pad2(n: number): string {
  return n.toString().padStart(2, '0')
}

export default function DashboardPage() {
  const { user } = useAuth()
  const { db } = useDB()
  const greetName = firstName(user)

  // Three card data — fall back to mockup-shaped placeholders if empty.
  const todaySchedule = useMemo(() => {
    const events = db?.lessons?.slice(0, 4) ?? []
    if (events.length) {
      return events.map((l: any, i: number) => ({
        time: l.scheduled_time ?? `${10 + i * 2}:00`,
        title: l.title ?? 'שיעור',
        meta: l.location ?? '',
        color: ['#8b5cf6', '#d97706', '#0d9488', '#6366f1'][i % 4],
      }))
    }
    return [
      { time: '10:00', title: 'אלגברה לינארית',         meta: 'הרצאה · בניין 28, חדר 101', color: '#8b5cf6' },
      { time: '12:00', title: 'חדו"א 2 — תרגול',         meta: 'אלון מן · בניין 32',        color: '#d97706' },
      { time: '14:00', title: 'מבני נתונים',             meta: 'ד"ר אבני · בניין 90',       color: '#0d9488' },
      { time: '16:30', title: 'פגישה — קבוצת פרויקט',     meta: 'עם Avi · ספרייה',            color: '#6366f1' },
    ]
  }, [db])

  const assignments = useMemo(() => {
    const real = (db?.assignments ?? []).filter((a: any) => !a.is_completed).slice(0, 4)
    if (real.length) {
      return real.map((a: any) => ({
        title: a.title ?? a.name ?? 'מטלה',
        meta: a.due_date ? `דדליין ${a.due_date.slice(0, 10)}` : '',
        tag: a.priority === 'high' ? 'דחוף' : a.priority === 'medium' ? 'השבוע' : 'בעבודה',
        tagClass: a.priority === 'high' ? 't-rose' : a.priority === 'medium' ? 't-amber' : 't-blue',
        color: '#d97706',
      }))
    }
    return [
      { title: 'בוחן — חדו"א 2',              meta: 'מחר · בניין 28 · 90 דק\'',           tag: 'דחוף',    tagClass: 't-rose',  color: '#d97706' },
      { title: 'תרגיל 4 — אלגברה',            meta: 'שישי 23:59 · 15 שאלות',              tag: 'השבוע',   tagClass: 't-amber', color: '#8b5cf6' },
      { title: 'פרויקט סופי — מבני נתונים',    meta: '17 במאי · זוגי עם Avi · 35%',         tag: 'בעבודה',  tagClass: 't-blue',  color: '#0d9488' },
      { title: 'קריאה — פסיכולוגיה',           meta: '5 ימים · פרק 4-5',                    tag: 'לקרוא',   tagClass: 't-soft',  color: '#e11d48' },
    ]
  }, [db])

  const todos = useMemo(() => {
    const real = (db?.todos ?? []).filter((t: any) => !t.is_completed).slice(0, 4)
    if (real.length) {
      return real.map((t: any) => ({ title: t.title, meta: t.note ?? '', tag: t.due ?? '', tagClass: 't-soft' }))
    }
    return [
      { title: 'בוחן — חדו"א 2',           meta: 'בניין 28, חדר 101',          tag: 'מחר',     tagClass: 't-rose' },
      { title: 'תרגיל 4 — אלגברה',         meta: '15 שאלות · Moodle',           tag: 'שישי',    tagClass: 't-amber' },
      { title: 'פרויקט סופי — מבני',       meta: 'זוגי · 35% הושלם',            tag: '12 ימים', tagClass: 't-blue' },
      { title: 'קריאה — פסיכולוגיה',       meta: 'פרק 4-5',                     tag: '5 ימים',  tagClass: 't-soft' },
    ]
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
              <h1 className="dash-h1">
                שלום {greetName}, השבוע שלך{' '}
                <span className="accent">
                  {Array.from(ACCENT_WORD).map((ch, i) => (
                    <span className="letter" key={i} style={{ animationDelay: `${i * 0.12}s` }}>{ch}</span>
                  ))}
                </span>
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
            <CalendarWeekPlaceholder />
          </div>

          {/* ===== BOTTOM 3 CARDS ===== */}
          <div className="bottom-row-v2">
            <div className="dcard">
              <div className="dcard-head">
                <h3>היום בלוח <span className="badge-num">{todaySchedule.length} שיעורים</span></h3>
                <Link href="/tasks">השבוע →</Link>
              </div>
              {todaySchedule.map((row, i) => (
                <div className="sch-row" key={i}>
                  <div className="sch-time">{row.time}</div>
                  <div className="sch-bar" style={{ background: row.color }} />
                  <div className="sch-info">
                    <strong>{row.title}</strong>
                    <small>{row.meta}</small>
                  </div>
                </div>
              ))}
            </div>

            <div className="dcard">
              <div className="dcard-head">
                <h3>מטלות ועבודות <span className="badge-num">{assignments.length} פעילות</span></h3>
                <Link href="/tasks">הכל →</Link>
              </div>
              {assignments.map((a, i) => (
                <div className="course" key={i}>
                  <div className="course-bar" style={{ background: a.color }} />
                  <div className="course-info">
                    <strong>{a.title}</strong>
                    <small>{a.meta}</small>
                  </div>
                  <div className={`course-tag ${a.tagClass}`}>{a.tag}</div>
                </div>
              ))}
            </div>

            <div className="dcard">
              <div className="dcard-head">
                <h3>משימות <span className="badge-num">{todos.length} פעילות</span></h3>
                <Link href="/todos">הוספה +</Link>
              </div>
              {todos.map((t, i) => (
                <div className="task" key={i}>
                  <div className="checkbox" aria-hidden />
                  <div className="task-info">
                    <strong>{t.title}</strong>
                    <small>{t.meta}</small>
                  </div>
                  <div className={`task-tag ${t.tagClass}`}>{t.tag}</div>
                </div>
              ))}
            </div>
          </div>

        </div>
      </main>
    </div>
  )
}

/**
 * Static-mockup week-view grid. Real Google Calendar embedding lives in a
 * follow-up; the visual structure (50px gutter + 7 day columns + 9 hour
 * rows + sample events) matches the mockup so the page reads as designed
 * even on a brand-new account.
 */
function CalendarWeekPlaceholder() {
  const today = new Date()
  const dow = today.getDay()
  const weekStart = new Date(today)
  weekStart.setDate(today.getDate() - dow)

  const DAYS = ['א\'', 'ב\'', 'ג\'', 'ד\'', 'ה\'', 'ו\'', 'ש\'']
  const HOURS = [9, 10, 11, 12, 13, 14, 15]

  // Sample events — same set as the mockup so the page looks lived-in.
  const SAMPLE_EVENTS: Record<string, { title: string; color: string; meta?: string }> = {
    '0-9':  { title: 'אלגברה', color: 'ev-purple', meta: '28-101' },
    '1-9':  { title: 'בוחן חדו"א', color: 'ev-rose', meta: '09:00' },
    '3-9':  { title: 'אלגברה', color: 'ev-purple' },
    '2-10': { title: 'חדו"א 2', color: 'ev-amber', meta: 'תרגול' },
    '4-10': { title: 'פגישת פרויקט', color: 'ev-blue' },
    '0-11': { title: 'חדו"א 2', color: 'ev-amber' },
    '3-11': { title: 'מבני נתונים', color: 'ev-green' },
    '1-12': { title: 'מבני נתונים', color: 'ev-green' },
    '0-13': { title: 'פסיכולוגיה', color: 'ev-blue' },
    '2-13': { title: 'אלגברה', color: 'ev-purple', meta: 'תרגול' },
    '3-14': { title: 'חדו"א 2', color: 'ev-amber' },
    '2-15': { title: 'פסיכולוגיה', color: 'ev-blue', meta: 'תרגול' },
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

      <div className="cal-body">
        {HOURS.flatMap(h => [
          <div key={`t-${h}`} className="cal-time">{pad2(h)}:00</div>,
          ...Array.from({ length: 7 }, (_, di) => {
            const ev = SAMPLE_EVENTS[`${di}-${h}`]
            return (
              <div key={`c-${di}-${h}`} className="cal-cell">
                {ev && (
                  <div className={`cal-event ${ev.color}`}>
                    {ev.title}
                    {ev.meta && <small>{ev.meta}</small>}
                  </div>
                )}
              </div>
            )
          }),
        ])}
      </div>
    </>
  )
}
