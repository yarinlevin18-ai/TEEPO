'use client'

/**
 * /assignments — academic-assignments page (locked-design v2).
 *
 * Visual structure mirrors `teepo-design/mockup_tasks_v2.html`.
 * Page head: title + glass summary pills + gradient "מטלה חדשה" button.
 * 3 tabs: הכל (flat by due) / לפי תאריך (grouped) / לפי קורס (grouped).
 * Task card: course badge + colored left stripe, title, due-date pill,
 * group/solo indicator, priority chip, "פתח בדרייב" button.
 *
 * Mechanics preserved verbatim from the previous master-detail page:
 * useDB() hooks, the existing add-assignment modal, the existing detail
 * panel (now inline under the clicked card so the list stays clean).
 *
 * Real data only: course colors derive from the same paletteIdx hash
 * used elsewhere; collaborator names + Drive folder URLs come from the
 * Assignment / Course models. Missing values render clean empty states
 * or disabled controls — never fabricated mockup samples.
 */

import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Plus, FileText, Clock, ExternalLink, MoreHorizontal,
  CheckCircle2, Folder, Upload, AlertCircle, Loader2, GripVertical, Sparkles,
  User as UserIcon, Users as UsersIcon, List as ListIcon,
  Calendar as CalendarIcon, BookOpen as BookOpenIcon,
} from 'lucide-react'
import { useDB } from '@/lib/db-context'
import { useDriveFiles } from '@/lib/use-drive-files'
import { api } from '@/lib/api-client'
import SyncAllButton from '@/components/sync/SyncAllButton'
import type { Assignment, AssignmentTask, Course } from '@/types'

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
const HEB_WEEKDAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת']

function daysUntil(deadline?: string): number | null {
  if (!deadline) return null
  const d = new Date(deadline)
  if (Number.isNaN(d.getTime())) return null
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const dd = new Date(d); dd.setHours(0, 0, 0, 0)
  return Math.round((dd.getTime() - today.getTime()) / 86_400_000)
}

type DueTone = 'urgent' | 'soon' | 'normal' | 'calm' | 'undated'
interface DuePill { label: string; tone: DueTone }

/** Compose the short due-date label shown on the v2 card pill.
 *  Tone drives the color (urgent/soon/normal/calm/undated). */
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
  if (dn <= 4) {
    const wd = HEB_WEEKDAYS[d.getDay()]
    return { label: hasTime ? `${wd} · ${hh}:${mm}` : wd, tone: 'soon' }
  }
  if (dn <= 14) return { label: `${d.getDate()} ב${HEB_MONTHS[d.getMonth()]}`, tone: 'normal' }
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

/** True iff the assignment is "open" (counts toward the פתוחות pill). */
function isOpen(a: Assignment): boolean {
  return a.status === 'todo' || a.status === 'in_progress'
}

/** True iff the assignment hints at group work. We have no boolean on the
 *  model yet — looks for קבוצתי/group keywords in title or description.
 *  Conservative on false-positives. */
