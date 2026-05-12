'use client'

/**
 * /todos — personal todo list (v2 NEW page).
 *
 * Source: teepo-design/mockup_todos.html. Layout:
 *   1. page-head with eyebrow + h1 + summary pills.
 *   2. quick-add input at top with a `+` button.
 *   3. 4 sections by urgency: היום · השבוע · בהמשך · הושלמו.
 *      Each item: animated checkbox, title + optional course tag, meta,
 *      due-date pill.
 *
 * Distinct from /tasks (academic assignments). Data source is `db.tasks`
 * (StudyTask in types/index.ts) — same shape the legacy /tasks page used.
 * The legacy page keeps its kanban-by-category view; this page bins by
 * urgency and is the canonical "personal משימות" surface going forward.
 */

import { useState, useMemo, useCallback } from 'react'
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

function formatDueLabel(task: StudyTask): string {
  const d = daysFromNow(task)
  if (d == null) return 'ללא תאריך'
  if (d < 0) return `איחור ${Math.abs(d)} ימים`
  if (d === 0) return 'היום'
  if (d === 1) return 'מחר'
  if (d <= 7) return `בעוד ${d} ימים`
  return new Date(task.scheduled_date!).toLocaleDateString('he-IL', { day: 'numeric', month: 'short' })
}

const BUCKETS: { key: Bucket; label: string; eyebrow: string }[] = [
  { key: 'today', label: 'היום',   eyebrow: 'דחוף' },
  { key: 'week',  label: 'השבוע',  eyebrow: 'בקרוב' },
  { key: 'later', label: 'בהמשך',  eyebrow: 'בלי דדליין' },
  { key: 'done',  label: 'הושלמו', eyebrow: 'סיכומים' },
]

export default function TodosPage() {
  const { db, createTask, updateTask } = useDB() as any
  const [draft, setDraft] = useState('')

  const tasks: StudyTask[] = useMemo(() => db?.tasks ?? [], [db?.tasks])

  const buckets = useMemo(() => {
    const out: Record<Bucket, StudyTask[]> = { today: [], week: [], later: [], done: [] }
    for (const t of tasks) out[bucketize(t)].push(t)
    // Inside each bucket, sort by date ascending (done by completed_at descending).
    out.today.sort((a, b) => (a.scheduled_date ?? '').localeCompare(b.scheduled_date ?? ''))
    out.week.sort((a, b) => (a.scheduled_date ?? '').localeCompare(b.scheduled_date ?? ''))
    out.later.sort((a, b) => (a.scheduled_date ?? '').localeCompare(b.scheduled_date ?? ''))
    out.done.sort((a, b) => (b.completed_at ?? '').localeCompare(a.completed_at ?? ''))
    return out
  }, [tasks])

  const summary = useMemo(() => ({
    open: buckets.today.length + buckets.week.length + buckets.later.length,
    today: buckets.today.length,
    done: buckets.done.length,
  }), [buckets])

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

  return (
    <div className="cream-page todos-page">
      <main className="todos-main">

        <header className="todos-head">
          <div className="todos-eyebrow">המשימות שלי</div>
          <h1 className="todos-h1">
            <span className="accent">משימות</span> אישיות.
          </h1>
          <div className="todos-summary">
            <span className="pill today"><span className="num">{summary.open}</span> פעילות</span>
            <span className="pill done"><span className="num">{summary.today}</span> להיום</span>
            <span className="pill">
              <span className="num">{summary.done}</span> הושלמו
            </span>
          </div>
        </header>

        <form
          className="todos-quick-add"
          onSubmit={(e) => { e.preventDefault(); onAdd() }}
        >
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="הוסיפו משימה — Enter לשמירה"
            aria-label="משימה חדשה"
          />
          <button type="submit" aria-label="הוסף משימה">
            <Plus size={16} />
          </button>
        </form>

        {BUCKETS.map(({ key, label, eyebrow }) => {
          const items = buckets[key]
          if (key === 'done' && items.length === 0) return null
          return (
            <section className="todo-section" key={key}>
              <div className="todo-section-head">
                <span className="todo-section-eyebrow">{eyebrow}</span>
                <h2>{label}<span className="todo-section-count">{items.length}</span></h2>
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
                        {t.is_completed && <Check size={12} strokeWidth={3} />}
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
                      <span className={`todo-due ${key}`}>{formatDueLabel(t)}</span>
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
