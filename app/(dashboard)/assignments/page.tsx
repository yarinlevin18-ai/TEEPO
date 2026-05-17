'use client'

/**
 * /assignments — master-detail rebuild per `mockups/assignments.html`.
 *
 * Layout:
 *   - Page head: title + green check icon, "סנכרן הכל מ-Moodle" (ghost) +
 *     "מטלה חדשה" (gradient) buttons
 *   - Filter bar: status pills + sort pills + search input
 *   - Two-column split:
 *       - Right (list pane, 380px): flat list, course-color left bar,
 *         title, course dot+name, deadline pill with urgency tone,
 *         optional progress bar from subtasks
 *       - Left (detail pane): course chip + title + source line, 3 meta
 *         cards (deadline / grade weight / estimated time), status &
 *         priority pickers, description box, linked Drive folder panel,
 *         subtasks list, footer with delete + cancel/save
 *
 * The Drive folder panel uses the SELECTED assignment's course's
 * assignments folder (we don't have per-assignment folders yet) — once
 * the user runs sync-all that pulls hw3.pdf into TEEPO/<course>/מטלות,
 * the panel surfaces the files via the existing useDriveFiles hook.
 */

import { useEffect, useMemo, useState } from 'react'
import {
  CheckSquare, Plus, RefreshCw, Search, FileText, BarChart2, Clock,
  Edit, MoreHorizontal, ExternalLink, Upload, Folder, Loader2, CheckCircle2,
  AlertCircle, Sparkles, GripVertical,
} from 'lucide-react'
import { useDB } from '@/lib/db-context'
import { useDriveFiles } from '@/lib/use-drive-files'
import { api } from '@/lib/api-client'
import SyncAllButton from '@/components/sync/SyncAllButton'
import type { Assignment, AssignmentTask, Course } from '@/types'

// ── Helpers ─────────────────────────────────────────────────────────────

// Deterministic palette index — shared with /tasks + /summaries so a
// course's color matches everywhere.
const COURSE_PALETTE = [
  { color: '#e11d48', soft: 'rgba(225,29,72,.10)', deep: '#9f1239' },
  { color: '#0d9488', soft: 'rgba(13,148,136,.10)', deep: '#115e59' },
  { color: '#6366f1', soft: 'rgba(99,102,241,.10)', deep: '#4338ca' },
  { color: '#d97706', soft: 'rgba(217,119,6,.10)', deep: '#92400e' },
  { color: '#8b5cf6', soft: 'rgba(139,92,246,.10)', deep: '#5b21b6' },
  { color: '#16a34a', soft: 'rgba(22,163,74,.10)', deep: '#14532d' },
]

function paletteIdx(key: string): number {
  let h = 0
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0
  return Math.abs(h) % COURSE_PALETTE.length
}

const HEB_MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר']

function daysUntil(deadline?: string): number | null {
  if (!deadline) return null
  const d = new Date(deadline)
  if (Number.isNaN(d.getTime())) return null
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const dd = new Date(d); dd.setHours(0, 0, 0, 0)
  return Math.round((dd.getTime() - today.getTime()) / 86_400_000)
}

interface DuePill {
  label: string
  tone: 'urgent' | 'normal' | 'calm' | 'undated'
}

function duePill(deadline: string | undefined, status: Assignment['status']): DuePill {
  if (status === 'submitted') return { label: 'הוגש', tone: 'calm' }
  if (status === 'graded') return { label: 'נבדק', tone: 'calm' }
  if (!deadline) return { label: 'ללא תאריך', tone: 'undated' }
  const d = new Date(deadline)
  if (Number.isNaN(d.getTime())) return { label: 'ללא תאריך', tone: 'undated' }
  const dn = daysUntil(deadline)!
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  const hasTime = !(d.getHours() === 0 && d.getMinutes() === 0)
  if (dn < 0) return { label: `איחור · ${Math.abs(dn)} ימים`, tone: 'urgent' }
  if (dn === 0) return { label: hasTime ? `היום · ${hh}:${mm}` : 'היום', tone: 'urgent' }
  if (dn === 1) return { label: hasTime ? `מחר · ${hh}:${mm}` : 'מחר', tone: 'urgent' }
  if (dn <= 7) return { label: `בעוד ${dn} ימים`, tone: 'normal' }
  if (dn <= 14) return { label: 'בעוד שבועיים', tone: 'normal' }
  return { label: `${d.getDate()} ב${HEB_MONTHS[d.getMonth()]}`, tone: 'calm' }
}