function isGroupWork(a: Assignment): { group: boolean; collaborator?: string } {
  const hay = `${a.title} ${a.description ?? ''}`
  const group = /(קבוצת|זוגית|בזוגות|בקבוצה|group\b|pair\b)/i.test(hay)
  if (!group) return { group: false }
  const heb = a.description?.match(/עם\s+([֐-׿\w][֐-׿\w\s'"-]{0,40}?)(?:[\.,]|$)/)
  const eng = a.description?.match(/\bwith\s+([\w][\w\s'-]{0,40}?)(?:[\.,]|$)/i)
  const collaborator = (heb?.[1] || eng?.[1])?.trim()
  return { group: true, collaborator }
}

const STATUS_LABEL: Record<Assignment['status'], string> = {
  todo: 'לא התחלתי',
  in_progress: 'בתהליך',
  submitted: 'הוגש',
  graded: 'נבדק',
}
const PRIORITY_LABEL: Record<Assignment['priority'], string> = {
  high: 'דחוף',
  medium: 'רגיל',
  low: 'נמוכה',
}
const PRIORITY_CLASS: Record<Assignment['priority'], 'high' | 'med' | 'low'> = {
  high: 'high', medium: 'med', low: 'low',
}

type TabKey = 'all' | 'deadline' | 'course'
interface DeadlineBucket {
  key: 'week' | 'next' | 'later' | 'undated'
  label: string
  icon: string
  items: Assignment[]
}

const LIST_STAGGER = 0.05
const CARD_DURATION = 0.32

// ── Page ─────────────────────────────────────────────────────────────────

export default function AssignmentsPage() {
  const { db, ready, createAssignment, updateAssignment, deleteAssignment } = useDB()
  const assignments = useMemo(() => (db?.assignments ?? []) as Assignment[], [db?.assignments])
  const courses = useMemo(() => (db?.courses ?? []) as Course[], [db?.courses])

  const courseById = useMemo(() => {
    const m = new Map<string, Course>()
    for (const c of courses) m.set(c.id, c)
    return m
  }, [courses])

  const [tab, setTab] = useState<TabKey>('all')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const [showAdd, setShowAdd] = useState(false)
  const [addForm, setAddForm] = useState({ title: '', description: '', deadline: '', course_id: '' })
  const [adding, setAdding] = useState(false)

  const [editBuffer, setEditBuffer] = useState<Partial<Assignment> | null>(null)

  // Page-head summary pill counts — derived from real data, no fabrication.
  const summary = useMemo(() => {
    let urgent = 0, open = 0, groupCount = 0
    for (const a of assignments) {
      if (!isOpen(a)) continue
      open++
      const dn = daysUntil(a.deadline)
      if (dn !== null && dn <= 1) urgent++
      if (isGroupWork(a).group) groupCount++
    }
    return { urgent, open, group: groupCount }
  }, [assignments])

  const sorted = useMemo(() => {
    return [...assignments].sort((a, b) => {
      const da = daysUntil(a.deadline) ?? Number.POSITIVE_INFINITY
      const db_ = daysUntil(b.deadline) ?? Number.POSITIVE_INFINITY
      return da - db_
    })
  }, [assignments])

  const deadlineBuckets = useMemo<DeadlineBucket[]>(() => {
    const week: Assignment[] = []
    const next: Assignment[] = []
    const later: Assignment[] = []
    const undated: Assignment[] = []
    for (const a of sorted) {
      const dn = daysUntil(a.deadline)
      if (dn === null) { undated.push(a); continue }
      if (dn <= 7) week.push(a)
      else if (dn <= 14) next.push(a)
      else later.push(a)
    }
    const buckets: DeadlineBucket[] = []
    if (week.length)    buckets.push({ key: 'week',  label: 'השבוע',     icon: '🔥', items: week })
    if (next.length)    buckets.push({ key: 'next',  label: 'השבוע הבא', icon: '📅', items: next })
    if (later.length)   buckets.push({ key: 'later', label: 'בהמשך',     icon: '💭', items: later })
    if (undated.length) buckets.push({ key: 'undated', label: 'ללא תאריך', icon: '⏳', items: undated })
    return buckets
  }, [sorted])

  // Course-grouped — sorted by earliest due assignment so "תאריך הגשה
  // הקרוב ביותר" surfaces first.
  const courseBuckets = useMemo(() => {
    const map = new Map<string, Assignment[]>()
    const noCourse: Assignment[] = []
    for (const a of sorted) {
      if (!a.course_id) { noCourse.push(a); continue }
      const arr = map.get(a.course_id) ?? []
      arr.push(a)
      map.set(a.course_id, arr)
    }
    const buckets = Array.from(map.entries()).map(([cid, items]) => {
      const c = courseById.get(cid)
      const earliest = items.reduce((min, a) => {
        const dn = daysUntil(a.deadline) ?? Number.POSITIVE_INFINITY
        return Math.min(min, dn)
      }, Number.POSITIVE_INFINITY)
      return { courseId: cid, course: c, items, earliest }
    })
    buckets.sort((a, b) => a.earliest - b.earliest)
    if (noCourse.length) {
      buckets.push({ courseId: '__none', course: undefined, items: noCourse, earliest: Number.POSITIVE_INFINITY })
    }
    return buckets
  }, [sorted, courseById])

  const expanded = useMemo(
    () => (expandedId ? assignments.find(a => a.id === expandedId) ?? null : null),
    [expandedId, assignments],
  )
  const expandedCourse = expanded?.course_id ? courseById.get(expanded.course_id) ?? null : null
  const expandedPalette = expanded ? COURSE_PALETTE[paletteIdx(expanded.course_id || expanded.id)] : COURSE_PALETTE[0]

  useEffect(() => {
    if (!expanded) { setEditBuffer(null); return }
    setEditBuffer({
      title: expanded.title,
      description: expanded.description ?? '',
      status: expanded.status,
      priority: expanded.priority,
      deadline: expanded.deadline,
    })
  }, [expanded])

  const isDirty = useMemo(() => {
    if (!expanded || !editBuffer) return false
    return (editBuffer.title !== expanded.title) ||
      ((editBuffer.description ?? '') !== (expanded.description ?? '')) ||
      (editBuffer.status !== expanded.status) ||
      (editBuffer.priority !== expanded.priority) ||
      ((editBuffer.deadline ?? '') !== (expanded.deadline ?? ''))
  }, [editBuffer, expanded])

  const onSaveExpanded = async () => {
    if (!expanded || !editBuffer || !isDirty) return
    await updateAssignment(expanded.id, {
      title: editBuffer.title,
      description: editBuffer.description,
      status: editBuffer.status as Assignment['status'],
      priority: editBuffer.priority as Assignment['priority'],
      deadline: editBuffer.deadline,
    })
  }
  const onCancelEdit = () => {
    if (!expanded) return
    setEditBuffer({
      title: expanded.title,
      description: expanded.description ?? '',
      status: expanded.status,
      priority: expanded.priority,
      deadline: expanded.deadline,
    })
  }
  const onDeleteExpanded = async () => {
    if (!expanded) return
    if (!confirm(`למחוק את "${expanded.title}"?`)) return
    await deleteAssignment(expanded.id)
    setExpandedId(null)
  }
  const onToggleSubtask = async (st: AssignmentTask) => {
    if (!expanded) return
    const next = (expanded.assignment_tasks ?? []).map(x =>
      x.id === st.id ? { ...x, is_completed: !x.is_completed } : x,
    )
    await updateAssignment(expanded.id, { assignment_tasks: next })
  }
  const onAddSubtask = async () => {
    if (!expanded) return
    const title = window.prompt('שלב חדש:')
    if (!title?.trim()) return
    const next: AssignmentTask[] = [
      ...(expanded.assignment_tasks ?? []),
      {
        id: `at_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        assignment_id: expanded.id,
        title: title.trim(),
        order_index: (expanded.assignment_tasks?.length ?? 0) + 1,
        is_completed: false,
      },
    ]
    await updateAssignment(expanded.id, { assignment_tasks: next })
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
      setExpandedId(created.id)
    } finally {
      setAdding(false)
    }
  }

  const toggleExpand = (id: string) => {
    setExpandedId(prev => (prev === id ? null : id))
  }

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="cream-page tasks-v2-page" dir="rtl">
      <main className="tasks-v2-main">

        {/* Page head */}
        <header className="tasks-v2-head">
          <div className="tasks-v2-title-block">
            <h1>המטלות שלי</h1>
            <div className="tasks-v2-summary" aria-label="סיכום מטלות">
              <span className="tasks-v2-pill urgent">
                דחוף · <span className="num">{summary.urgent}</span>
              </span>
              <span className="tasks-v2-pill">
                פתוחות · <span className="num">{summary.open}</span>
              </span>
              <span className="tasks-v2-pill">
                קבוצתיות · <span className="num">{summary.group}</span>
              </span>
            </div>
          </div>
          <div className="tasks-v2-head-actions">
            <SyncAllButton variant="ghost" />
            <button
              type="button"
              className="tasks-v2-add-btn"
              onClick={() => setShowAdd(true)}
            >
              <Plus size={16} strokeWidth={2.5} />
              מטלה חדשה
            </button>
          </div>
        </header>

        {/* Tabs */}
        <div className="tasks-v2-tabs" role="tablist" aria-label="תצוגות מטלות">
          <TabButton active={tab === 'all'}      onClick={() => setTab('all')}      icon={<ListIcon size={14} />}     label="הכל"        count={assignments.length} />
          <TabButton active={tab === 'deadline'} onClick={() => setTab('deadline')} icon={<CalendarIcon size={14} />} label="לפי תאריך" />
          <TabButton active={tab === 'course'}   onClick={() => setTab('course')}   icon={<BookOpenIcon size={14} />} label="לפי קורס"  />
        </div>

        {/* PANELS */}
        {!ready ? (
          <div className="tasks-v2-list">
            {[0, 1, 2].map(i => <div key={i} className="tasks-v2-skel" />)}
          </div>
        ) : assignments.length === 0 ? (
          <EmptyState onAdd={() => setShowAdd(true)} />
        ) : tab === 'all' ? (
          <FlatPanel
            items={sorted}
            courseById={courseById}
            expandedId={expandedId}
            onToggle={toggleExpand}
            expanded={expanded}
            editBuffer={editBuffer}
            setBuffer={(p) => setEditBuffer(b => ({ ...b!, ...p }))}
            expandedCourse={expandedCourse}
            expandedPalette={expandedPalette}
            isDirty={isDirty}
            onToggleSubtask={onToggleSubtask}
            onAddSubtask={onAddSubtask}
            onSave={onSaveExpanded}
            onCancel={onCancelEdit}
            onDelete={onDeleteExpanded}
          />
        ) : tab === 'deadline' ? (
          deadlineBuckets.length === 0 ? (
            <EmptyState onAdd={() => setShowAdd(true)} />
          ) : (
            deadlineBuckets.map(b => (
              <section key={b.key} className={`tasks-v2-section tone-${b.key}`}>
                <div className="tasks-v2-sec-head">
                  <span className="tasks-v2-sec-icon" aria-hidden>{b.icon}</span>
                  <span className="tasks-v2-sec-label">{b.label}</span>
                  <span className="tasks-v2-sec-count">
                    {b.items.length} {b.items.length === 1 ? 'מטלה' : 'מטלות'}
                  </span>
                </div>
                <FlatPanel
                  items={b.items}
                  courseById={courseById}
                  expandedId={expandedId}
                  onToggle={toggleExpand}
                  expanded={expanded}
                  editBuffer={editBuffer}
                  setBuffer={(p) => setEditBuffer(b => ({ ...b!, ...p }))}
                  expandedCourse={expandedCourse}
                  expandedPalette={expandedPalette}
                  isDirty={isDirty}
                  onToggleSubtask={onToggleSubtask}
                  onAddSubtask={onAddSubtask}
                  onSave={onSaveExpanded}
                  onCancel={onCancelEdit}
                  onDelete={onDeleteExpanded}
                />
              </section>
            ))
          )
        ) : (
          // tab === 'course'
          courseBuckets.length === 0 ? (
            <EmptyState onAdd={() => setShowAdd(true)} />
          ) : (
            courseBuckets.map(({ courseId, course, items }) => {
              const pal = COURSE_PALETTE[paletteIdx(courseId)]
              const label = course?.title ?? 'ללא קורס'
              return (
                <section key={courseId} className="tasks-v2-section">
                  <div className="tasks-v2-sec-head">
                    <span className="tasks-v2-sec-icon" aria-hidden style={{ color: pal.color }}>📘</span>
                    <span className="tasks-v2-sec-label">{label}</span>
                    <span className="tasks-v2-sec-count">
                      {items.filter(isOpen).length} פתוחות · {items.length} סה״כ
                    </span>
                  </div>
                  <FlatPanel
                    items={items}
                    courseById={courseById}
                    expandedId={expandedId}
                    onToggle={toggleExpand}
                    expanded={expanded}
                    editBuffer={editBuffer}
                    setBuffer={(p) => setEditBuffer(b => ({ ...b!, ...p }))}
                    expandedCourse={expandedCourse}
                    expandedPalette={expandedPalette}
                    isDirty={isDirty}
                    onToggleSubtask={onToggleSubtask}
                    onAddSubtask={onAddSubtask}
                    onSave={onSaveExpanded}
                    onCancel={onCancelEdit}
                    onDelete={onDeleteExpanded}
                  />
                </section>
              )
            })
          )
        )}
      </main>

      {/* Add modal — unchanged mechanics from the previous page. */}
      {showAdd && (
        <div
          className="tasks-v2-modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="tasks-v2-add-title"
          onClick={e => { if (e.target === e.currentTarget) setShowAdd(false) }}
        >
          <div className="tasks-v2-modal">
            <header className="tasks-v2-modal-head">
              <h2 id="tasks-v2-add-title">מטלה חדשה</h2>
              <button type="button" onClick={() => setShowAdd(false)} aria-label="סגור">×</button>
            </header>
            <div className="tasks-v2-modal-body">
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
            <footer className="tasks-v2-modal-foot">
              <button type="button" className="tasks-v2-btn-ghost" onClick={() => setShowAdd(false)}>
                ביטול
              </button>
              <button
                type="button"
                className="tasks-v2-btn-primary"
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
// Tab button — semantic role + aria-selected for screen readers.
// ─────────────────────────────────────────────────────────────────────────

function TabButton({
  active, onClick, icon, label, count,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
  count?: number
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      className={`tasks-v2-tab-btn ${active ? 'active' : ''}`}
      onClick={onClick}
    >
      {icon}
      {label}
      {typeof count === 'number' && <span className="tasks-v2-tab-count">{count}</span>}
    </button>
  )
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="tasks-v2-empty">
      <span className="em" aria-hidden>🌱</span>
      <p>אין מטלות פתוחות. סנכרן מ-Moodle או צור מטלה חדשה כדי להתחיל.</p>
      <button type="button" className="tasks-v2-btn-primary" onClick={onAdd}>
        <Plus size={14} /> מטלה חדשה
      </button>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// FlatPanel — vertical list of v2 task cards, with an inline AnimatePresence
// detail panel under whichever card is expanded.
// ─────────────────────────────────────────────────────────────────────────

interface FlatPanelProps {
  items: Assignment[]
  courseById: Map<string, Course>
  expandedId: string | null
  onToggle: (id: string) => void

  // Detail wiring (only used by the currently-expanded card)
  expanded: Assignment | null
  editBuffer: Partial<Assignment> | null
  setBuffer: (p: Partial<Assignment>) => void
  expandedCourse: Course | null
  expandedPalette: { color: string; soft: string; deep: string }
  isDirty: boolean
  onToggleSubtask: (st: AssignmentTask) => void
  onAddSubtask: () => void
  onSave: () => void
  onCancel: () => void
  onDelete: () => void
}

function FlatPanel(props: FlatPanelProps) {
  const { items, courseById, expandedId, onToggle } = props
  return (
    <div className="tasks-v2-list">
      <AnimatePresence initial={false}>
        {items.map((a, idx) => {
          const pal = COURSE_PALETTE[paletteIdx(a.course_id || a.id)]
          const course = a.course_id ? courseById.get(a.course_id) : null
          const due = duePill(a.deadline, a.status)
          const grp = isGroupWork(a)
          const isExpanded = expandedId === a.id
          const driveFolderId = course?.drive_folder_ids?.assignments
          const driveUrl = driveFolderId
            ? `https://drive.google.com/drive/folders/${driveFolderId}`
            : undefined

          return (
            <motion.div
              key={a.id}
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 12 }}
              transition={{
                duration: CARD_DURATION,
                delay: Math.min(idx * LIST_STAGGER, 0.4),
                ease: [0.22, 1, 0.36, 1],
              }}
              className={`tasks-v2-card-wrap ${isExpanded ? 'is-expanded' : ''}`}
              style={{
                ['--course-color' as any]: pal.color,
                ['--course-soft' as any]: pal.soft,
                ['--course-deep' as any]: pal.deep,
              }}
            >
              <button
                type="button"
                className="tasks-v2-card"
                onClick={() => onToggle(a.id)}
                aria-expanded={isExpanded}
              >
                <span className="tasks-v2-stripe" aria-hidden />
                <div className="tasks-v2-card-left">
                  <span className="tasks-v2-course-badge">
                    <span className="dot" />
                    {course?.title ?? 'ללא קורס'}
                  </span>
                </div>
                <div className="tasks-v2-card-body">
                  <div className="tasks-v2-card-title">{a.title}</div>
                  <div className="tasks-v2-card-meta">
                    <span className={`tasks-v2-meta-item due tone-${due.tone}`}>
                      <Clock size={12} />
                      {due.label}
                    </span>
                    {grp.group ? (
                      <span className="tasks-v2-meta-item group">
                        <UsersIcon size={12} />
                        {grp.collaborator ? `קבוצתי · ${grp.collaborator}` : 'קבוצתי'}
                      </span>
                    ) : (
                      <span className="tasks-v2-meta-item solo">
                        <UserIcon size={12} />
                        יחיד
                      </span>
                    )}
                  </div>
                </div>
                <div className="tasks-v2-card-right">
                  <span className={`tasks-v2-priority ${PRIORITY_CLASS[a.priority]}`}>
                    {PRIORITY_LABEL[a.priority]}
                  </span>
                  {driveUrl ? (
                    <a
                      href={driveUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="tasks-v2-drive-btn"
                      onClick={e => e.stopPropagation()}
                      aria-label={`פתח את תיקיית הקורס ב-Drive — ${course?.title ?? ''}`}
                    >
                      <Folder size={12} />
                      פתח בדרייב
                    </a>
                  ) : (
                    <span
                      className="tasks-v2-drive-btn disabled"
                      title="אין תיקיית דרייב — סנכרן מ-Moodle"
                      aria-label="אין תיקיית דרייב — סנכרן מ-Moodle"
                    >
                      <Folder size={12} />
                      פתח בדרייב
                    </span>
                  )}
                </div>
              </button>

              <AnimatePresence initial={false}>
                {isExpanded && props.expanded?.id === a.id && props.editBuffer && (
                  <motion.section
                    key="detail"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                    className="tasks-v2-detail"
                    style={{
                      ['--course-color' as any]: props.expandedPalette.color,
                      ['--course-soft' as any]: props.expandedPalette.soft,
                      ['--course-deep' as any]: props.expandedPalette.deep,
                    }}
                  >
                    <ExpandedDetail
                      assignment={props.expanded}
                      buffer={props.editBuffer}
                      setBuffer={props.setBuffer}
                      course={props.expandedCourse}
                      onToggleSubtask={props.onToggleSubtask}
                      onAddSubtask={props.onAddSubtask}
                      onSave={props.onSave}
                      onCancel={props.onCancel}
                      onDelete={props.onDelete}
                      isDirty={props.isDirty}
                    />
                  </motion.section>
                )}
              </AnimatePresence>
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// ExpandedDetail — inline detail panel under a clicked task card.
// Mirrors the previous master-detail right-pane mechanics (status / priority
// pickers, description, Drive folder, subtasks, save/cancel/delete) — only
// the styling moved to the v2 cream container.
// ─────────────────────────────────────────────────────────────────────────

function ExpandedDetail({
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
    <div className="tasks-v2-detail-inner">
      <div className="tasks-v2-detail-head">
        <div className="tasks-v2-detail-title-block">
          <div className="tasks-v2-detail-course">
            <span className="dot" aria-hidden />
            {courseDisplayName}
          </div>
          <h2>{assignment.title}</h2>
          <div className="tasks-v2-detail-source">
            {assignment.deadline ? <>הגשה: <strong>{formatDateLong(assignment.deadline)}</strong></> : 'ללא תאריך הגשה'}
          </div>
        </div>
        <div className="tasks-v2-detail-actions">
          <button type="button" className="tasks-v2-icon-btn" title="עוד" aria-label="פעולות נוספות">
            <MoreHorizontal size={16} />
          </button>
        </div>
      </div>

      <div className="tasks-v2-meta-row">
        <div className="tasks-v2-meta-card deadline">
          <div className="tasks-v2-meta-label">תאריך הגשה</div>
          <div className="tasks-v2-meta-value">
            <Clock size={14} />
            {assignment.deadline ? formatDateLong(assignment.deadline) : '—'}
          </div>
        </div>
        <div className="tasks-v2-meta-card">
          <div className="tasks-v2-meta-label">סטטוס</div>
          <div className="tasks-v2-meta-value">
            <CheckCircle2 size={14} />
            {STATUS_LABEL[assignment.status]}
          </div>
        </div>
        <div className="tasks-v2-meta-card">
          <div className="tasks-v2-meta-label">זמן משוער</div>
          <div className="tasks-v2-meta-value">
            <Clock size={14} />
            {hoursEst > 0 ? `${hoursEst} שעות` : '—'}
          </div>
        </div>
      </div>

      <section className="tasks-v2-sub-section">
        <header className="tasks-v2-sub-head">
          <h3><CheckCircle2 size={16} /> סטטוס ועדיפות</h3>
        </header>
        <div className="tasks-v2-pickers">
          <div className="tasks-v2-picker-row">
            {(['todo', 'in_progress', 'submitted', 'graded'] as const).map(s => (
              <button
                key={s}
                type="button"
                className={`tasks-v2-status-opt ${buffer.status === s ? 'on' : ''}`}
                onClick={() => setBuffer({ status: s })}
              >
                <span className="sdot" aria-hidden />
                {STATUS_LABEL[s]}
              </button>
            ))}
          </div>
          <div className="tasks-v2-picker-row">
            {(['high', 'medium', 'low'] as const).map(p => (
              <button
                key={p}
                type="button"
                className={`tasks-v2-status-opt priority-opt ${buffer.priority === p ? `on ${PRIORITY_CLASS[p]}` : ''}`}
                onClick={() => setBuffer({ priority: p })}
              >
                <span className="sdot" aria-hidden />
                {PRIORITY_LABEL[p]}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="tasks-v2-sub-section">
        <header className="tasks-v2-sub-head">
          <h3><FileText size={16} /> תיאור המטלה</h3>
        </header>
        <textarea
          className="tasks-v2-desc-box"
          value={buffer.description ?? ''}
          onChange={e => setBuffer({ description: e.target.value })}
          rows={5}
          placeholder="הוסף תיאור — מה צריך להגיש, באיזה פורמט, באילו שאלות להתמקד…"
        />
      </section>

      <section className="tasks-v2-sub-section">
        <header className="tasks-v2-sub-head">
          <h3><Folder size={16} /> תיקיית Drive מקושרת</h3>
        </header>
        {driveFolderId ? (
          <DrivePanel folderId={driveFolderId} courseTitle={courseDisplayName} assignmentTitle={assignment.title} />
        ) : (
          <div className="tasks-v2-drive-empty-cta">
            <Folder size={20} />
            <span>אין תיקיית דרייב מסונכרנת לקורס. סווג את הקורס תחת תואר/שנה/סמסטר ב-״המוח״ — תיקיית Drive תיווצר אוטומטית.</span>
          </div>
        )}
      </section>

      <section className="tasks-v2-sub-section">
        <header className="tasks-v2-sub-head">
          <h3><CheckCircle2 size={16} /> פירוק למשימות</h3>
          <button type="button" className="tasks-v2-sub-link" onClick={onAddSubtask}>+ הוסף שלב</button>
        </header>
        {subtasks.length === 0 ? (
          <div className="tasks-v2-subtask-empty">אין שלבים עדיין. השתמש ב-AI כדי לפרק את המטלה לשלבים, או הוסף ידנית.</div>
        ) : (
          <ul className="tasks-v2-subtasks">
            {subtasks.map(st => (
              <li key={st.id} className={`tasks-v2-subtask ${st.is_completed ? 'done' : ''}`}>
                <button
                  type="button"
                  className={`tasks-v2-checkbox ${st.is_completed ? 'checked' : ''}`}
                  onClick={() => onToggleSubtask(st)}
                  aria-label={st.is_completed ? 'בטל סימון' : 'סמן כהושלם'}
                >
                  {st.is_completed && <CheckCircle2 size={11} />}
                </button>
                <GripVertical size={13} className="tasks-v2-subtask-grip" aria-hidden />
                <span className="tasks-v2-subtask-title">{st.title}</span>
                {typeof st.estimated_hours === 'number' && st.estimated_hours > 0 && (
                  <span className="tasks-v2-subtask-hours">~{st.estimated_hours} שעות</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <footer className="tasks-v2-detail-foot">
        <button type="button" className="tasks-v2-danger-link" onClick={onDelete}>מחק מטלה</button>
        <div className="tasks-v2-detail-foot-right">
          <button
            type="button"
            className="tasks-v2-btn-ghost"
            onClick={onCancel}
            disabled={!isDirty}
          >
            בטל שינויים
          </button>
          <button
            type="button"
            className="tasks-v2-btn-primary"
            onClick={onSave}
            disabled={!isDirty}
          >
            שמור
          </button>
        </div>
      </footer>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// DrivePanel — uses the existing useDriveFiles hook to render real files.
// Visuals updated to match the v2 cream palette.
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
    <div className="tasks-v2-drive-panel">
      <div className="tasks-v2-drive-head">
        <div className="tasks-v2-drive-folder">
          <div className="tasks-v2-drive-folder-icon"><Folder size={18} /></div>
          <div className="tasks-v2-drive-folder-meta">
            <div className="tasks-v2-drive-folder-name">{assignmentTitle}</div>
            <div className="tasks-v2-drive-folder-path">TEEPO / {courseTitle} / מטלות</div>
          </div>
        </div>
        <div className="tasks-v2-drive-actions">
          <a
            href={`https://drive.google.com/drive/folders/${folderId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="tasks-v2-icon-btn"
            title="פתח ב-Drive"
            aria-label="פתח ב-Drive"
          >
            <ExternalLink size={16} />
          </a>
          <button type="button" className="tasks-v2-icon-btn" title="העלאה" aria-label="העלאה">
            <Upload size={16} />
          </button>
        </div>
      </div>

      {error ? (
        <div className="tasks-v2-drive-error">
          <AlertCircle size={14} /> שגיאה בטעינת התיקייה
        </div>
      ) : loading ? (
        <div className="tasks-v2-drive-loading">
          <Loader2 size={16} className="sync-icon-spin" /> טוען קבצים…
        </div>
      ) : previewFiles.length === 0 ? (
        <div className="tasks-v2-drive-empty">אין קבצים בתיקייה עדיין.</div>
      ) : (
        <div className="tasks-v2-drive-files">
          {previewFiles.map(f => (
            <a
              key={f.id}
              href={f.webViewLink || `https://drive.google.com/file/d/${f.id}/view`}
              target="_blank"
              rel="noopener noreferrer"
              className="tasks-v2-drive-file"
              title={f.name}
            >
              <FileText size={14} />
              <span className="tasks-v2-drive-file-name">{f.name}</span>
              {f.size && (
                <span className="tasks-v2-drive-file-size">{formatBytes(parseInt(f.size, 10) || 0)}</span>
              )}
            </a>
          ))}
        </div>
      )}
    </div>
  )
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}
