'use client'

/**
 * /todos — personal todo list (locked design v2).
 *
 * Source: teepo-design/mockup_todos.html. Layout (top → bottom):
 *   1. page-head: eyebrow + h1 ("N משימות <accent>להיום</accent>.")
 *      + 4 summary pills (היום · השבוע · בהמשך · הושלמו היום)
 *   2. quick-add input with a "+" button on the right, Enter-to-add hint
 *   3. Four sections by urgency: היום · השבוע · בהמשך · הושלמו היום.
 *      Each section head: emoji icon + label + count chip.
 *      Each row: animated checkbox, title + optional course tag, meta,
 *      due-date pill, and an "×" delete button visible on hover.
 *
 * Distinct from /tasks (academic assignments). Data source is `db.tasks`
 * (StudyTask in types/index.ts) — yes, the DB field is called `tasks`
 * for personal todos despite the route being `/todos`. Legacy naming.
 *
 * All mechanics — db.tasks read, createTask, updateTask, deleteTask,
 * bucketization, and sort — are unchanged from the prior version; this
 * commit only swaps the markup + class namespace to .todos-v2-* and
 * layers framer-motion stagger-in animations on each row.
 */

import { useCallback, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Plus, Check, X } from 'lucide-react'
import { useDB } from '@/lib/db-context'
import type { Course, StudyTask } from '@/types'

// ──────────────────────────────────────────────────────────────────────
// Course color palette — same deterministic rotation used by /tasks and
// /summaries so a given course always reads in the same color across the
// app. Keeps the cream design language consistent.
// ──────────────────────────────────────────────────────────────────────
const COURSE_COLORS = [
  '#d97706', // amber
  '#8b5cf6', // violet
  '#0d9488', // teal
  '#e11d48', // rose
  '#6366f1', // indigo
  '#16a34a', // green
] as const

/** Deterministic palette index from any string (course id). */
function colorFor(key: string): string {
  let h = 0
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0
  return COURSE_COLORS[Math.abs(h) % COURSE_COLORS.length]
}

/** Days from today to the task's scheduled_date. Null = no date set. */
function daysFromNow(task: StudyTask): number | null {
  if (!task.scheduled_date) return null
  const target = new Date(task.scheduled_date)
  if (Number.isNaN(target.getTime())) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  target.setHours(0, 0, 0, 0)
  return Math.round((target.getTime() - today.getTime()) / 86_400_000)
}

type Bucket = 'today' | 'week' | 'later' | 'done'

function bucketize(task: StudyTask): Bucket {
  if (task.is_completed) return 'done'
  const d = daysFromNow(task)
  if (d == null) return 'later'
  if (d <= 0) return 'today'
  if (d <= 7) return 'week'
  return 'later'
}

const HEB_DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת']
const HEB_MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר']

/** Human-readable due label + tone. Tones mirror the mockup pill colors. */
function dueLabelFor(task: StudyTask, bucket: Bucket): { label: string; tone: 'urgent' | 'soon' | 'later' | 'done' } {
  if (bucket === 'done') {
    if (task.completed_at) {
      const d = new Date(task.completed_at)
      if (!Number.isNaN(d.getTime())) {
        const hh = String(d.getHours()).padStart(2, '0')
        const mm = String(d.getMinutes()).padStart(2, '0')
        return { label: `הושלם · ${hh}:${mm}`, tone: 'done' }
      }
    }
    return { label: 'הושלם', tone: 'done' }
  }
  const d = daysFromNow(task)
  if (d == null) return { label: 'ללא תאריך', tone: 'later' }
  if (d < 0) return { label: `איחור · ${Math.abs(d)} ימים`, tone: 'urgent' }
  const dateObj = new Date(task.scheduled_date!)
  const hh = String(dateObj.getHours()).padStart(2, '0')
  const mm = String(dateObj.getMinutes()).padStart(2, '0')
  const hasTime = !(dateObj.getHours() === 0 && dateObj.getMinutes() === 0)
  const timeStr = hasTime ? `${hh}:${mm}` : ''
  if (d === 0) return { label: hasTime ? `היום · ${timeStr}` : 'היום', tone: 'urgent' }
  if (d === 1) return { label: hasTime ? `מחר · ${timeStr}` : 'מחר', tone: 'urgent' }
  if (d <= 7) {
    const day = HEB_DAYS[dateObj.getDay()]
    return { label: hasTime ? `${day} · ${timeStr}` : day, tone: 'soon' }
  }
  return { label: `${dateObj.getDate()} ב${HEB_MONTHS[dateObj.getMonth()]}`, tone: 'later' }
}