function formatDateLong(deadline?: string): string {
  if (!deadline) return ''
  const d = new Date(deadline); if (Number.isNaN(d.getTime())) return deadline
  const dn = daysUntil(deadline)
  const dayLabel =
    dn === 0 ? 'היום · ' : dn === 1 ? 'מחר · ' : dn !== null && dn < 0 ? `איחור · ` : ''
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  const time = (d.getHours() || d.getMinutes()) ? `, ${hh}:${mm}` : ''
  return `${dayLabel}${d.getDate()} ב${HEB_MONTHS[d.getMonth()]}${time}`
}

function progressOf(a: Assignment): number {
  const t = a.assignment_tasks ?? []
  if (t.length === 0) return 0
  return Math.round((t.filter(x => x.is_completed).length / t.length) * 100)
}

// Status / priority labels
const STATUS_LABEL: Record<Assignment['status'], string> = {
  todo: 'לא התחלתי',
  in_progress: 'בתהליך',
  submitted: 'הוגש',
  graded: 'נבדק',
}
const PRIORITY_LABEL: Record<Assignment['priority'], string> = {
  high: 'דחוף',
  medium: 'בינוני',
  low: 'נמוך',
}

type StatusFilter = 'all' | Assignment['status']
type SortBy = 'deadline' | 'priority' | 'course'

// ── Page ─────────────────────────────────────────────────────────────────

