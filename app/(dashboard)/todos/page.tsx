'use client'

/**
 * /todos — personal todo list (v3 locked design).
 *
 * Source: teepo-design/mockup_todos.html. Layout:
 *   1. page-head: eyebrow + h1 ("N משימות <accent>להיום</accent>.")
 *      + 4 summary pills (היום · השבוע · בהמשך · הושלמו היום)
 *   2. quick-add input with a "+" button on the left, Enter-to-add hint
 *   3. 4 sections by urgency: היום · השבוע · בהמשך · הושלמו היום.
 *      Each section head: emoji icon + label + count chip.
 *      Each row: animated checkbox, title + optional course tag, due pill.
 *
 * Distinct from /tasks (academic assignments). Data source is `db.tasks`
 * (StudyTask in types/index.ts).
 */

import { useCallback, useMemo, useState } from 'react'
import Link from 'next/link'
import { Plus, Check, BookOpen } from 'lucide-react'
import { useDB } from '@/lib/db-context'
import type { StudyTask } from '@/types'

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

function formatDueLabel(task: StudyTask, bucket: Bucket): string {
  if (bucket === 'done') {
    if (task.completed_at) {
      const d = new Date(task.completed_at)
      if (!Number.isNaN(d.getTime())) {
        return `הושלם · ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
      }
    }
    return 'הושלם'
  }
  const d = daysFromNow(task)
  if (d == null) return 'ללא תאריך'
  if (d < 0) return `איחור ${Math.abs(d)} ימים`
  if (d === 0) return 'היום'
  if (d === 1) return 'מחר'
  if (d <= 7) return `בעוד ${d} ימים`
  return new Date(task.scheduled_date!).toLocaleDateString('he-IL', { day: 'numeric', month: 'short' })
}

/** Section meta — icon + label, mirrors the mockup's 4-section structure. */
const SECTIONS: Array<{ key: Bucket; label: string; icon: string }> = [
  { key: 'today', label: 'להיום',       icon: '🔥' },
  { key: 'week',  label: 'השבוע',       icon: '📅' },
  { key: 'later', label: 'בהמשך',       icon: '💭' },
  { key: 'done',  label: 'הושלמו היום', icon: '✅' },
]

export default function TodosPage() {
  const { db, createTask, updateTask } = useDB() as any
  const [draft, setDraft] = useState('')

  const tasks: StudyTask[] = useMemo(() => db?.tasks ?? [], [db?.tasks])

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

  // H1 accent word follows the relative time of the first-due open task.
  // "4 משימות להיום." if there are due-today items; else "השבוע" or
  // "בהמשך" so the headline always describes the closest open work.
  const accentWord = buckets.today.length > 0 ? 'להיום'
    : buckets.week.length  > 0 ? 'השבוע'
    : buckets.later.length > 0 ? 'בהמשך'
    :                            'נקיות'
  const openCount = buckets.today.length + buckets.week.length + buckets.later.length
  const headlineNoun = openCount === 1 ? 'משימה' : 'משימות'
  const headlineNumber = openCount > 0 ? openCount : 'כל ה'

  return (
    <div className="cream-page todos-page">
      <main className="todos-main">

        <header className="todos-head">
          <div className="todos-eyebrow">המשימות שלי</div>
          <h1 className="todos-h1">
            {headlineNumber} {headlineNoun} <span className="accent">{accentWord}</span>.
          </h1>
          <div className="todos-summary">
            <span className="pill today">היום · <span className="num">{buckets.today.length}</span></span>
            <span className="pill">השבוע · <span className="num">{buckets.week.length}</span></span>
            <span className="pill">בהמשך · <span className="num">{buckets.later.length}</span></span>
            <span className="pill done">הושלמו היום · <span className="num">{buckets.done.length}</span></span>
          </div>
        </header>

        <form
          className="todos-quick-add"
          onSubmit={(e) => { e.preventDefault(); onAdd() }}
        >
          <button type="submit" className="plus-btn" aria-label="הוסף משימה">
            <Plus size={18} />
          </button>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder='הוסף משימה חדשה... (לדוגמה: לסקור פרק 4 לפני המבחן)'
            aria-label="משימה חדשה"
          />
          <div className="hint">
            <kbd>Enter</kbd> להוספה
          </div>
        </form>

        {SECTIONS.map(({ key, label, icon }) => {
          const items = buckets[key]
          // Hide the "הושלמו" section entirely when empty — same as the
          // mockup which only renders the completed list when there's
          // actually something there to celebrate.
          if (key === 'done' && items.length === 0) return null
          return (
            <section className={`todo-section section-${key}`} key={key}>
              <div className="todo-section-head">
                <span className="todo-section-icon" aria-hidden>{icon}</span>
                <h2 className="todo-section-label">{label}</h2>
                <span className="todo-section-count">
                  {items.length} {items.length === 1 ? 'משימה' : 'משימות'}
                </span>
              </div>
              {items.length === 0 ? (
                <div className="todo-empty">אין משימות כאן</div>
              ) : (
                <ul className="todo-list">
                  {items.map(t => (
                    <li key={t.id} className={`todo-item ${t.is_completed ? 'done' : ''}`}>
                      <button
                        type="button"
                        className="todo-check"
                        onClick={() => onToggle(t)}
                        aria-pressed={t.is_completed}
                        aria-label={t.is_completed ? 'סמן כלא הושלם' : 'סמן כהושלם'}
                      >
                        {t.is_completed && <Check size={14} strokeWidth={3.5} />}
                      </button>
                      <div className="todo-body">
                        <strong>{t.title}</strong>
                        {(t.description || t.course_id) && (
                          <small>
                            {t.course_id && (
                              <Link href={`/courses/${t.course_id}`} className="todo-course-tag">
                                <BookOpen size={11} /> קורס
                              </Link>
                            )}
                            {t.description && <span>{t.description}</span>}
                          </small>
                        )}
                      </div>
                      <span className={`todo-due ${key}`}>{formatDueLabel(t, key)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )
        })}

      </main>
    </div>
  )
}