/** Build the small grey meta string under the title (duration · description). */
function metaPiecesFor(task: StudyTask): string[] {
  const out: string[] = []
  if (task.duration_minutes && task.duration_minutes > 0) {
    out.push(`⏱ ${task.duration_minutes} דק׳`)
  }
  if (task.description && task.description.trim()) {
    out.push(task.description.trim())
  }
  return out
}

/** Section meta — icon + label, mirrors the mockup's 4-section structure. */
const SECTIONS: Array<{ key: Bucket; label: string; icon: string }> = [
  { key: 'today', label: 'להיום',       icon: '🔥' },
  { key: 'week',  label: 'השבוע',       icon: '📅' },
  { key: 'later', label: 'בהמשך',       icon: '💭' },
  { key: 'done',  label: 'הושלמו היום', icon: '✅' },
]

export default function TodosPage() {
  const { db, createTask, updateTask, deleteTask } = useDB() as any
  const [draft, setDraft] = useState('')

  const tasks: StudyTask[] = useMemo(() => db?.tasks ?? [], [db?.tasks])
  const courseById = useMemo(() => {
    const m = new Map<string, Course>()
    for (const c of (db?.courses ?? []) as Course[]) m.set(c.id, c)
    return m
  }, [db?.courses])

  const buckets = useMemo(() => {
    const out: Record<Bucket, StudyTask[]> = { today: [], week: [], later: [], done: [] }
    for (const t of tasks) out[bucketize(t)].push(t)
    // Inside each bucket, sort by date asc (done sorted by completed_at desc).
    out.today.sort((a, b) => (a.scheduled_date ?? '').localeCompare(b.scheduled_date ?? ''))
    out.week.sort((a, b) => (a.scheduled_date ?? '').localeCompare(b.scheduled_date ?? ''))
    out.later.sort((a, b) => (a.scheduled_date ?? '').localeCompare(b.scheduled_date ?? ''))
    out.done.sort((a, b) => (b.completed_at ?? '').localeCompare(a.completed_at ?? ''))
    return out
  }, [tasks])

  const onAdd = useCallback(async () => {
    const title = draft.trim()
    if (!title) return
    setDraft('')
    if (typeof createTask === 'function') {
      try { await createTask({ title, category: 'study', is_completed: false }) } catch {}
    }
  }, [draft, createTask])

  const onToggle = useCallback(async (task: StudyTask) => {
    if (typeof updateTask !== 'function') return
    try {
      await updateTask(task.id, {
        is_completed: !task.is_completed,
        completed_at: !task.is_completed ? new Date().toISOString() : undefined,
      })
    } catch {}
  }, [updateTask])

  const onDelete = useCallback(async (task: StudyTask) => {
    if (typeof deleteTask !== 'function') return
    try { await deleteTask(task.id) } catch {}
  }, [deleteTask])

  // H1 accent word follows the relative time of the first-due open task.
  // "4 משימות להיום." if there are due-today items; else "השבוע" or
  // "בהמשך" so the headline always describes the closest open work.
  const accentWord = buckets.today.length > 0 ? 'להיום'
    : buckets.week.length  > 0 ? 'השבוע'
    : buckets.later.length > 0 ? 'בהמשך'
    :                            'נקיות'
  const openCount = buckets.today.length + buckets.week.length + buckets.later.length
  const headlineNoun = openCount === 1 ? 'משימה' : 'משימות'
  const headlineNumber: string | number = openCount > 0 ? openCount : 'כל ה'

  return (
    <div className="cream-page todos-v2">
      <main className="todos-v2-main">

        {/* ===== PAGE HEAD ===== */}
        <header className="todos-v2-head">
          <div className="todos-v2-eyebrow">המשימות שלי</div>
          <h1 className="todos-v2-h1">
            {headlineNumber} {headlineNoun} <span className="accent">{accentWord}</span>.
          </h1>
          <div className="todos-v2-summary">
            <span className="todos-v2-pill today">היום · <span className="num">{buckets.today.length}</span></span>
            <span className="todos-v2-pill">השבוע · <span className="num">{buckets.week.length}</span></span>
            <span className="todos-v2-pill">בהמשך · <span className="num">{buckets.later.length}</span></span>
            <span className="todos-v2-pill done">הושלמו היום · <span className="num">{buckets.done.length}</span></span>
          </div>
        </header>

        {/* ===== QUICK ADD ===== */}
        <form
          className="todos-v2-quick-add"
          onSubmit={(e) => { e.preventDefault(); onAdd() }}
        >
          <button type="submit" className="todos-v2-plus-btn" aria-label="הוסף משימה">
            <Plus size={18} strokeWidth={2.5} />
          </button>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="הוסף משימה חדשה... (לדוגמה: לסקור פרק 4 לפני המבחן)"
            aria-label="משימה חדשה"
          />
          <div className="todos-v2-hint" aria-hidden>
            <kbd>Enter</kbd> להוספה
          </div>
        </form>

        {/* ===== SECTIONS ===== */}
        {SECTIONS.map(({ key, label, icon }, sectionIdx) => {
          const items = buckets[key]
          // Hide the "הושלמו" section entirely when empty — same as the
          // mockup which only renders the completed list when there's
          // actually something there to celebrate.
          if (key === 'done' && items.length === 0) return null
          return (
            <motion.section
              key={key}
              className={`todos-v2-section todos-v2-section-${key}`}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, delay: 0.35 + sectionIdx * 0.1, ease: 'easeOut' }}
            >
              <div className="todos-v2-section-head">
                <span className="todos-v2-section-icon" aria-hidden>{icon}</span>
                <h2 className="todos-v2-section-label">{label}</h2>
                <span className="todos-v2-section-count">
                  {items.length} {items.length === 1 ? 'משימה' : 'משימות'}
                </span>
              </div>
              {items.length === 0 ? (
                <div className="todos-v2-empty">
                  <span className="em" aria-hidden>📭</span>
                  אין משימות כאן
                </div>
              ) : (
                <ul className="todos-v2-list">
                  <AnimatePresence initial={false}>
                    {items.map((t, idx) => {
                      const due = dueLabelFor(t, key)
                      const course = t.course_id ? courseById.get(t.course_id) ?? null : null
                      const courseColor = course ? colorFor(course.id) : null
                      const metaPieces = metaPiecesFor(t)
                      return (
                        <motion.li
                          key={t.id}
                          className={`todos-v2-item${t.is_completed ? ' done' : ''}`}
                          layout
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: t.is_completed ? 0.7 : 1, x: 0 }}
                          exit={{ opacity: 0, x: -10 }}
                          transition={{ duration: 0.35, delay: Math.min(idx, 6) * 0.07, ease: 'easeOut' }}
                        >
                          <button
                            type="button"
                            role="checkbox"
                            aria-checked={t.is_completed}
                            aria-label={t.is_completed ? `סמן כלא הושלם: ${t.title}` : `סמן כהושלם: ${t.title}`}
                            className="todos-v2-check"
                            onClick={() => onToggle(t)}
                          >
                            <Check size={14} strokeWidth={3.5} aria-hidden />
                          </button>
                          <div className="todos-v2-info">
                            <div className="todos-v2-title">
                              <span className="text">{t.title}</span>
                              {course && courseColor && (
                                <span
                                  className="todos-v2-tag course"
                                  style={{ background: courseColor }}
                                >
                                  {course.title}
                                </span>
                              )}
                            </div>
                            {metaPieces.length > 0 && (
                              <div className="todos-v2-meta">
                                {metaPieces.map((piece, i) => (
                                  <span key={i} className="todos-v2-meta-piece">
                                    {i > 0 && <span className="todos-v2-meta-sep" aria-hidden>·</span>}
                                    <span>{piece}</span>
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                          <span className={`todos-v2-due ${due.tone}`}>{due.label}</span>
                          <button
                            type="button"
                            className="todos-v2-delete"
                            aria-label="מחק משימה"
                            onClick={() => onDelete(t)}
                          >
                            <X size={14} strokeWidth={2.5} aria-hidden />
                          </button>
                        </motion.li>
                      )
                    })}
                  </AnimatePresence>
                </ul>
              )}
            </motion.section>
          )
        })}

      </main>
    </div>
  )
}