export default function AssignmentsPage() {
  const { db, ready, createAssignment, updateAssignment, deleteAssignment } = useDB()
  const assignments = (db?.assignments ?? []) as Assignment[]
  const courses = (db?.courses ?? []) as Course[]

  const courseById = useMemo(() => {
    const m = new Map<string, Course>()
    for (const c of courses) m.set(c.id, c)
    return m
  }, [courses])

  // Filter + sort state
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [sortBy, setSortBy] = useState<SortBy>('deadline')
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  // Add form
  const [showAdd, setShowAdd] = useState(false)
  const [addForm, setAddForm] = useState({ title: '', description: '', deadline: '', course_id: '' })
  const [adding, setAdding] = useState(false)

  // Edit buffer for the selected assignment (cancel/save semantics)
  const [editBuffer, setEditBuffer] = useState<Partial<Assignment> | null>(null)

  // Counts per status (drives the filter pill numbers)
  const counts = useMemo(() => {
    const c: Record<StatusFilter, number> = {
      all: assignments.length,
      todo: 0, in_progress: 0, submitted: 0, graded: 0,
    }
    for (const a of assignments) c[a.status]++
    return c
  }, [assignments])

  // Filter + sort the list
  const filtered = useMemo(() => {
    let list = assignments
    if (statusFilter !== 'all') list = list.filter(a => a.status === statusFilter)
    if (query.trim()) {
      const q = query.trim()
      list = list.filter(a => a.title.includes(q) || a.description?.includes(q))
    }
    const sorted = [...list].sort((a, b) => {
      switch (sortBy) {
        case 'deadline': {
          const da = daysUntil(a.deadline) ?? Number.POSITIVE_INFINITY
          const db_ = daysUntil(b.deadline) ?? Number.POSITIVE_INFINITY
          return da - db_
        }
        case 'priority': {
          const ord: Record<Assignment['priority'], number> = { high: 0, medium: 1, low: 2 }
          return ord[a.priority] - ord[b.priority]
        }
        case 'course': {
          const ca = a.course_id ? courseById.get(a.course_id)?.title || '' : ''
          const cb = b.course_id ? courseById.get(b.course_id)?.title || '' : ''
          return ca.localeCompare(cb, 'he')
        }
      }
    })
    return sorted
  }, [assignments, statusFilter, query, sortBy, courseById])

  // Auto-select the first item whenever the visible list changes and the
  // currently-selected one isn't in it.
  useEffect(() => {
    if (filtered.length === 0) { setSelectedId(null); return }
    if (!selectedId || !filtered.find(a => a.id === selectedId)) {
      setSelectedId(filtered[0].id)
    }
  }, [filtered, selectedId])

  const selected = useMemo(
    () => (selectedId ? assignments.find(a => a.id === selectedId) ?? null : null),
    [selectedId, assignments],
  )
  const selectedCourse = selected?.course_id ? courseById.get(selected.course_id) ?? null : null
  const selectedPalette = selected ? COURSE_PALETTE[paletteIdx(selected.course_id || selected.id)] : COURSE_PALETTE[0]

  // Reset edit buffer when selection changes
  useEffect(() => {
    if (!selected) { setEditBuffer(null); return }
    setEditBuffer({
      title: selected.title,
      description: selected.description ?? '',
      status: selected.status,
      priority: selected.priority,
      deadline: selected.deadline,
    })
  }, [selected])

  const isDirty = useMemo(() => {
    if (!selected || !editBuffer) return false
    return (editBuffer.title !== selected.title) ||
      ((editBuffer.description ?? '') !== (selected.description ?? '')) ||
      (editBuffer.status !== selected.status) ||
      (editBuffer.priority !== selected.priority) ||
      ((editBuffer.deadline ?? '') !== (selected.deadline ?? ''))
  }, [editBuffer, selected])

  // ── Handlers ────────────────────────────────────────────────────────────

  const onSaveSelected = async () => {
    if (!selected || !editBuffer || !isDirty) return
    await updateAssignment(selected.id, {
      title: editBuffer.title,
      description: editBuffer.description,
      status: editBuffer.status as Assignment['status'],
      priority: editBuffer.priority as Assignment['priority'],
      deadline: editBuffer.deadline,
    })
  }
  const onCancelEdit = () => {
    if (!selected) return
    setEditBuffer({
      title: selected.title,
      description: selected.description ?? '',
      status: selected.status,
      priority: selected.priority,
      deadline: selected.deadline,
    })
  }
  const onDeleteSelected = async () => {
    if (!selected) return
    if (!confirm(`למחוק את "${selected.title}"?`)) return
    await deleteAssignment(selected.id)
    setSelectedId(null)
  }
  const onToggleSubtask = async (st: AssignmentTask) => {
    if (!selected) return
    const next = (selected.assignment_tasks ?? []).map(x =>
      x.id === st.id ? { ...x, is_completed: !x.is_completed } : x,
    )
    await updateAssignment(selected.id, { assignment_tasks: next })
  }
  const onAddSubtask = async () => {
    if (!selected) return
    const title = window.prompt('שלב חדש:')
    if (!title?.trim()) return
    const next: AssignmentTask[] = [
      ...(selected.assignment_tasks ?? []),
      {
        id: `at_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        assignment_id: selected.id,
        title: title.trim(),
        order_index: (selected.assignment_tasks?.length ?? 0) + 1,
        is_completed: false,
      },
    ]
    await updateAssignment(selected.id, { assignment_tasks: next })
  }

  const onCreate = async () => {
    if (!addForm.title.trim()) return
    setAdding(true)
    try {
      let subtasks: AssignmentTask[] = []
      try {
        const r = await api.assignments.breakdown(addForm.title, addForm.description, addForm.deadline)
        const tasks: any[] = r?.tasks ?? []
        subtasks = tasks.map((t, i) => ({
          id: `at_${Date.now()}_${i}`,
          assignment_id: '',
          title: t.title,
          description: t.description,
          order_index: t.order ?? i + 1,
          is_completed: false,
          estimated_hours: t.estimated_hours,
        }))
      } catch { /* AI down — ship without breakdown */ }
      const created = await createAssignment({
        title: addForm.title.trim(),
        description: addForm.description.trim() || undefined,
        deadline: addForm.deadline || undefined,
        course_id: addForm.course_id || undefined,
        status: 'todo',
        priority: 'medium',
        assignment_tasks: subtasks,
      })
      setAddForm({ title: '', description: '', deadline: '', course_id: '' })
      setShowAdd(false)
      setSelectedId(created.id)
    } finally {
      setAdding(false)
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="cream-page asn-page" dir="rtl">
      <main className="asn-main">

        {/* Page head */}
        <header className="asn-head">
          <div className="asn-title">
            <div className="asn-title-icon" aria-hidden>
              <CheckSquare size={22} />
            </div>
            <h1>המטלות שלי</h1>
          </div>
          <div className="asn-head-actions">
            <SyncAllButton variant="ghost" />
            <button
              type="button"
              className="asn-btn asn-btn-primary"
              onClick={() => setShowAdd(true)}
            >
              <Plus size={15} /> מטלה חדשה
            </button>
          </div>
        </header>

        {/* Filter bar */}
        <section className="asn-filter">
          <span className="asn-filter-label">סטטוס</span>
          {(['all', 'todo', 'in_progress', 'submitted', 'graded'] as const).map(k => {
            const label = k === 'all' ? 'הכל' : STATUS_LABEL[k as Assignment['status']]
            return (
              <button
                key={k}
                type="button"
                className={`asn-filter-pill ${statusFilter === k ? 'on' : ''}`}
                onClick={() => setStatusFilter(k as StatusFilter)}
              >
                {label}
                <span className="asn-filter-pill-count">{counts[k]}</span>
              </button>
            )
          })}
          <div className="asn-filter-divider" />
          <span className="asn-filter-label">מיון</span>
          {(['deadline', 'priority', 'course'] as const).map(k => (
            <button
              key={k}
              type="button"
              className={`asn-filter-pill ${sortBy === k ? 'on' : ''}`}
              onClick={() => setSortBy(k)}
            >
              {k === 'deadline' ? 'תאריך הגשה' : k === 'priority' ? 'עדיפות' : 'קורס'}
            </button>
          ))}
          <div className="asn-filter-search">
            <Search size={14} />
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="חיפוש מטלה…"
            />
          </div>
        </section>

        {/* Master-detail split */}
        <div className="asn-split">

          {/* LIST PANE (right in RTL). Plain div (not <aside>) — the
              dashboard layout's global `html.light aside` rule paints a
              blue-tinted gradient with !important that overrides our
              cream bg. */}
          <div className="asn-list-pane">
            <div className="asn-list-meta">
              מציג <strong>{filtered.length}</strong> מטלות · ממוין לפי{' '}
              <strong>{sortBy === 'deadline' ? 'תאריך הגשה' : sortBy === 'priority' ? 'עדיפות' : 'קורס'}</strong>
            </div>
            {!ready ? (
              <div className="asn-list-skel">
                {[0, 1, 2].map(i => <div key={i} className="asn-skel-row" />)}
              </div>
            ) : filtered.length === 0 ? (
              <div className="asn-empty">
                <FileText size={28} />
                <p>אין מטלות תואמות לסינון</p>
              </div>
            ) : (
              filtered.map(a => {
                const pal = COURSE_PALETTE[paletteIdx(a.course_id || a.id)]
                const course = a.course_id ? courseById.get(a.course_id) : null
                const due = duePill(a.deadline, a.status)
                const pct = progressOf(a)
                return (
                  <button
                    key={a.id}
                    type="button"
                    className={`asn-item ${selectedId === a.id ? 'selected' : ''} ${
                      a.status === 'submitted' || a.status === 'graded' ? 'is-done' : ''
                    }`}
                    onClick={() => setSelectedId(a.id)}
                  >
                    <div className="asn-bar" style={{ background: pal.color }} aria-hidden />
                    <div className="asn-item-main">
                      <div className="asn-item-title">{a.title}</div>
                      <div className="asn-item-meta">
                        <span className="asn-item-course">
                          <span className="asn-item-course-dot" style={{ background: pal.color }} />
                          {course?.title ?? 'ללא קורס'}
                        </span>
                        <span className={`asn-item-due tone-${due.tone}`}>{due.label}</span>
                      </div>
                      {pct > 0 && (
                        <div className="asn-item-progress" aria-label={`התקדמות ${pct}%`}>
                          <div className="asn-item-progress-fill" style={{ width: `${pct}%` }} />
                        </div>
                      )}
                    </div>
                  </button>
                )
              })
            )}
          </div>

          {/* DETAIL PANE */}
          {selected && editBuffer ? (
            <section
              className="asn-detail"
              style={{
                ['--course-color' as any]: selectedPalette.color,
                ['--course-soft' as any]: selectedPalette.soft,
                ['--course-deep' as any]: selectedPalette.deep,
              }}
            >
              <DetailContent
                assignment={selected}
                buffer={editBuffer}
                setBuffer={(p) => setEditBuffer(b => ({ ...b!, ...p }))}
                course={selectedCourse}
                onToggleSubtask={onToggleSubtask}
                onAddSubtask={onAddSubtask}
                onSave={onSaveSelected}
                onCancel={onCancelEdit}
                onDelete={onDeleteSelected}
                isDirty={isDirty}
              />
            </section>
          ) : (
            <section className="asn-detail asn-detail-empty">
              <Sparkles size={42} />
              <h3>בחר מטלה כדי לערוך</h3>
              <p>הרשימה מימין מציגה את כל המטלות הפעילות. לחיצה על מטלה תפתח אותה לעריכה כאן.</p>
            </section>
          )}
        </div>
      </main>

      {/* Add modal */}
      {showAdd && (
        <div
          className="asn-add-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="asn-add-title"
          onClick={e => { if (e.target === e.currentTarget) setShowAdd(false) }}
        >
          <div className="asn-add-modal">
            <header className="asn-add-head">
              <h2 id="asn-add-title">מטלה חדשה</h2>
              <button type="button" onClick={() => setShowAdd(false)} aria-label="סגור">×</button>
            </header>
            <div className="asn-add-body">
              <label>
                <span>שם המטלה *</span>
                <input
                  type="text"
                  value={addForm.title}
                  onChange={e => setAddForm({ ...addForm, title: e.target.value })}
                  placeholder="לדוגמה: תרגיל בית 3 — עצים בינאריים"
                  autoFocus
                />
              </label>
              <label>
                <span>קורס</span>
                <select
                  value={addForm.course_id}
                  onChange={e => setAddForm({ ...addForm, course_id: e.target.value })}
                >
                  <option value="">— בחר קורס —</option>
                  {courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
                </select>
              </label>
              <label>
                <span>תאריך הגשה</span>
                <input
                  type="datetime-local"
                  value={addForm.deadline}
                  onChange={e => setAddForm({ ...addForm, deadline: e.target.value })}
                />
              </label>
              <label>
                <span>תיאור (אופציונלי)</span>
                <textarea
                  rows={3}
                  value={addForm.description}
                  onChange={e => setAddForm({ ...addForm, description: e.target.value })}
                  placeholder="מה צריך לעשות? נשתמש בזה כדי לפרק לשלבים אוטומטית."
                />
              </label>
            </div>
            <footer className="asn-add-foot">
              <button type="button" className="asn-btn asn-btn-ghost" onClick={() => setShowAdd(false)}>
                ביטול
              </button>
              <button
                type="button"
                className="asn-btn asn-btn-primary"
                onClick={onCreate}
                disabled={!addForm.title.trim() || adding}
              >
                {adding ? <Loader2 size={15} className="sync-icon-spin" /> : <Sparkles size={15} />}
                {adding ? 'מפרק…' : 'צור + פרק לשלבים'}
              </button>
            </footer>
          </div>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Detail content — extracted so the parent stays readable.
// ─────────────────────────────────────────────────────────────────────────

function DetailContent({
  assignment, buffer, setBuffer, course,
  onToggleSubtask, onAddSubtask, onSave, onCancel, onDelete, isDirty,
}: {
  assignment: Assignment
  buffer: Partial<Assignment>
  setBuffer: (p: Partial<Assignment>) => void
  course: Course | null
  onToggleSubtask: (st: AssignmentTask) => void
  onAddSubtask: () => void
  onSave: () => void
  onCancel: () => void
  onDelete: () => void
  isDirty: boolean
}) {
  const subtasks = assignment.assignment_tasks ?? []
  const hoursEst = subtasks.reduce((s, st) => s + (st.estimated_hours ?? 0), 0)
  const driveFolderId = course?.drive_folder_ids?.assignments
  const courseDisplayName = course?.title ?? 'ללא קורס'

  return (
    <>
      {/* Head */}
      <div className="asn-detail-head">
        <div className="asn-detail-title-block">
          <div className="asn-detail-course">
            <span className="dot" aria-hidden />
            {courseDisplayName}
          </div>
          <h2>{assignment.title}</h2>
          <div className="asn-detail-source">
            {assignment.deadline ? <>הגשה: <strong>{formatDateLong(assignment.deadline)}</strong></> : 'ללא תאריך הגשה'}
          </div>
        </div>
        <div className="asn-detail-actions">
          <button type="button" className="asn-icon-btn" title="עוד">
            <MoreHorizontal size={16} />
          </button>
        </div>
      </div>

      {/* Meta row */}
      <div className="asn-meta-row">
        <div className="asn-meta-card deadline">
          <div className="asn-meta-label">תאריך הגשה</div>
          <div className="asn-meta-value">
            <Clock size={14} />
            {assignment.deadline ? formatDateLong(assignment.deadline) : '—'}
          </div>
        </div>
        <div className="asn-meta-card">
          <div className="asn-meta-label">משקל מהציון</div>
          <div className="asn-meta-value">
            <BarChart2 size={14} />
            {/* Not in the type yet — placeholder */}
            —
          </div>
        </div>
        <div className="asn-meta-card">
          <div className="asn-meta-label">זמן משוער</div>
          <div className="asn-meta-value">
            <Clock size={14} />
            {hoursEst > 0 ? `${hoursEst} שעות` : '—'}
          </div>
        </div>
      </div>

      {/* Status + priority pickers */}
      <section className="asn-section">
        <header className="asn-section-head">
          <h3><CheckCircle2 size={16} /> סטטוס ועדיפות</h3>
        </header>
        <div className="asn-pickers">
          <div className="asn-picker-row">
            {(['todo', 'in_progress', 'submitted', 'graded'] as const).map(s => (
              <button
                key={s}
                type="button"
                className={`asn-status-opt ${buffer.status === s ? 'on' : ''}`}
                onClick={() => setBuffer({ status: s })}
              >
                <span className="sdot" aria-hidden />
                {STATUS_LABEL[s]}
              </button>
            ))}
          </div>
          <div className="asn-picker-row">
            {(['high', 'medium', 'low'] as const).map(p => (
              <button
                key={p}
                type="button"
                className={`asn-status-opt asn-priority-opt ${buffer.priority === p ? `on ${p === 'high' ? 'high' : p === 'medium' ? 'med' : 'low'}` : ''}`}
                onClick={() => setBuffer({ priority: p })}
              >
                <span className="sdot" aria-hidden />
                {PRIORITY_LABEL[p]}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Description */}
      <section className="asn-section">
        <header className="asn-section-head">
          <h3><FileText size={16} /> תיאור המטלה</h3>
        </header>
        <textarea
          className="asn-desc-box"
          value={buffer.description ?? ''}
          onChange={e => setBuffer({ description: e.target.value })}
          rows={5}
          placeholder="הוסף תיאור — מה צריך להגיש, באיזה פורמט, באילו שאלות להתמקד…"
        />
      </section>

      {/* Drive folder */}
      <section className="asn-section">
        <header className="asn-section-head">
          <h3><Folder size={16} /> תיקיית Drive מקושרת</h3>
        </header>
        {driveFolderId ? (
          <DrivePanel folderId={driveFolderId} courseTitle={courseDisplayName} assignmentTitle={assignment.title} />
        ) : (
          <button type="button" className="asn-drive-cta">
            <Folder size={20} />
            <span>+ קישור לתיקייה ב-Drive — סווג קודם את הקורס</span>
          </button>
        )}
      </section>

      {/* Subtasks */}
      <section className="asn-section">
        <header className="asn-section-head">
          <h3><CheckCircle2 size={16} /> פירוק למשימות</h3>
          <button type="button" className="asn-section-link" onClick={onAddSubtask}>+ הוסף שלב</button>
        </header>
        {subtasks.length === 0 ? (
          <div className="asn-subtask-empty">אין שלבים עדיין. השתמש ב-AI כדי לפרק את המטלה לשלבים, או הוסף ידנית.</div>
        ) : (
          <ul className="asn-subtasks">
            {subtasks.map(st => (
              <li key={st.id} className={`asn-subtask ${st.is_completed ? 'done' : ''}`}>
                <button
                  type="button"
                  className={`asn-checkbox ${st.is_completed ? 'checked' : ''}`}
                  onClick={() => onToggleSubtask(st)}
                  aria-label={st.is_completed ? 'בטל סימון' : 'סמן כהושלם'}
                >
                  {st.is_completed && <CheckCircle2 size={11} />}
                </button>
                <GripVertical size={13} className="asn-subtask-grip" />
                <span className="asn-subtask-title">{st.title}</span>
                {typeof st.estimated_hours === 'number' && st.estimated_hours > 0 && (
                  <span className="asn-subtask-hours">~{st.estimated_hours} שעות</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Footer */}
      <footer className="asn-detail-foot">
        <button type="button" className="asn-danger-link" onClick={onDelete}>מחק מטלה</button>
        <div className="asn-detail-foot-right">
          <button
            type="button"
            className="asn-btn asn-btn-ghost"
            onClick={onCancel}
            disabled={!isDirty}
          >
            בטל שינויים
          </button>
          <button
            type="button"
            className="asn-btn asn-btn-primary"
            onClick={onSave}
            disabled={!isDirty}
          >
            שמור
          </button>
        </div>
      </footer>
    </>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Drive panel — uses the existing useDriveFiles hook to render real files.
// ─────────────────────────────────────────────────────────────────────────

function DrivePanel({
  folderId, courseTitle, assignmentTitle,
}: {
  folderId: string
  courseTitle: string
  assignmentTitle: string
}) {
  const { files, loading, error } = useDriveFiles(folderId)
  const previewFiles = files?.slice(0, 6) ?? []
  return (
    <div className="asn-drive-panel">
      <div className="asn-drive-head">
        <div className="asn-drive-folder">
          <div className="asn-drive-folder-icon"><Folder size={18} /></div>
          <div className="asn-drive-folder-meta">
            <div className="asn-drive-folder-name">{assignmentTitle}</div>
            <div className="asn-drive-folder-path">TEEPO / {courseTitle} / מטלות</div>
          </div>
        </div>
        <div className="asn-drive-actions">
          <a
            href={`https://drive.google.com/drive/folders/${folderId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="asn-icon-btn"
            title="פתח ב-Drive"
          >
            <ExternalLink size={16} />
          </a>
          <button type="button" className="asn-icon-btn" title="העלאה">
            <Upload size={16} />
          </button>
        </div>
      </div>

      {error ? (
        <div className="asn-drive-error">
          <AlertCircle size={14} /> שגיאה בטעינת התיקייה
        </div>
      ) : loading ? (
        <div className="asn-drive-loading">
          <Loader2 size={16} className="sync-icon-spin" /> טוען קבצים…
        </div>
      ) : previewFiles.length === 0 ? (
        <div className="asn-drive-empty">אין קבצים בתיקייה עדיין.</div>
      ) : (
        <div className="asn-drive-files">
          {previewFiles.map(f => (
            <a
              key={f.id}
              href={f.webViewLink || `https://drive.google.com/file/d/${f.id}/view`}
              target="_blank"
              rel="noopener noreferrer"
              className="asn-drive-file"
              title={f.name}
            >
              <FileText size={14} />
              <span className="asn-drive-file-name">{f.name}</span>
              {f.size && (
                <span className="asn-drive-file-size">{formatBytes(parseInt(f.size, 10) || 0)}</span>
              )}
            </a>
          ))}
        </div>
      )}

      <button type="button" className="asn-upload">
        <Upload size={20} />
        <div>
          <strong>גרור קבצים לכאן</strong>
          <small> או לחץ להעלאה ידנית</small>
        </div>
      </button>
    </div>
  )
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}
